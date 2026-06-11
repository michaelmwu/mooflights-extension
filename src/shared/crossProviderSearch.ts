import {
  type GoogleFlightsMatrixSearch,
  normalizeGoogleFlightsCurrency,
  parseGoogleFlightsMatrixSearch,
} from "./googleFlightsBooking";
import { skyscannerCountryCodeFromUrl, skyscannerCountryUrl } from "./skyscannerBooking";

const DEFAULT_CURRENCY = "USD";
const DEFAULT_COUNTRY = "US";
const DEFAULT_LOCALE = "en-US";

type RouteSlice = {
  origin: string;
  destination: string;
  date: string;
};

const GOOGLE_LOCATION_TO_SKYSCANNER_CODE: Record<string, string> = {
  "/m/07dfk": "TYOA",
  "/m/04jpl": "LOND",
  "/m/02_286": "NYCA",
  "/m/05qtj": "PARI",
  "/m/030qb3t": "LAXA",
  "/m/0ftkx": "TPET",
  "/m/0ftkxr": "TPET",
};

const SKYSCANNER_LOCATION_TO_GOOGLE_CODE: Record<string, string> = {
  LAXA: "LAX",
  LOND: "LON",
  NYCA: "NYC",
  PARI: "PAR",
  TPET: "TPE",
  TYOA: "TYO",
};

export function crossProviderSearchUrl(currentUrl: string, fallbackCurrency = DEFAULT_CURRENCY): string {
  if (isSkyscannerUrl(currentUrl)) return googleFlightsSearchUrlFromSkyscanner(currentUrl, fallbackCurrency);
  return skyscannerSearchUrlFromGoogleFlights(currentUrl, fallbackCurrency);
}

export function routeSpecificCrossProviderSearchUrl(currentUrl: string, fallbackCurrency = DEFAULT_CURRENCY): string {
  if (isSkyscannerUrl(currentUrl)) return googleFlightsSearchUrlFromSkyscannerUrl(currentUrl, fallbackCurrency, false);
  return skyscannerSearchUrlFromGoogleFlightsUrl(currentUrl, fallbackCurrency, { allowFallback: false });
}

export function skyscannerSearchUrlFromGoogleFlights(currentUrl: string, fallbackCurrency = DEFAULT_CURRENCY): string {
  return skyscannerSearchUrlFromGoogleFlightsUrl(currentUrl, fallbackCurrency, { allowFallback: true });
}

function skyscannerSearchUrlFromGoogleFlightsUrl(
  currentUrl: string,
  fallbackCurrency: string,
  options: { allowFallback: boolean },
): string {
  const context = googleFlightsUrlContext(currentUrl, fallbackCurrency);
  const search = parseGoogleFlightsMatrixSearch(currentUrl, context.currency);
  const routeSlices = search?.slices || googleFlightsRouteSlices(currentUrl);
  const path = skyscannerRoutePath(routeSlices);
  if (!path) return options.allowFallback ? skyscannerFallbackSearchUrl(context) : "";

  const params = new URLSearchParams();
  params.set("adultsv2", "1");
  params.set("cabinclass", skyscannerCabin(search?.cabin || "COACH"));
  params.set("childrenv2", "");
  params.set("currency", context.currency);
  params.set("locale", context.locale);
  params.set("market", context.country);
  params.set("preferdirects", "false");
  if (search ? search.tripType === "one-way" : routeSlices.length === 1) params.set("rtn", "0");

  return skyscannerCountryUrl(
    `https://www.skyscanner.com${path}?${params.toString()}`,
    context.country,
    context.currency,
  );
}

export function googleFlightsSearchUrlFromSkyscanner(currentUrl: string, fallbackCurrency = DEFAULT_CURRENCY): string {
  return googleFlightsSearchUrlFromSkyscannerUrl(currentUrl, fallbackCurrency, true);
}

