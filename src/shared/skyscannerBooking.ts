import type { BookingOption, CountryResult, SearchCountryResult, SearchResult } from "./countryComparison";

const SKYSCANNER_FLIGHTS_PATH_RE = /^\/transport\/(?:flights|d)\//;
const SKYSCANNER_CONFIG_PATH_RE = /\/config\/[^/]+/;
const SKYSCANNER_DEFAULT_HOST = "www.skyscanner.com";

export const SKYSCANNER_SEARCH_API_PATH = "/g/radar/api/v2/web-unified-search/";
export const SKYSCANNER_SEARCH_RESULT_ROW_SELECTOR = [
  '[data-testid*="itinerary" i]',
  'a[href*="/transport/flights/"][href*="/config/"]',
  'a[href*="/transport/d/"][href*="/config/"]',
  'button[aria-label^="Select" i]',
  'button[data-testid*="itinerary" i]',
].join(",");

const SKYSCANNER_COUNTRY_HOSTS: Record<string, string> = {
  AE: "www.skyscanner.ae",
  AR: "www.skyscanner.com.ar",
  AT: "www.skyscanner.at",
  AU: "www.skyscanner.com.au",
  BE: "www.skyscanner.be",
  BR: "www.skyscanner.com.br",
  CA: "www.skyscanner.ca",
  CH: "www.skyscanner.ch",
  CL: "www.skyscanner.cl",
  CN: "cn.skyscanner.com",
  CO: "www.skyscanner.com.co",
  DE: "www.skyscanner.de",
  DK: "www.skyscanner.dk",
  EG: "www.skyscanner.com.eg",
  ES: "www.skyscanner.es",
  FI: "www.skyscanner.fi",
  FR: "www.skyscanner.fr",
  GB: "www.skyscanner.net",
  GR: "gr.skyscanner.com",
  HK: "www.skyscanner.com.hk",
  ID: "www.skyscanner.co.id",
  IE: "www.skyscanner.ie",
  IL: "www.skyscanner.co.il",
  IN: "www.skyscanner.co.in",
  IT: "www.skyscanner.it",
  JP: "www.skyscanner.jp",
  KR: "www.skyscanner.co.kr",
  MX: "www.skyscanner.com.mx",
  MY: "www.skyscanner.com.my",
  NL: "www.skyscanner.nl",
  NO: "www.skyscanner.no",
  NZ: "www.skyscanner.co.nz",
  PE: "www.skyscanner.com.pe",
  PH: "www.skyscanner.com.ph",
  PL: "www.skyscanner.pl",
  PT: "www.skyscanner.pt",
  RO: "ro.skyscanner.com",
  RU: "www.skyscanner.ru",
  SE: "www.skyscanner.se",
  SG: "www.skyscanner.com.sg",
  TH: "www.skyscanner.co.th",
  TR: "www.skyscanner.com.tr",
  TW: "www.skyscanner.com.tw",
  UA: "www.skyscanner.com.ua",
  US: SKYSCANNER_DEFAULT_HOST,
  VN: "www.skyscanner.com.vn",
  ZA: "www.skyscanner.co.za",
};

const SKYSCANNER_HOST_COUNTRIES = new Map([
  ...Object.entries(SKYSCANNER_COUNTRY_HOSTS).map(([country, host]) => [host, country] as const),
  ["skyscanner.com", "US"] as const,
  ["www.skyscanner.co.uk", "GB"] as const,
  ["www.skyscanner.cn", "CN"] as const,
]);

export function skyscannerCountryUrl(baseUrl: string, country: string, currency?: string): string {
  const url = new URL(baseUrl);
  const normalizedCountry = normalizeSkyscannerCountryCode(country) || "US";
  url.hostname = SKYSCANNER_COUNTRY_HOSTS[normalizedCountry] || SKYSCANNER_DEFAULT_HOST;
  url.searchParams.set("currency", normalizeCurrencyCode(currency || url.searchParams.get("currency") || "USD"));
  url.searchParams.set("market", skyscannerMarketCode(normalizedCountry));
  return url.toString();
}

export function skyscannerPanelPageKey(url: string, country: string, includeCountry: boolean): string {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return "";
  }
  if (!isSkyscannerFlightsPage(parsedUrl)) return "";

  const params = new URLSearchParams(parsedUrl.searchParams);
  params.delete("market");
  params.delete("userSessionDataId");
  params.delete("_gl");
  if (includeCountry) params.set("market", skyscannerMarketCode(country));
  const query = params.toString();
  return query ? `${parsedUrl.pathname}?${query}` : parsedUrl.pathname;
}

export function isSkyscannerFlightsPageUrl(url: string): boolean {
  try {
    return isSkyscannerFlightsPage(new URL(url));
  } catch {
    return false;
  }
}

