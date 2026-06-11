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

export function crossProviderSearchUrl(currentUrl: string, fallbackCurrency = DEFAULT_CURRENCY): string {
  if (isSkyscannerUrl(currentUrl)) return googleFlightsSearchUrlFromSkyscanner(currentUrl, fallbackCurrency);
  return skyscannerSearchUrlFromGoogleFlights(currentUrl, fallbackCurrency);
}

export function skyscannerSearchUrlFromGoogleFlights(currentUrl: string, fallbackCurrency = DEFAULT_CURRENCY): string {
  const context = googleFlightsUrlContext(currentUrl, fallbackCurrency);
  const search = parseGoogleFlightsMatrixSearch(currentUrl, context.currency);
  const path = skyscannerRoutePath(search?.slices || googleFlightsRouteSlices(currentUrl));
  if (!path) return skyscannerFallbackSearchUrl(context);

  const params = new URLSearchParams();
  params.set("adultsv2", "1");
  params.set("cabinclass", skyscannerCabin(search?.cabin || "COACH"));
  params.set("childrenv2", "");
  params.set("currency", context.currency);
  params.set("locale", context.locale);
  params.set("market", context.country);
  params.set("preferdirects", "false");
  if (!search || search.tripType === "one-way") params.set("rtn", "0");

  return skyscannerCountryUrl(
    `https://www.skyscanner.com${path}?${params.toString()}`,
    context.country,
    context.currency,
  );
}

export function googleFlightsSearchUrlFromSkyscanner(currentUrl: string, fallbackCurrency = DEFAULT_CURRENCY): string {
  const context = skyscannerUrlContext(currentUrl, fallbackCurrency);
  const slices = skyscannerRouteSlices(currentUrl);
  const params = new URLSearchParams();
  params.set("curr", context.currency);
  params.set("gl", context.country);
  params.set("hl", context.locale);
  if (slices.length > 0) {
    params.set("origin", slices[0].origin);
    params.set("destination", slices[0].destination);
    params.set("depart", slices[0].date);
    if (slices[1]?.date) params.set("return", slices[1].date);
  }
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
      googleFlightsParamRouteSlices(url.searchParams) || googleFlightsQueryRouteSlices(url.searchParams.get("q") || "")
    );
  } catch {
    return [];
  }
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
      const origin = normalizeAirportCode(parts[2]);
      const destination = normalizeAirportCode(parts[3]);
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
      const origin = normalizeAirportCode(parts[index]);
      const date = parseSkyscannerDate(parts[index + 1] || "");
      const destination = normalizeAirportCode(parts[index + 2]);
      if (!origin || !destination || !date) break;
      slices.push({ origin, destination, date });
    }
    return slices;
  } catch {
    return [];
  }
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
  return /^[A-Z0-9]{3,4}$/.test(code) ? code : "";
}

function normalizeCountry(value: string | null): string {
  const country = value?.trim().toUpperCase() || "";
  return /^[A-Z]{2}$/.test(country) ? country : "";
}

function normalizeLocale(value: string | null): string {
  const locale = value?.trim() || "";
  return /^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale) ? locale : "";
}

function isSkyscannerUrl(currentUrl: string): boolean {
  try {
    const url = new URL(currentUrl);
    return url.hostname === "skyscanner.com" || /(^|\.)skyscanner\./.test(url.hostname);
  } catch {
    return false;
  }
}
