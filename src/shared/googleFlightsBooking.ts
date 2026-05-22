export const DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES = ["US", "CA", "GB", "JP", "TW", "HK", "SG", "KR", "AU", "MY"];

export type GoogleFlightsBookingOption = {
  provider: string;
  price: number;
  currency: string;
  priceText: string;
  isDirect: boolean;
};

export type GoogleFlightsCountryResult = {
  country: string;
  url: string;
  options: GoogleFlightsBookingOption[];
  cheapest?: GoogleFlightsBookingOption;
  direct?: GoogleFlightsBookingOption;
  status: "ready" | "sparse" | "empty" | "error";
  refreshed?: boolean;
  error?: string;
};

export type GoogleFlightsFlightSegment = {
  origin: string;
  destination: string;
  departureDate: string;
  carrier?: string;
  flightNumber?: string;
};

export type GoogleFlightsMatrixSearch = {
  tripType: "one-way" | "round-trip" | "multi-city";
  slices: Array<{
    origin: string;
    destination: string;
    departureDate: string;
    segments: GoogleFlightsFlightSegment[];
  }>;
  carriers: string[];
  matrixUrl: string;
};

export function googleFlightsCountryUrl(baseUrl: string, country: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("gl", country);
  return url.toString();
}

export function normalizeGoogleFlightsCountryCodes(
  value: unknown,
  fallback = DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES,
): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const seen = new Set<string>();
  const codes = value
    .map((item) => (typeof item === "string" ? item.trim().toUpperCase() : ""))
    .filter((item) => /^[A-Z]{2}$/.test(item))
    .filter((item) => {
      if (seen.has(item)) return false;
      seen.add(item);
      return true;
    });

  return codes.length > 0 ? codes : [...fallback];
}

export function parseGoogleFlightsCountryInput(value: string): string[] {
  return normalizeGoogleFlightsCountryCodes(value.split(/[,\s]+/), []);
}

export function parseGoogleFlightsMatrixSearch(url: string): GoogleFlightsMatrixSearch | null {
  const tfs = new URL(url).searchParams.get("tfs");
  if (!tfs) return null;
  const segments = parseGoogleFlightsTfsSegments(tfs);
  if (segments.length === 0) return null;
  const slices = groupGoogleFlightsSegments(segments);
  if (slices.length === 0) return null;
  const tripType = googleFlightsTripType(slices);
  return {
    tripType,
    slices,
    carriers: Array.from(new Set(segments.map((segment) => segment.carrier).filter(isString))).sort(),
    matrixUrl: buildItaMatrixSearchUrl(tripType, slices),
  };
}

export function parseGoogleFlightsBookingOptions(
  root: ParentNode,
  country: string,
  url: string,
): GoogleFlightsCountryResult {
  const options = Array.from(root.querySelectorAll(".gN1nAc"))
    .map((row) => parseBookingOption(row))
    .filter((option): option is GoogleFlightsBookingOption => Boolean(option))
    .sort((left, right) => left.price - right.price || left.provider.localeCompare(right.provider));

  return {
    country,
    url,
    options,
    cheapest: options[0],
    direct: options.find((option) => option.isDirect),
    status: options.length > 0 ? "ready" : "empty",
  };
}

function parseGoogleFlightsTfsSegments(tfs: string): GoogleFlightsFlightSegment[] {
  const decoded = decodeBase64UrlText(tfs);
  if (!decoded) return [];
  const segments: GoogleFlightsFlightSegment[] = [];
  const pattern =
    /(\d{4}-\d{2}-\d{2})[\s\S]{0,24}?([A-Z]{3})[\s\S]{0,24}?(\d{4}-\d{2}-\d{2})[\s\S]{0,24}?([A-Z]{3})[\s\S]{0,12}?([A-Z0-9]{2})([\s\S]{0,8})/g;
  let match = pattern.exec(decoded);
  while (match) {
    const [, sliceDate, origin, segmentDate, destination, carrier, flightTail] = match;
    const flightNumber = parseTfsFlightNumber(flightTail);
    segments.push({
      origin,
      destination,
      departureDate: segmentDate || sliceDate,
      carrier,
      flightNumber,
    });
    match = pattern.exec(decoded);
  }
  return dedupeGoogleFlightsSegments(segments);
}

function parseTfsFlightNumber(value: string): string | undefined {
  for (let index = 0; index < value.length; index += 1) {
    const length = value.charCodeAt(index);
    if (length < 1 || length > 4) continue;
    const candidate = value.slice(index + 1, index + 1 + length);
    if (/^\d{1,4}$/.test(candidate)) return candidate;
  }
  return value.match(/\d{2,4}/)?.[0];
}

