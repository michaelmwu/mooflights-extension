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
    const text = normalizedText(ariaLabel || element.textContent || "");
    const usd = text.match(/(?:^|\b)([0-9][0-9,.]*)\s+US dollars?\b/i);
    if (usd) {
      return {
        price: Number(usd[1].replaceAll(",", "")),
        currency: "USD",
        priceText: `$${Number(usd[1].replaceAll(",", "")).toLocaleString()}`,
      };
    }

    const dollar = text.match(/^\$([0-9][0-9,.]*)$/);
    if (dollar) {
      return {
        price: Number(dollar[1].replaceAll(",", "")),
        currency: "USD",
        priceText: `$${Number(dollar[1].replaceAll(",", "")).toLocaleString()}`,
      };
    }
  }

  return null;
}

function normalizedText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
