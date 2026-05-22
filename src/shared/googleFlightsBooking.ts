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
  if (!rawLabel || !/^Book with\b/i.test(rawLabel)) return null;

  const isDirect = Array.from(row.querySelectorAll(".EA71Tc")).some((element) =>
    /^Airline$/i.test(normalizedText(element.textContent || "")),
  );
  const provider = rawLabel
    .replace(/^Book with\s+/i, "")
    .replace(/\s*Airline$/i, "")
    .trim();

  return provider ? { provider, isDirect } : null;
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
  const amount = value.match(/([0-9][0-9,.]*)/);
  if (!amount) return null;
  const price = Number(amount[1].replaceAll(",", ""));
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
  if (/^(?:[A-Z]{2,3}\$|[A-Z]{3}|[$€£¥￥₩₹฿₫₱₪₦₺])\s?[0-9][0-9,.]*(?:\s?[A-Z]{3})?$/i.test(trimmed)) {
    return trimmed;
  }
  const usd = trimmed.match(/([0-9][0-9,.]*)\s+US dollars?\b/i);
  if (usd) return `$${Number(usd[1].replaceAll(",", "")).toLocaleString()}`;
  return "";
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