function googleFlightsSearchUrlFromSkyscannerUrl(
  currentUrl: string,
  fallbackCurrency: string,
  allowFallback: boolean,
): string {
  const context = skyscannerUrlContext(currentUrl, fallbackCurrency);
  const slices = skyscannerRouteSlices(currentUrl);
  const params = new URLSearchParams();
  params.set("curr", context.currency);
  params.set("gl", context.country);
  params.set("hl", context.locale);
  const query = googleFlightsSearchQuery(slices, context.cabin);
  if (query) params.set("q", query);
  if (!query && !allowFallback) return "";
  return `https://www.google.com/travel/flights?${params.toString()}`;
}

function googleFlightsUrlContext(
  currentUrl: string,
  fallbackCurrency: string,
): { country: string; currency: string; locale: string } {
  try {
    const url = new URL(currentUrl);
    return {
      country: normalizeCountry(url.searchParams.get("gl")) || DEFAULT_COUNTRY,
      currency:
        normalizeGoogleFlightsCurrency(url.searchParams.get("curr")) ||
        normalizeGoogleFlightsCurrency(fallbackCurrency) ||
        DEFAULT_CURRENCY,
      locale: normalizeLocale(url.searchParams.get("hl") || url.searchParams.get("locale")) || DEFAULT_LOCALE,
    };
  } catch {
    return {
      country: DEFAULT_COUNTRY,
      currency: normalizeGoogleFlightsCurrency(fallbackCurrency) || DEFAULT_CURRENCY,
      locale: DEFAULT_LOCALE,
    };
  }
}

function skyscannerUrlContext(
  currentUrl: string,
  fallbackCurrency: string,
): { country: string; currency: string; locale: string; cabin: string } {
  try {
    const url = new URL(currentUrl);
    return {
      country: skyscannerCountryCodeFromUrl(currentUrl) || DEFAULT_COUNTRY,
      currency:
        normalizeGoogleFlightsCurrency(url.searchParams.get("currency")) ||
        normalizeGoogleFlightsCurrency(fallbackCurrency) ||
        DEFAULT_CURRENCY,
      locale: normalizeLocale(url.searchParams.get("locale")) || DEFAULT_LOCALE,
      cabin: normalizeSkyscannerCabin(url.searchParams.get("cabinclass")),
    };
  } catch {
    return {
      country: DEFAULT_COUNTRY,
      currency: normalizeGoogleFlightsCurrency(fallbackCurrency) || DEFAULT_CURRENCY,
      locale: DEFAULT_LOCALE,
      cabin: "economy",
    };
  }
}

function skyscannerFallbackSearchUrl(context: { country: string; currency: string; locale: string }): string {
  const params = new URLSearchParams({
    currency: context.currency,
    locale: context.locale,
    market: context.country,
  });
  return skyscannerCountryUrl(
    `https://www.skyscanner.com/transport/flights/?${params.toString()}`,
    context.country,
    context.currency,
  );
}

function skyscannerRoutePath(
  slices: Array<{ origin: string; destination: string; departureDate?: string; date?: string }>,
): string {
  const first = slices[0];
  const firstDate = first?.departureDate || first?.date || "";
  if (slices.length === 1 && first?.origin && first.destination && firstDate) {
    return `/transport/flights/${first.origin.toLowerCase()}/${first.destination.toLowerCase()}/${skyscannerCompactDate(
      firstDate,
    )}/`;
  }
  const second = slices[1];
  const secondDate = second?.departureDate || second?.date || "";
  if (
    slices.length === 2 &&
    first?.origin &&
    first.destination &&
    firstDate &&
    second?.origin === first.destination &&
    second.destination === first.origin &&
    secondDate
  ) {
    return `/transport/flights/${first.origin.toLowerCase()}/${first.destination.toLowerCase()}/${skyscannerCompactDate(
      firstDate,
    )}/${skyscannerCompactDate(secondDate)}/`;
  }

  const route = slices
    .map((slice) => {
      const date = slice.departureDate || slice.date || "";
      if (!slice.origin || !slice.destination || !date) return "";
      return `${slice.origin.toLowerCase()}/${date}/${slice.destination.toLowerCase()}`;
    })
    .filter(Boolean)
    .join("/");
  return route ? `/transport/d/${route}` : "";
}