export function isSkyscannerPanelPageUrl(url: string): boolean {
  return isSkyscannerFlightsPageUrl(url);
}

export function isSkyscannerFinalComparePageUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return isSkyscannerFlightsPage(parsedUrl) && SKYSCANNER_CONFIG_PATH_RE.test(parsedUrl.pathname);
  } catch {
    return false;
  }
}

export function isSkyscannerSearchPageUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return isSkyscannerFlightsPage(parsedUrl) && !SKYSCANNER_CONFIG_PATH_RE.test(parsedUrl.pathname);
  } catch {
    return false;
  }
}

function isSkyscannerFlightsPage(url: URL): boolean {
  return isSkyscannerHost(url.hostname) && SKYSCANNER_FLIGHTS_PATH_RE.test(url.pathname);
}

function isSkyscannerHost(hostname: string): boolean {
  return hostname === "skyscanner.com" || hostname === SKYSCANNER_DEFAULT_HOST || /(^|\.)skyscanner\./.test(hostname);
}

export function skyscannerCountryCodeFromUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const market = normalizeSkyscannerCountryCode(parsedUrl.searchParams.get("market"));
    if (market) return market;
    return SKYSCANNER_HOST_COUNTRIES.get(parsedUrl.hostname) || "";
  } catch {
    return "";
  }
}

function normalizeSkyscannerCountryCode(value: unknown): string {
  if (typeof value !== "string") return "";
  const country = value.trim().toUpperCase();
  if (country === "UK") return "GB";
  return /^[A-Z]{2}$/.test(country) ? country : "";
}

function skyscannerMarketCode(country: string): string {
  const normalizedCountry = normalizeSkyscannerCountryCode(country) || "US";
  return normalizedCountry === "GB" ? "UK" : normalizedCountry;
}

function normalizeCurrencyCode(value: string): string {
  const currency = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : "USD";
}

