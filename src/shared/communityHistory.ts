import type { CountryResult } from "./countryComparison";
import { parseGoogleFlightsMatrixSearch } from "./googleFlightsBooking";
import type { NormalizedItinerary } from "./types";

export { COMMUNITY_CONSENT_VERSION, DEFAULT_HISTORY_API_ORIGIN, historyBaseUrl } from "./communitySettings";
export type HistoryCabin = "COACH" | "PREMIUM-COACH" | "BUSINESS" | "FIRST";
export type MarketQuery = {
  slices: { origin: string; destination: string }[];
  carriers: string[];
  cabin: HistoryCabin;
  tripType: "one-way" | "round-trip" | "multi-city";
  countries: string[];
};
export type MarketObservation = Omit<MarketQuery, "countries"> & {
  contractVersion: "v1";
  idempotencyKey: string;
  source: "google-flights-booking";
  slices: { origin: string; destination: string; departureDate: string }[];
  baselineCountry: string;
  currency: string;
  observedAt: string;
  markets: {
    country: string;
    status: CountryResult["status"];
    optionCount: number;
    cheapestPrice?: number;
    directPrice?: number;
    options: { provider: string; price: number; isDirect: boolean }[];
  }[];
};
export type FareQuery = {
  origin: string;
  destination: string;
  carrier: string;
  cabin: HistoryCabin;
  departureDate: string;
  currency: string;
  price: number;
  tripType: "one-way";
  passengerCount: 1;
};
export type FareObservation = FareQuery & {
  contractVersion: "v1";
  idempotencyKey: string;
  source: "ita-matrix";
  bookingClass: string;
  fareBasis?: string;
  flightNumber: string;
};
export type FareEstimate = {
  status: "historical-estimate" | "unknown";
  candidates: { bookingClass: string; share: number; sampleCount: number }[];
};

export function marketQueryForUrl(url: string, countries: string[]): MarketQuery | null {
  const search = parseGoogleFlightsMatrixSearch(url);
  if (!search || search.carriers.length === 0 || search.slices.length > 4) return null;
  return {
    slices: search.slices.map(({ origin, destination }) => ({ origin, destination })),
    carriers: search.carriers,
    cabin: search.cabin,
    tripType: search.tripType,
    countries: countries.filter((country) => /^[A-Z]{2}$/.test(country)).slice(0, 250),
  };
}

export function buildMarketObservation(
  url: string,
  baselineCountry: string,
  results: CountryResult[],
  idempotencyKey: string,
): MarketObservation | null {
  const query = marketQueryForUrl(
    url,
    results.map((result) => result.country),
  );
  const search = parseGoogleFlightsMatrixSearch(url);
  if (!query || !search || !/^[A-Z]{2}$/.test(baselineCountry)) return null;
  const markets = [...new Map(results.map((r) => [r.country, r])).values()]
    .filter((r) => /^[A-Z]{2}$/.test(r.country))
    .slice(0, 250)
    .map((result) => {
      const options = result.options
        .filter(
          (option) =>
            option.currency === search.currency &&
            Number.isFinite(option.price) &&
            option.price > 0 &&
            option.price <= 10000000 &&
            option.provider.length > 0 &&
            option.provider.length <= 80 &&
            !/[<>]/.test(option.provider) &&
            [...option.provider].every((character) => character.charCodeAt(0) >= 32),
        )
        .slice(0, 100)
        .map(({ provider, price, isDirect }) => ({ provider, price, isDirect }));
      const direct = options.filter((o) => o.isDirect).map((o) => o.price);
      return {
        country: result.country,
        status: result.status,
        optionCount: options.length,
        ...(options.length ? { cheapestPrice: Math.min(...options.map((o) => o.price)) } : {}),
        ...(direct.length ? { directPrice: Math.min(...direct) } : {}),
        options,
      };
    });
  if (markets.filter((m) => m.status === "ready" && m.options.length > 0).length < 2) return null;
  const { countries: _countries, ...context } = query;
  return {
    ...context,
    contractVersion: "v1",
    idempotencyKey,
    source: "google-flights-booking",
    // Do not serialize query.countries, URLs, booking links or page text.
    slices: search.slices.map(({ origin, destination, departureDate }) => ({ origin, destination, departureDate })),
    baselineCountry,
    currency: search.currency,
    observedAt: new Date().toISOString(),
    markets,
  };
}

