export const DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES = [
  "US",
  "CA",
  "GB",
  "JP",
  "TW",
  "HK",
  "SG",
  "KR",
  "AU",
  "MY",
  "ES",
  "VN",
  "ZA",
  "IN",
  "PH",
  "NZ",
  "CN",
  "ID",
];
const DEFAULT_GOOGLE_FLIGHTS_CURRENCY = "USD";

export type GoogleFlightsBookingOption = {
  provider: string;
  price: number;
  currency: string;
  priceText: string;
  isDirect: boolean;
  bookingUrl?: string;
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
  sliceDate?: string;
  sliceGroup?: number;
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
  if (!url.searchParams.has("curr")) url.searchParams.set("curr", DEFAULT_GOOGLE_FLIGHTS_CURRENCY);
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
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }
  const tfs = parsedUrl.searchParams.get("tfs");
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
    .map((row) => parseBookingOption(row, url))
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
  const slices = googleFlightsTfsSliceBlocks(decoded);
  const parsedSlices = slices.length > 0 ? slices : [{ value: decoded, group: 0 }];
  const segments = parsedSlices.flatMap((slice) => parseGoogleFlightsTfsSliceSegments(slice.value, slice.group));
  return dedupeGoogleFlightsSegments(segments);
}

function googleFlightsTfsSliceBlocks(value: string): Array<{ value: string; group: number }> {
  const blocks: Array<{ value: string; group: number }> = [];
  let group = 0;
  for (let index = 0; index < value.length - 2; index += 1) {
    if (value.charCodeAt(index) !== 26) continue;
    const length = readVarint(value, index + 1);
    if (!length) continue;
    const start = length.nextIndex;
    const end = start + length.value;
    if (end > value.length) continue;
    const block = value.slice(start, end);
    if (!/\d{4}-\d{2}-\d{2}/.test(block) || !/[A-Z]{3}/.test(block)) continue;
    blocks.push({ value: block, group });
    group += 1;
    index = end - 1;
  }
  return blocks;
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

function parseGoogleFlightsTfsSliceSegments(value: string, group: number): GoogleFlightsFlightSegment[] {
  const segments: GoogleFlightsFlightSegment[] = [];
  const sliceDate = value.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  // biome-ignore lint/complexity/useRegexLiterals: constructor keeps protobuf control markers out of a regex literal.
  const pattern = new RegExp(
    "\\x0a\\x03([A-Z]{3})\\x12\\x0a(\\d{4}-\\d{2}-\\d{2})\\x1a\\x03([A-Z]{3})\\x2a\\x02([A-Z][A-Z0-9]|[0-9][A-Z])\\x32[\\x01-\\x04](\\d{1,4})",
    "g",
  );
  let match = pattern.exec(value);
  while (match) {
    const [, origin, segmentDate, destination, carrier, flightNumber] = match;
    segments.push({
      origin: origin || "",
      destination: destination || "",
      departureDate: segmentDate || sliceDate || "",
      sliceDate,
      sliceGroup: group,
      carrier,
      flightNumber,
    });
    match = pattern.exec(value);
  }
  return segments;
}

function dedupeGoogleFlightsSegments(segments: GoogleFlightsFlightSegment[]): GoogleFlightsFlightSegment[] {
  const seen = new Set<string>();
  return segments.filter((segment) => {
    const key = [
      segment.origin,
      segment.destination,
      segment.departureDate,
      segment.sliceDate || "",
      typeof segment.sliceGroup === "number" ? segment.sliceGroup : "",
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
    const currentSliceGroup = current?.segments[0]?.sliceGroup;
    const sameSliceGroup =
      typeof currentSliceGroup === "number" && typeof segment.sliceGroup === "number"
        ? currentSliceGroup === segment.sliceGroup
        : currentDestination === segment.origin;
    const isConnection =
      current && sameSliceGroup && currentDestination === segment.origin && segment.destination !== currentOrigin;
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
  if (slices.length === 2 && first?.origin === second?.destination && first?.destination === second?.origin) {
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
      ? [matrixSearchSlice(slices[0], slices[1])]
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
  const params = new URLSearchParams({
    search: encodeBase64(JSON.stringify(payload)),
    muTravelAutoOpen: "1",
    muTravelAutoSearch: "1",
  });
  return `https://matrix.itasoftware.com/search?${params.toString()}`;
}

function matrixSearchSlice(
  slice: GoogleFlightsMatrixSearch["slices"][number],
  returnSlice?: GoogleFlightsMatrixSearch["slices"][number],
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
  if (returnSlice?.departureDate) dates.returnDate = returnSlice.departureDate;
  return {
    origin: [slice.origin],
    dest: [slice.destination],
    routing: carrierRouting(slice),
    ext: "",
    routingRet: returnSlice ? carrierRouting(returnSlice) : "",
    extRet: "",
    dates,
  };
}

function carrierRouting(slice: GoogleFlightsMatrixSearch["slices"][number]): string {
  const flightTokens = slice.segments.map(matrixFlightToken).filter(isString);
  if (flightTokens.length === slice.segments.length && flightTokens.length > 0) {
    return flightTokens.length === 1 ? `F:${flightTokens[0]}` : flightTokens.join(" ");
  }
  return slice.segments
    .map((segment) => segment.carrier)
    .filter(isString)
    .join(" ");
}

function matrixFlightToken(segment: GoogleFlightsFlightSegment): string {
  return segment.carrier && segment.flightNumber ? `${segment.carrier}${segment.flightNumber}` : "";
}

function decodeBase64UrlText(value: string): string {
  try {
    const base64 = value
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "=");
    return globalThis.atob(base64);
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

function parseBookingOption(row: Element, pageUrl: string): GoogleFlightsBookingOption | null {
  const label = providerLabel(row);
  const price = providerPrice(row);
  if (!label || !price) return null;

  const bookingUrl = bookingOptionUrl(row, pageUrl);
  return {
    provider: label.provider,
    price: price.price,
    currency: price.currency,
    priceText: price.priceText,
    isDirect: label.isDirect,
    ...(bookingUrl ? { bookingUrl } : {}),
  };
}

function bookingOptionUrl(row: Element, pageUrl: string): string | undefined {
  const anchor =
    row instanceof HTMLAnchorElement
      ? row
      : row.querySelector<HTMLAnchorElement>("a[href]") || row.closest<HTMLAnchorElement>("a[href]");
  if (!anchor?.href) return undefined;
  try {
    const url = new URL(anchor.getAttribute("href") || anchor.href, pageUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function providerLabel(row: Element): { provider: string; isDirect: boolean } | null {
  const labelElement = row.querySelector(".ogfYpf");
  const rawLabel =
    normalizedText(
      Array.from(labelElement?.childNodes || []).find((node) => node.nodeType === Node.TEXT_NODE)?.textContent || "",
    ) || normalizedText(labelElement?.textContent || "");
  if (!rawLabel) return null;

  const isDirect = Boolean(row.querySelector(".EA71Tc"));
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
  const parsed =
    parsedAria?.currency === "UNKNOWN" && parsedVisible && parsedVisible.currency !== "UNKNOWN"
      ? parsedVisible
      : parsedAria || parsedVisible;
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

  const currency = currencyFromText(value) || currencyCodeFromText(value);
  const priceText = priceTextFromValue(value) || priceLikeTextFromValue(value);
  if (!currency && !priceText) return null;

  return {
    price,
    currency: currency || "UNKNOWN",
    priceText: priceText || value,
  };
}

function currencyCodeFromText(value: string): string {
  return value.match(/\b[A-Z]{3}\b/)?.[0] || "";
}

function priceLikeTextFromValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length > 40 || !/[0-9]/.test(trimmed)) return "";
  if (currencyCodeFromText(trimmed)) return trimmed;
  if (/francs?|kron(?:er|a)|pesos?|dollars?|euros?|pounds?|yen|rupees?|won|baht|ringgit|yuan/i.test(trimmed)) {
    return trimmed;
  }
  return "";
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
  if (/(?:^|[^\p{L}\p{N}])S\$/iu.test(value) || /Singapore dollars?/i.test(value)) return "SGD";
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
