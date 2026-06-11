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
  "/m/071vr": "SANA",
  "/m/022pfm": "SAOA",
  "/m/0rh6k": "WASA",
  "/m/01_d4": "CHIA",
  "/m/0947l": "MILA",
  "/m/06c62": "ROME",
  "/m/01914": "BJSA",
  "/m/0fn2g": "BKKT",
  "/m/0hsqf": "SELA",
  "/m/0dqyw": "OSAA",
  "/m/01f08r": "DXBA",
  "/m/09949m": "ISTA",
  "/m/01ly5m": "BUEA",
  "/m/0f04v": "SJCA",
  "/m/0f2rq": "DFWA",
  "/m/03l2n": "HOUA",
  "/m/0f2v0": "MIAA",
  "/m/0h7h6": "YTOA",
  "/m/052p7": "YMQA",
  "/m/080h2": "YVRA",
  "/m/04sqj": "MEXA",
  "/m/06mxs": "STOC",
  "/m/05l64": "OSLO",
  "/m/06gmr": "RIOA",
  "/m/0fn7r": "CMBA",
  "/m/04swd": "MOSC",
  "/m/049d1": "KULM",
  "/m/044rv": "CGKI",
  "/m/0chgzm": "MELA",
  "/m/0ftkx": "TPET",
  "/m/0ftkxr": "TPET",
  "/m/0177z": "BRUS",
  "/m/02z0j": "FRAN",
};

const GOOGLE_LOCATION_TO_SKYSCANNER_AIRPORT_FALLBACK: Record<string, string> = {
  "/m/0156q": "BER",
  "/m/01f62": "BCN",
  "/m/056_y": "MAD",
};

const SKYSCANNER_LOCATION_TO_GOOGLE_CODE: Record<string, string> = {
  BJSA: "BJS",
  BKKT: "BKK",
  BRUS: "BRU",
  BUEA: "BUE",
  CGKI: "CGK",
  CHIA: "CHI",
  CMBA: "CMB",
  CSHA: "SHA",
  DFWA: "DFW",
  DXBA: "DXB",
  FRAN: "FRA",
  HOUA: "HOU",
  MEXA: "MEX",
  ISTA: "IST",
  KULM: "KUL",
  LAXA: "LAX",
  LOND: "LON",
  MELA: "MEL",
  MILA: "MIL",
  MOSC: "MOW",
  MIAA: "MIA",
  NYCA: "NYC",
  OSAA: "OSA",
  OSLO: "OSL",
  PARI: "PAR",
  RIOA: "RIO",
  ROME: "ROM",
  SANA: "SAN",
  SAOA: "SAO",
  SELA: "SEL",
  SJCA: "SJC",
  STOC: "STO",
  TPET: "TPE",
  TYOA: "TYO",
  WASA: "WAS",
  YMQA: "YMQ",
  YTOA: "YTO",
  YVRA: "YVR",
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

  const date = normalizeIsoDate(decoded.match(/\d{4}-\d{2}-\d{2}/)?.[0]);
  const origin = normalizeSkyscannerGoogleLocation(readGoogleFlightsTfsLocationField(decoded, 0x6a));
  const destination = normalizeSkyscannerGoogleLocation(readGoogleFlightsTfsLocationField(decoded, 0x72));
  if (!origin || !destination || !date) return null;
  return [{ origin, destination, date }];
}

function readGoogleFlightsTfsLocationField(value: string, fieldTag: number): string {
  for (let index = 0; index < value.length - 1; index += 1) {
    if (value.charCodeAt(index) !== fieldTag) continue;
    const fieldLength = readVarint(value, index + 1);
    if (!fieldLength) continue;
    const fieldStart = fieldLength.nextIndex;
    const fieldEnd = fieldStart + fieldLength.value;
    if (fieldEnd > value.length) continue;
    const location = readGoogleFlightsLocationValue(value.slice(fieldStart, fieldEnd));
    if (location) return location;
    index = fieldEnd - 1;
  }
  return "";
}

function readGoogleFlightsLocationValue(value: string): string {
  for (let index = 0; index < value.length - 1; index += 1) {
    if (value.charCodeAt(index) !== 0x12) continue;
    const length = readVarint(value, index + 1);
    if (!length) continue;
    const start = length.nextIndex;
    const end = start + length.value;
    if (end > value.length) continue;
    return value.slice(start, end);
  }
  return "";
}

function readVarint(value: string, startIndex: number): { value: number; nextIndex: number } | null {
  let result = 0;
  let shift = 0;
  for (let index = startIndex; index < value.length; index += 1) {
    const byte = value.charCodeAt(index);
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value: result, nextIndex: index + 1 };
    shift += 7;
    if (shift > 28) return null;
  }
  return null;
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
  const fallback = GOOGLE_LOCATION_TO_SKYSCANNER_AIRPORT_FALLBACK[location];
  if (fallback) return fallback;
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