export function buildFareObservation(itinerary: NormalizedItinerary, idempotencyKey: string): FareObservation | null {
  const segments = itinerary.slices.flatMap((slice) => slice.segments);
  const segment = segments[0];
  if (
    itinerary.tripType !== "one-way" ||
    itinerary.slices.length !== 1 ||
    segments.length !== 1 ||
    itinerary.passengerCount !== 1 ||
    (segment?.fareCarrier !== undefined && segment.fareCarrier !== segment.carrier) ||
    !segment ||
    !/^[A-Z]$/.test(segment.bookingClass || "") ||
    !/^[0-9]{1,4}[A-Z]?$/.test(segment.flightNumber || "") ||
    !segment.departure ||
    !itinerary.currency ||
    !Number.isFinite(itinerary.totalPrice) ||
    !itinerary.totalPrice ||
    itinerary.totalPrice <= 0
  )
    return null;
  const cabins = {
    economy: "COACH",
    "premium-economy": "PREMIUM-COACH",
    business: "BUSINESS",
    first: "FIRST",
  } as const;
  if (segment.cabin === "unknown") return null;
  return {
    contractVersion: "v1",
    idempotencyKey,
    source: "ita-matrix",
    origin: segment.origin,
    destination: segment.destination,
    carrier: segment.carrier,
    cabin: cabins[segment.cabin],
    departureDate: segment.departure.slice(0, 10),
    currency: itinerary.currency,
    price: itinerary.totalPrice,
    tripType: "one-way",
    passengerCount: 1,
    bookingClass: segment.bookingClass || "",
    flightNumber: segment.flightNumber || "",
    ...(segment.fareBasis && /^[A-Z0-9/-]{1,32}$/.test(segment.fareBasis) ? { fareBasis: segment.fareBasis } : {}),
  };
}

export function orderHistoricalCountries(countries: string[], response: unknown): string[] {
  if (!isRecord(response) || !Array.isArray(response.recommendations)) return countries;
  const scores = new Map<string, number>();
  for (const row of response.recommendations) {
    if (
      !isRecord(row) ||
      typeof row.country !== "string" ||
      typeof row.relativePrice !== "number" ||
      !Number.isFinite(row.relativePrice) ||
      row.relativePrice < 1 ||
      typeof row.sampleCount !== "number" ||
      row.sampleCount < 3
    )
      continue;
    scores.set(row.country, row.relativePrice);
  }
  return [...countries].sort((a, b) => (scores.get(a) ?? Infinity) - (scores.get(b) ?? Infinity));
}

export function validatedFareEstimate(value: unknown): FareEstimate {
  const unknown: FareEstimate = { status: "unknown", candidates: [] };
  if (!isRecord(value) || value.status !== "historical-estimate" || !Array.isArray(value.candidates)) return unknown;
  const candidates = value.candidates
    .filter(
      (c): c is FareEstimate["candidates"][number] =>
        isRecord(c) &&
        typeof c.bookingClass === "string" &&
        /^[A-Z]$/.test(c.bookingClass) &&
        typeof c.share === "number" &&
        Number.isFinite(c.share) &&
        c.share > 0 &&
        c.share <= 1 &&
        typeof c.sampleCount === "number" &&
        Number.isInteger(c.sampleCount) &&
        c.sampleCount >= 3,
    )
    .slice(0, 26);
  return candidates.length ? { status: "historical-estimate", candidates } : unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** A search row needs a complete single-segment identity and explicit one-adult context. */
export function fareQueryForSearchRow(
  url: string,
  row: { itineraryKey?: string; currency: string; price: number },
  singleAdult: boolean,
): FareQuery | null {
  const search = parseGoogleFlightsMatrixSearch(url);
  const match = row.itineraryKey?.match(/^([A-Z]{3})-([A-Z]{3})-([A-Z0-9]{2})(\d{1,4}[A-Z]?)-(\d{4}-?\d{2}-?\d{2})$/);
  if (
    !singleAdult ||
    !search ||
    search.tripType !== "one-way" ||
    search.slices.length !== 1 ||
    !match ||
    !/^[A-Z]{3}$/.test(row.currency) ||
    row.currency === "UNKNOWN" ||
    !Number.isFinite(row.price) ||
    row.price <= 0
  )
    return null;
  const [, origin, destination, carrier, , departureDate] = match;
  if (origin !== search.slices[0]?.origin || destination !== search.slices[0]?.destination) return null;
  return {
    origin: origin || "",
    destination: destination || "",
    carrier: carrier || "",
    departureDate: (departureDate || "").replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"),
    cabin: search.cabin,
    currency: row.currency,
    price: row.price,
    tripType: "one-way",
    passengerCount: 1,
  };
}

export function marketQueriesForSearchRows(
  url: string,
  rows: { itineraryKey?: string }[],
  countries: string[],
): MarketQuery[] {
  const selected = marketQueryForUrl(url, countries);
  if (selected) return [selected];
  const search = parseGoogleFlightsMatrixSearch(url);
  if (search?.tripType !== "one-way") return [];
  const queries = new Map<string, MarketQuery>();
  for (const row of rows) {
    const segments = row.itineraryKey
      ?.split("|")
      .map((key) => key.match(/^([A-Z]{3})-([A-Z]{3})-([A-Z0-9]{2})\d{1,4}[A-Z]?-/));
    if (!segments?.length || segments.some((segment) => !segment)) continue;
    if (segments[0]?.[1] !== search.slices[0]?.origin || segments.at(-1)?.[2] !== search.slices[0]?.destination)
      continue;
    const carriers = [...new Set(segments.map((segment) => segment?.[3] || ""))].sort();
    const key = carriers.join(",");
    queries.set(key, {
      slices: search.slices.map(({ origin, destination }) => ({ origin, destination })),
      carriers,
      cabin: search.cabin,
      tripType: search.tripType,
      countries,
    });
    if (queries.size >= 3) break;
  }
  return [...queries.values()];
}