function dedupeGoogleFlightsSegments(segments: GoogleFlightsFlightSegment[]): GoogleFlightsFlightSegment[] {
  const seen = new Set<string>();
  return segments.filter((segment) => {
    const key = [
      segment.origin,
      segment.destination,
      segment.departureDate,
      segment.carrier || "",
      segment.flightNumber || "",
    ].join(":");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groupGoogleFlightsSegments(segments: GoogleFlightsFlightSegment[]): GoogleFlightsMatrixSearch["slices"] {
  const slices: GoogleFlightsMatrixSearch["slices"] = [];
  for (const segment of segments) {
    const current = slices.at(-1);
    const currentOrigin = current?.segments[0]?.origin;
    const currentDestination = current?.segments.at(-1)?.destination;
    const isConnection = current && currentDestination === segment.origin && segment.destination !== currentOrigin;
    if (current && isConnection) {
      current.destination = segment.destination;
      current.segments.push(segment);
      continue;
    }
    slices.push({
      origin: segment.origin,
      destination: segment.destination,
      departureDate: segment.departureDate,
      segments: [segment],
    });
  }
  return slices;
}

function googleFlightsTripType(slices: GoogleFlightsMatrixSearch["slices"]): GoogleFlightsMatrixSearch["tripType"] {
  if (slices.length === 1) return "one-way";
  const [first, second] = slices;
  if (
    slices.length === 2 &&
    first?.origin === second?.destination &&
    first?.destination === second?.origin &&
    first.departureDate !== second.departureDate
  ) {
    return "round-trip";
  }
  return "multi-city";
}

function buildItaMatrixSearchUrl(
  tripType: GoogleFlightsMatrixSearch["tripType"],
  slices: GoogleFlightsMatrixSearch["slices"],
): string {
  const matrixSlices =
    tripType === "round-trip" && slices[0] && slices[1]
      ? [matrixSearchSlice(slices[0], slices[1].departureDate)]
      : slices.map((slice) => matrixSearchSlice(slice));
  const payload = {
    type: tripType,
    slices: matrixSlices,
    options: {
      cabin: "COACH",
      stops: "-1",
      extraStops: "1",
      allowAirportChanges: "true",
      showOnlyAvailable: "true",
    },
    pax: {
      adults: "1",
    },
  };
  return `https://matrix.itasoftware.com/search?search=${encodeURIComponent(encodeBase64(JSON.stringify(payload)))}`;
}

function matrixSearchSlice(
  slice: GoogleFlightsMatrixSearch["slices"][number],
  returnDate = "",
): Record<string, unknown> {
  const dates: Record<string, unknown> = {
    searchDateType: "specific",
    departureDate: slice.departureDate,
    departureDateType: "depart",
    departureDateModifier: "0",
    departureDatePreferredTimes: [],
    returnDateType: "depart",
    returnDateModifier: "0",
    returnDatePreferredTimes: [],
  };
  if (returnDate) dates.returnDate = returnDate;
  return {
    origin: [slice.origin],
    dest: [slice.destination],
    routing: "",
    ext: "",
    routingRet: "",
    extRet: "",
    dates,
  };
}

function decodeBase64UrlText(value: string): string {
  try {
    const base64 = value
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = globalThis.atob(base64);
    return Array.from(binary, (character) => character).join("");
  } catch {
    return "";
  }
}

function encodeBase64(value: string): string {
  return globalThis.btoa(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function parseBookingOption(row: Element): GoogleFlightsBookingOption | null {
  const label = providerLabel(row);
  const price = providerPrice(row);
  if (!label || !price) return null;

  return {
    provider: label.provider,
    price: price.price,
    currency: price.currency,
    priceText: price.priceText,
    isDirect: label.isDirect,
  };
}

function providerLabel(row: Element): { provider: string; isDirect: boolean } | null {
  const labelElement = row.querySelector(".ogfYpf");
  const rawLabel =
    normalizedText(
      Array.from(labelElement?.childNodes || []).find((node) => node.nodeType === Node.TEXT_NODE)?.textContent || "",
    ) || normalizedText(labelElement?.textContent || "");
  if (!rawLabel) return null;

  const isDirect = Array.from(row.querySelectorAll(".EA71Tc")).some((element) =>
    /^Airline$/i.test(normalizedText(element.textContent || "")),
  );
  const provider = cleanProviderLabel(rawLabel);

  return provider ? { provider, isDirect } : null;
}

function cleanProviderLabel(value: string): string {
  return value
    .replace(/^(?:Book with|Reserve with|Reservar con|Réserver avec|Buchen bei|Prenota con|Reservar com)\s+/i, "")
    .replace(/^(?:透過|通过)\s*/i, "")
    .replace(/\s*(?:で予約|予約|預訂|预订)$/i, "")
    .replace(/\s*Airline$/i, "")
    .trim();
}

function providerPrice(row: Element): { price: number; currency: string; priceText: string } | null {
  for (const element of Array.from(row.querySelectorAll("[aria-label], [role='text']"))) {
    const ariaLabel = element.getAttribute("aria-label") || "";
    const visibleText = normalizedText(element.textContent || "");
    const price = parsePriceText(ariaLabel, visibleText);
    if (price) return price;
  }

  return null;
}

function parsePriceText(
  ariaLabel: string,
  visibleText: string,
): { price: number; currency: string; priceText: string } | null {
  const ariaText = normalizedText(ariaLabel);
  const parsedAria = ariaText ? parsePriceAmount(ariaText) : null;
  const parsedVisible = visibleText ? parsePriceAmount(visibleText) : null;
  const parsed = parsedAria || parsedVisible;
  if (!parsed) return null;

  return {
    price: parsed.price,
    currency: parsed.currency,
    priceText: parsedVisible?.priceText || parsed.priceText,
  };
}

function parsePriceAmount(value: string): { price: number; currency: string; priceText: string } | null {
  const amount = value.match(/([0-9][0-9.,\s'’]*[0-9]|[0-9])/);
  if (!amount) return null;
  const price = parseLocalizedNumber(amount[1]);
  if (!Number.isFinite(price)) return null;

  const currency = currencyFromText(value);
  const priceText = priceTextFromValue(value);
  if (!currency && !priceText) return null;

  return {
    price,
    currency: currency || "UNKNOWN",
    priceText: priceText || value,
  };
}

function priceTextFromValue(value: string): string {
  const trimmed = value.trim();
  if (currencyFromText(trimmed) && /[0-9]/.test(trimmed) && trimmed.length <= 40) {
    return trimmed;
  }
  const usd = trimmed.match(/([0-9][0-9.,\s'’]*[0-9]|[0-9])\s+US dollars?\b/i);
  const price = usd ? parseLocalizedNumber(usd[1]) : undefined;
  if (typeof price === "number" && Number.isFinite(price)) return `$${price.toLocaleString()}`;
  return "";
}

function parseLocalizedNumber(value: string): number {
  const compact = value.replace(/[\s'’]/g, "");
  if (!compact) return Number.NaN;
  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const groupSeparator = decimalSeparator === "," ? "." : ",";
    const normalized = compact.replaceAll(groupSeparator, "").replace(decimalSeparator, ".");
    return Number(normalized);
  }

  if (lastComma !== -1) return parseSingleSeparatorNumber(compact, ",");
  if (lastDot !== -1) return parseSingleSeparatorNumber(compact, ".");
  return Number(compact);
}

function parseSingleSeparatorNumber(value: string, separator: "," | "."): number {
  const parts = value.split(separator);
  const last = parts.at(-1) || "";
  if (parts.length > 2) {
    if (last.length === 3) return Number(parts.join(""));
    return Number(`${parts.slice(0, -1).join("")}.${last}`);
  }

  const [head, tail = ""] = parts;
  if (tail.length === 3 && head.length <= 3) return Number(`${head}${tail}`);
  if (!tail) return Number(head);
  return Number(`${head}.${tail}`);
}

function currencyFromText(value: string): string {
  if (/NT\$/i.test(value) || /Taiwan dollars?/i.test(value)) return "TWD";
  if (/HK\$/i.test(value) || /Hong Kong dollars?/i.test(value)) return "HKD";
  if (/S\$/i.test(value) || /Singapore dollars?/i.test(value)) return "SGD";
  if (/C\$/i.test(value) || /Canadian dollars?/i.test(value)) return "CAD";
  if (/A\$/i.test(value) || /Australian dollars?/i.test(value)) return "AUD";
  if (/\$|US dollars?|USD/i.test(value)) return "USD";
  if (/€|euros?|EUR/i.test(value)) return "EUR";
  if (/£|pounds?|GBP/i.test(value)) return "GBP";
  if (/¥|￥|Japanese yen|JPY/i.test(value)) return "JPY";
  if (/₩|Korean won|KRW/i.test(value)) return "KRW";
  if (/฿|baht|THB/i.test(value)) return "THB";
  if (/ringgit|MYR/i.test(value)) return "MYR";
  if (/yuan|CNY|RMB/i.test(value)) return "CNY";
  if (/₹|rupees?|INR/i.test(value)) return "INR";
  return "";
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