function googleFlightsRouteSlices(currentUrl: string): RouteSlice[] {
  try {
    const url = new URL(currentUrl);
    return (
      googleFlightsTfsRouteSlices(url.searchParams.get("tfs") || "") ||
      googleFlightsParamRouteSlices(url.searchParams) ||
      googleFlightsQueryRouteSlices(url.searchParams.get("q") || "")
    );
  } catch {
    return [];
  }
}

function googleFlightsTfsRouteSlices(tfs: string): RouteSlice[] | null {
  const decoded = decodeBase64UrlText(tfs);
  if (!decoded) return null;
  // biome-ignore lint/complexity/useRegexLiterals: constructor keeps protobuf control markers out of a regex literal.
  const routePattern = new RegExp(
    "\\x12\\x0a(\\d{4}-\\d{2}-\\d{2}).*?\\x6a[\\s\\S]*?\\x12([\\s\\S]{1})([A-Z]{3}|/m/[A-Za-z0-9_]+).*?\\x72[\\s\\S]*?\\x12([\\s\\S]{1})([A-Z]{3}|/m/[A-Za-z0-9_]+)",
  );
  const match = routePattern.exec(decoded);
  if (!match) return null;

  const date = normalizeIsoDate(match[1]);
  const origin = normalizeSkyscannerGoogleLocation(match[3] || "");
  const destination = normalizeSkyscannerGoogleLocation(match[5] || "");
  if (!origin || !destination || !date) return null;
  return [{ origin, destination, date }];
}

function googleFlightsParamRouteSlices(params: URLSearchParams): RouteSlice[] | null {
  const origin = normalizeAirportCode(params.get("origin") || undefined);
  const destination = normalizeAirportCode(params.get("destination") || undefined);
  const date = normalizeIsoDate(params.get("depart"));
  if (!origin || !destination || !date) return null;

  const returnDate = normalizeIsoDate(params.get("return"));
  return returnDate
    ? [
        { origin, destination, date },
        { origin: destination, destination: origin, date: returnDate },
      ]
    : [{ origin, destination, date }];
}

function googleFlightsQueryRouteSlices(query: string): RouteSlice[] {
  const match = query.match(
    /\bflights?\s+from\s+([A-Z0-9]{3,4})\s+to\s+([A-Z0-9]{3,4})\s+on\s+(\d{4}-\d{2}-\d{2})(?:\s+returning\s+(\d{4}-\d{2}-\d{2}))?/i,
  );
  if (!match) return [];

  const origin = normalizeAirportCode(match[1]);
  const destination = normalizeAirportCode(match[2]);
  const date = normalizeIsoDate(match[3]);
  if (!origin || !destination || !date) return [];

  const returnDate = normalizeIsoDate(match[4]);
  return returnDate
    ? [
        { origin, destination, date },
        { origin: destination, destination: origin, date: returnDate },
      ]
    : [{ origin, destination, date }];
}