export function parseSkyscannerPricingOptions(root: ParentNode, country: string, url: string): CountryResult {
  const options = Array.from(root.querySelectorAll('[data-testid="PricingItem"]'))
    .map((row) => parseSkyscannerPricingOption(row, url))
    .filter((option): option is BookingOption => Boolean(option))
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

function parseSkyscannerPricingOption(row: Element, pageUrl: string): BookingOption | null {
  const provider = skyscannerProviderLabel(row);
  const price = skyscannerProviderPrice(row);
  if (!provider || !price) return null;

  const bookingUrl = skyscannerBookingOptionUrl(row, pageUrl);
  return {
    provider,
    price: price.price,
    currency: price.currency,
    priceText: price.priceText,
    isDirect: false,
    ...(bookingUrl ? { bookingUrl } : {}),
  };
}

function skyscannerProviderLabel(row: Element): string {
  const providerText =
    normalizedText(row.querySelector('[class*="AgentDetails_agentDetails"] p')?.textContent || "") ||
    normalizedText(row.querySelector("h3")?.textContent || "").replace(/^Option\s+\d+:\s*/i, "") ||
    normalizedText(row.querySelector('[data-testid="pricing-item-redirect-button"]')?.getAttribute("aria-label") || "")
      .replace(/^Select\s+/i, "")
      .replace(/\.$/, "");
  return providerText.trim();
}

function skyscannerProviderPrice(row: Element): { price: number; currency: string; priceText: string } | null {
  const candidates = [
    row.querySelector('[class*="Price_pricingItemPrice"]'),
    row.querySelector('[class*="TotalPrice_visuallyHidden"]'),
    row.querySelector('[data-testid="CtaSection"]'),
    row,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const price = parsePriceText(
      candidate.getAttribute("aria-label") || "",
      normalizedText(candidate.textContent || ""),
    );
    if (price) return price;
  }
  return null;
}

function skyscannerBookingOptionUrl(row: Element, pageUrl: string): string | undefined {
  const anchor = row.querySelector<HTMLAnchorElement>('[data-testid="pricing-item-redirect-button"][href], a[href]');
  if (!anchor?.href) return undefined;
  try {
    const url = new URL(anchor.getAttribute("href") || anchor.href, pageUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function parseSkyscannerSearchApiResponse(payload: unknown, country: string, url: string): SearchCountryResult {
  const results = skyscannerSearchResults(payload);
  return {
    country,
    url,
    results,
    status: results.length > 0 ? "ready" : "empty",
  };
}

function skyscannerSearchResults(payload: unknown): SearchResult[] {
  const body =
    payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};
  const itineraries = objectValue(body.itineraries);
  const rawResults = Array.isArray(itineraries.results)
    ? itineraries.results
    : Array.isArray(body.results)
      ? body.results
      : [];
  return rawResults
    .map((item, index) => parseSkyscannerSearchResult(item, index))
    .filter((result): result is SearchResult => Boolean(result));
}

function parseSkyscannerSearchResult(value: unknown, rowIndex: number): SearchResult | null {
  const result = objectValue(value);
  const price = objectValue(result.price);
  const rawPrice = numberValue(price.raw);
  const priceText = stringValue(price.formatted) || (Number.isFinite(rawPrice) ? `$${rawPrice}` : "");
  if (!Number.isFinite(rawPrice) || !priceText) return null;

  const legs = Array.isArray(result.legs) ? result.legs.map(objectValue) : [];
  const segments = legs.flatMap((leg) => (Array.isArray(leg.segments) ? leg.segments.map(objectValue) : []));
  const carrierText = uniqueStrings([
    ...legs.flatMap((leg) => carrierNames(objectValue(leg.carriers))),
    ...segments.flatMap((segment) => [
      stringValue(objectValue(segment.marketingCarrier).name),
      stringValue(objectValue(segment.marketingCarrier).alternateId),
    ]),
  ]).join(", ");
  const timeText = skyscannerTimeSignature(legs);
  const durationText = skyscannerDurationText(legs);
  const stopsText = skyscannerStopsText(legs);
  const itineraryKey = skyscannerItineraryKey(result, legs, segments);
  const summaryText = normalizedText(
    [carrierText, timeText, durationText, stopsText, itineraryKey].filter(Boolean).join(" "),
  );
  const matchKey = normalizeSearchKey(summaryText);
  if (matchKey.length < 8) return null;

  return {
    rowKey: `ss-row-${stableHash(itineraryKey || matchKey)}`,
    matchKey,
    rowIndex,
    price: rawPrice,
    currency: currencyFromFormattedPrice(priceText),
    priceText,
    summaryText,
    ...(carrierText ? { carrierText } : {}),
    ...(timeText ? { timeText } : {}),
    ...(durationText ? { durationText } : {}),
    ...(stopsText ? { stopsText } : {}),
    ...(itineraryKey ? { itineraryKey } : {}),
    matchConfidence: itineraryKey ? "high" : "medium",
  };
}

function carrierNames(carriers: Record<string, unknown>): string[] {
  return Array.isArray(carriers.marketing)
    ? carriers.marketing.map((carrier) => stringValue(objectValue(carrier).name)).filter(Boolean)
    : [];
}

function skyscannerTimeSignature(legs: Record<string, unknown>[]): string {
  const departure = stringValue(legs[0]?.departure);
  const arrival = stringValue(legs.at(-1)?.arrival);
  if (!departure || !arrival) return "";
  return `${clockTimeFromIso(departure)}-${clockTimeFromIso(arrival)}`;
}

function clockTimeFromIso(value: string): string {
  const match = value.match(/T(\d{2}:\d{2})/);
  return match?.[1] || "";
}

function skyscannerDurationText(legs: Record<string, unknown>[]): string {
  const minutes = legs.reduce((total, leg) => total + (numberValue(leg.durationInMinutes) || 0), 0);
  if (!minutes) return "";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours > 0 ? `${hours} hr` : ""}${hours > 0 && mins > 0 ? " " : ""}${mins > 0 ? `${mins} min` : ""}`;
}

function skyscannerStopsText(legs: Record<string, unknown>[]): string {
  const stops = legs.reduce((total, leg) => total + (numberValue(leg.stopCount) || 0), 0);
  if (stops === 0) return "Nonstop";
  return `${stops} ${stops === 1 ? "stop" : "stops"}`;
}

function skyscannerItineraryKey(
  result: Record<string, unknown>,
  legs: Record<string, unknown>[],
  segments: Record<string, unknown>[],
): string {
  const id = stringValue(result.id);
  if (id) return id;
  const segmentKey = segments
    .map((segment) => {
      const origin = stringValue(objectValue(segment.origin).displayCode || objectValue(segment.origin).flightPlaceId);
      const destination = stringValue(
        objectValue(segment.destination).displayCode || objectValue(segment.destination).flightPlaceId,
      );
      const carrier = stringValue(objectValue(segment.marketingCarrier).alternateId);
      const flightNumber = stringValue(segment.flightNumber);
      const departure = stringValue(segment.departure).slice(0, 16);
      return [origin, destination, carrier, flightNumber, departure].filter(Boolean).join("-");
    })
    .filter(Boolean)
    .join("|");
  if (segmentKey) return segmentKey;
  return legs
    .map((leg) => stringValue(leg.id))
    .filter(Boolean)
    .join("|");
}

export function skyscannerSearchResultRows(root: ParentNode): Element[] {
  const rows: Element[] = [];
  const seen = new Set<Element>();
  for (const element of Array.from(root.querySelectorAll(SKYSCANNER_SEARCH_RESULT_ROW_SELECTOR))) {
    const row = skyscannerSearchResultRow(element);
    if (!row || seen.has(row)) continue;
    seen.add(row);
    if (normalizedText(row.textContent || "").length < 12) continue;
    rows.push(row);
  }
  return rows;
}

function skyscannerSearchResultRow(element: Element): Element | null {
  const candidates = [
    element.closest('[data-testid*="itinerary" i]'),
    element.closest("article"),
    element.closest("li"),
    ...ancestorElements(element, 8).filter((ancestor) => ancestor.tagName === "DIV"),
  ];
  return candidates.find(isSkyscannerComparableSearchRow) || null;
}

function ancestorElements(element: Element, limit: number): Element[] {
  const ancestors: Element[] = [];
  let current: Element | null = element;
  while (current && ancestors.length < limit) {
    ancestors.push(current);
    current = current.parentElement;
  }
  return ancestors;
}

function isSkyscannerComparableSearchRow(element: Element | null): element is Element {
  if (!element) return false;
  const text = normalizedText(element.textContent || "");
  if (!hasSkyscannerResultPrice(text)) return false;
  if (
    element.querySelector(
      'a[href*="/transport/flights/"][href*="/config/"], a[href*="/transport/d/"][href*="/config/"]',
    )
  ) {
    return true;
  }
  return Array.from(element.querySelectorAll("button, a")).some((control) =>
    /^select\b/i.test(normalizedText(control.textContent || control.getAttribute("aria-label") || "")),
  );
}

function hasSkyscannerResultPrice(text: string): boolean {
  return /(?:[$€£¥₹₩]\s*\d|\b(?:USD|EUR|GBP|JPY|KRW|INR|AUD|CAD|NZD|SGD|HKD|ZAR)\s*\d|\b\d+\s+deals?\s+from\b)/i.test(
    text,
  );
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
  const currency = currencyFromFormattedPrice(value);
  const priceText = priceTextFromValue(value);
  if (!currency && !priceText) return null;
  return {
    price,
    currency: currency || "UNKNOWN",
    priceText: priceText || value,
  };
}

function parseLocalizedNumber(value: string): number {
  const compact = value.replace(/[\s'’]/g, "");
  if (!compact) return Number.NaN;
  const lastComma = compact.lastIndexOf(",");
  const lastDot = compact.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const groupSeparator = decimalSeparator === "," ? "." : ",";
    return Number(compact.replaceAll(groupSeparator, "").replace(decimalSeparator, "."));
  }
  if (lastComma !== -1) return parseSingleSeparatorNumber(compact, ",");
  if (lastDot !== -1) return parseSingleSeparatorNumber(compact, ".");
  return Number(compact);
}

function parseSingleSeparatorNumber(value: string, separator: "," | "."): number {
  const parts = value.split(separator);
  const last = parts.at(-1) || "";
  if (parts.length > 2)
    return last.length === 3 ? Number(parts.join("")) : Number(`${parts.slice(0, -1).join("")}.${last}`);
  const [head, tail = ""] = parts;
  if (tail.length === 3 && head.length <= 3) return Number(`${head}${tail}`);
  if (!tail) return Number(head);
  return Number(`${head}.${tail}`);
}

function priceTextFromValue(value: string): string {
  const trimmed = value.trim();
  if (currencyFromFormattedPrice(trimmed) && /[0-9]/.test(trimmed) && trimmed.length <= 40) return trimmed;
  return "";
}

function currencyFromFormattedPrice(value: string): string {
  if (/NT\$/i.test(value) || /Taiwan dollars?/i.test(value)) return "TWD";
  if (/HK\$/i.test(value) || /Hong Kong dollars?/i.test(value)) return "HKD";
  if (/CA\$/i.test(value) || /Canadian dollars?/i.test(value)) return "CAD";
  if (/AU\$/i.test(value) || /Australian dollars?/i.test(value)) return "AUD";
  if (/NZ\$/i.test(value) || /New Zealand dollars?/i.test(value)) return "NZD";
  if (/US\$/i.test(value) || /US dollars?|USD/i.test(value)) return "USD";
  if (/\$/i.test(value)) return "USD";
  if (/€|euros?|EUR/i.test(value)) return "EUR";
  if (/£|pounds?|GBP/i.test(value)) return "GBP";
  if (/¥|￥|Japanese yen|JPY|円|日圓|日元/i.test(value)) return "JPY";
  if (/₩|Korean won|KRW/i.test(value)) return "KRW";
  if (/฿|baht|THB/i.test(value)) return "THB";
  if (/ringgit|MYR/i.test(value)) return "MYR";
  if (/yuan|CNY|RMB/i.test(value)) return "CNY";
  if (/₹|rupees?|INR/i.test(value)) return "INR";
  return "";
}

function normalizeSearchKey(text: string): string {
  return text
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}:]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(normalizedText).filter(Boolean)));
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number.NaN;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