function skyscannerRouteSlices(currentUrl: string): RouteSlice[] {
  try {
    const url = new URL(currentUrl);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "transport") return [];

    if (parts[1] === "flights" && parts.length >= 5) {
      const origin = normalizeGoogleFlightsSkyscannerLocation(parts[2]);
      const destination = normalizeGoogleFlightsSkyscannerLocation(parts[3]);
      const date = parseSkyscannerDate(parts[4]);
      if (!origin || !destination || !date) return [];
      const returnDate = parseSkyscannerDate(parts[5] || "");
      return returnDate
        ? [
            { origin, destination, date },
            { origin: destination, destination: origin, date: returnDate },
          ]
        : [{ origin, destination, date }];
    }

    if (parts[1] !== "d") return [];
    const slices: RouteSlice[] = [];
    for (let index = 2; index + 2 < parts.length; index += 3) {
      if (parts[index] === "config") break;
      const origin = normalizeGoogleFlightsSkyscannerLocation(parts[index]);
      const date = parseSkyscannerDate(parts[index + 1] || "");
      const destination = normalizeGoogleFlightsSkyscannerLocation(parts[index + 2]);
      if (!origin || !destination || !date) break;
      slices.push({ origin, destination, date });
    }
    return slices;
  } catch {
    return [];
  }
}

function googleFlightsSearchQuery(slices: RouteSlice[], cabin: string): string {
  const [first, second] = slices;
  if (!first) return "";
  const cabinSuffix = cabin && cabin !== "economy" ? ` ${cabin.replaceAll("-", " ")}` : "";
  if (!second) {
    return `Flights from ${first.origin} to ${first.destination} on ${first.date} one way${cabinSuffix}`;
  }
  if (slices.length === 2 && second.origin === first.destination && second.destination === first.origin) {
    return `Flights from ${first.origin} to ${first.destination} on ${first.date} returning ${second.date}${cabinSuffix}`;
  }
  return "";
}

function parseSkyscannerDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (/^\d{6}$/.test(value)) return `20${value.slice(0, 2)}-${value.slice(2, 4)}-${value.slice(4, 6)}`;
  return "";
}

function skyscannerCompactDate(value: string): string {
  const date = normalizeIsoDate(value);
  return date ? `${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}` : value;
}

function normalizeIsoDate(value: string | null | undefined): string {
  const date = value?.trim() || "";
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
}

function skyscannerCabin(cabin: GoogleFlightsMatrixSearch["cabin"]): string {
  if (cabin === "PREMIUM-COACH") return "premiumeconomy";
  if (cabin === "BUSINESS") return "business";
  if (cabin === "FIRST") return "first";
  return "economy";
}

function normalizeSkyscannerCabin(value: unknown): string {
  if (value === "premiumeconomy") return "premium-economy";
  if (value === "business" || value === "first") return value;
  return "economy";
}

function normalizeAirportCode(value: string | undefined): string {
  const code = value?.trim().toUpperCase() || "";
  if (!/^[A-Z0-9]{3,4}$/.test(code)) return "";
  return /^[A-Z]{4}$/.test(code) && code.endsWith("A") ? code.slice(0, 3) : code;
}

function normalizeGoogleFlightsSkyscannerLocation(value: string | undefined): string {
  const code = value?.trim().toUpperCase() || "";
  return SKYSCANNER_LOCATION_TO_GOOGLE_CODE[code] || normalizeAirportCode(code);
}

function normalizeSkyscannerGoogleLocation(value: string): string {
  const location = value.trim();
  const mapped = GOOGLE_LOCATION_TO_SKYSCANNER_CODE[location];
  if (mapped) return mapped;
  const code = location.toUpperCase();
  return /^[A-Z0-9]{3,4}$/.test(code) ? code : "";
}

function decodeBase64UrlText(value: string): string {
  if (!value) return "";
  try {
    const base64 = value
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");
    return globalThis.atob(base64);
  } catch {
    return "";
  }
}

function normalizeCountry(value: string | null): string {
  const country = value?.trim().toUpperCase() || "";
  return /^[A-Z]{2}$/.test(country) ? country : "";
}

function normalizeLocale(value: string | null): string {
  const locale = value?.trim() || "";
  return /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/.test(locale) ? locale : "";
}

function isSkyscannerUrl(currentUrl: string): boolean {
  try {
    const url = new URL(currentUrl);
    return /(^|\.)skyscanner\.[a-z]{2,3}(?:\.[a-z]{2})?$/.test(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}
