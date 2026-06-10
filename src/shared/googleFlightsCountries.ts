import { DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES } from "./googleFlightsBooking";
import type { AppLanguage } from "./types";

const AVAILABLE_GOOGLE_FLIGHTS_COUNTRY_CODES = [
  "AF",
  "AL",
  "DZ",
  "AS",
  "AD",
  "AO",
  "AG",
  "AR",
  "AM",
  "AU",
  "AT",
  "AZ",
  "BS",
  "BH",
  "BD",
  "BY",
  "BE",
  "BZ",
  "BJ",
  "BT",
  "BO",
  "BA",
  "BW",
  "BR",
  "BN",
  "BG",
  "BF",
  "BI",
  "KH",
  "CM",
  "CA",
  "CV",
  "CF",
  "TD",
  "CL",
  "CN",
  "CO",
  "CG",
  "CD",
  "CK",
  "CR",
  "CI",
  "HR",
  "CU",
  "CY",
  "CZ",
  "DK",
  "DJ",
  "DM",
  "DO",
  "EC",
  "EG",
  "SV",
  "EE",
  "ET",
  "FJ",
  "FI",
  "FR",
  "GA",
  "GM",
  "GE",
  "DE",
  "GH",
  "GI",
  "GR",
  "GL",
  "GT",
  "GG",
  "GY",
  "HT",
  "HN",
  "HK",
  "HU",
  "IS",
  "IN",
  "ID",
  "IR",
  "IQ",
  "IE",
  "IM",
  "IL",
  "IT",
  "JM",
  "JP",
  "JE",
  "JO",
  "KZ",
  "KE",
  "KI",
  "KW",
  "KG",
  "LA",
  "LV",
  "LB",
  "LS",
  "LY",
  "LI",
  "LT",
  "LU",
  "MG",
  "MW",
  "MY",
  "MV",
  "ML",
  "MT",
  "MU",
  "MX",
  "FM",
  "MD",
  "MN",
  "ME",
  "MA",
  "MZ",
  "MM",
  "NA",
  "NR",
  "NP",
  "NL",
  "NZ",
  "NI",
  "NE",
  "NG",
  "NU",
  "MK",
  "NO",
  "OM",
  "PK",
  "PS",
  "PA",
  "PG",
  "PY",
  "PE",
  "PH",
  "PN",
  "PL",
  "PT",
  "PR",
  "QA",
  "RO",
  "RU",
  "RW",
  "WS",
  "SM",
  "ST",
  "SA",
  "SN",
  "RS",
  "SC",
  "SL",
  "SG",
  "SK",
  "SI",
  "SB",
  "SO",
  "ZA",
  "KR",
  "ES",
  "LK",
  "SH",
  "VC",
  "SR",
  "SE",
  "CH",
  "TW",
  "TJ",
  "TZ",
  "TH",
  "TL",
  "TG",
  "TO",
  "TT",
  "TN",
  "TR",
  "TM",
  "UG",
  "UA",
  "AE",
  "GB",
  "US",
  "UY",
  "UZ",
  "VU",
  "VE",
  "VN",
  "ZM",
  "ZW",
];
const AVAILABLE_GOOGLE_FLIGHTS_COUNTRY_CODE_SET = new Set(AVAILABLE_GOOGLE_FLIGHTS_COUNTRY_CODES);

const NOT_USEFUL_GOOGLE_FLIGHTS_COUNTRY_CODES = new Set([
  "AF",
  "AD",
  "AG",
  "AL",
  "AM",
  "AO",
  "AQ",
  "AR",
  "AS",
  "AX",
  "AZ",
  "BA",
  "BB",
  "BD",
  "BF",
  "BI",
  "BJ",
  "BL",
  "BN",
  "BO",
  "BS",
  "BT",
  "BV",
  "BW",
  "BY",
  "BZ",
  "CD",
  "CF",
  "CG",
  "CI",
  "CK",
  "CM",
  "CR",
  "CU",
  "CV",
  "DJ",
  "DM",
  "DO",
  "DZ",
  "EG",
  "EH",
  "ER",
  "ET",
  "FJ",
  "FM",
  "FO",
  "GA",
  "GD",
  "GE",
  "GG",
  "GH",
  "GI",
  "GL",
  "GM",
  "GN",
  "GQ",
  "GT",
  "GU",
  "GW",
  "GY",
  "HN",
  "HT",
  "IM",
  "IQ",
  "IR",
  "IS",
  "JE",
  "JM",
  "KE",
  "KG",
  "KH",
  "KI",
  "KM",
  "KN",
  "KP",
  "KZ",
  "LA",
  "LB",
  "LC",
  "LI",
  "LK",
  "LR",
  "LS",
  "LU",
  "LY",
  "MA",
  "MC",
  "ME",
  "MG",
  "MH",
  "MK",
  "ML",
  "MM",
  "MN",
  "MO",
  "MP",
  "MR",
  "MT",
  "MU",
  "MV",
  "MW",
  "MZ",
  "NA",
  "NE",
  "NG",
  "NI",
  "NP",
  "NR",
  "NU",
  "PA",
  "PG",
  "PS",
  "PW",
  "PY",
  "RU",
  "RW",
  "SB",
  "SC",
  "SD",
  "SH",
  "SI",
  "SJ",
  "SK",
  "SL",
  "SM",
  "SN",
  "SO",
  "SR",
  "SS",
  "ST",
  "SV",
  "SY",
  "SZ",
  "TD",
  "TG",
  "TJ",
  "TL",
  "TM",
  "TN",
  "TO",
  "TT",
  "TV",
  "TZ",
  "UG",
  "UM",
  "UY",
  "UZ",
  "VA",
  "VC",
  "VE",
  "VI",
  "VU",
  "WS",
  "XK",
  "YE",
  "ZM",
  "ZW",
]);

const ENGLISH_COUNTRY_DISPLAY = createCountryDisplayNames("en");
const COUNTRY_DISPLAY_BY_LOCALE = new Map<string, Intl.DisplayNames | undefined>([["en", ENGLISH_COUNTRY_DISPLAY]]);

export function allGoogleFlightsCountryCodes(): string[] {
  const defaultCodes = new Set(DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES);
  const remainingCodes = AVAILABLE_GOOGLE_FLIGHTS_COUNTRY_CODES.filter(
    (code) => !defaultCodes.has(code) && !NOT_USEFUL_GOOGLE_FLIGHTS_COUNTRY_CODES.has(code),
  );

  return [...DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES, ...remainingCodes];
}

export function isAllGoogleFlightsCountryCodes(codes: readonly string[]): boolean {
  const allCountries = allGoogleFlightsCountryCodes();
  const selectedCodes = new Set(codes.map((code) => code.trim().toUpperCase()).filter(Boolean));

  return selectedCodes.size === allCountries.length && allCountries.every((code) => selectedCodes.has(code));
}

export function filterAvailableGoogleFlightsCountryCodes(codes: readonly string[]): string[] {
  const seen = new Set<string>();
  return codes
    .map((code) => code.trim().toUpperCase())
    .filter((code) => /^[A-Z]{2}$/.test(code) && AVAILABLE_GOOGLE_FLIGHTS_COUNTRY_CODE_SET.has(code))
    .filter((code) => {
      if (seen.has(code)) return false;
      seen.add(code);
      return true;
    });
}

export function googleFlightsCountryOptions(
  language: AppLanguage = "en",
): Array<{ code: string; label: string; searchValue: string; aliases: string[] }> {
  return googleFlightsCountryOptionsForCodes(allGoogleFlightsCountryCodes(), language);
}

export function googleFlightsAvailableCountryOptions(
  language: AppLanguage = "en",
): Array<{ code: string; label: string; searchValue: string; aliases: string[] }> {
  return googleFlightsCountryOptionsForCodes(AVAILABLE_GOOGLE_FLIGHTS_COUNTRY_CODES, language);
}

export function googleFlightsCountryCodeFromSearchValue(
  value: string,
  countries: Array<{
    code: string;
    label: string;
    searchValue: string;
    aliases?: string[];
  }> = googleFlightsAvailableCountryOptions(),
): string {
  const query = value.trim();
  if (!query) return "";

  const directCode = query.toUpperCase();
  if (countries.some((country) => country.code === directCode)) return directCode;

  const parenthesizedCode = query.match(/\(([A-Z]{2})\)/i)?.[1]?.toUpperCase();
  if (parenthesizedCode && countries.some((country) => country.code === parenthesizedCode)) {
    return parenthesizedCode;
  }

  const normalizedQuery = normalizeSearch(query);
  return (
    countries.find((country) => countryAliases(country).some((alias) => normalizeSearch(alias) === normalizedQuery))
      ?.code ||
    countries.find((country) =>
      countryAliases(country).some((alias) => normalizeSearch(alias).startsWith(normalizedQuery)),
    )?.code ||
    ""
  );
}

function googleFlightsCountryOptionsForCodes(
  codes: string[],
  language: AppLanguage,
): Array<{ code: string; label: string; searchValue: string; aliases: string[] }> {
  return codes
    .map((code) => {
      const label = googleFlightsCountryLabel(code, language);
      return {
        code,
        label,
        searchValue: googleFlightsCountrySearchValue(code, language),
        aliases: googleFlightsCountryAliases(code, language),
      };
    })
    .sort((left, right) => {
      const leftDefaultIndex = DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES.indexOf(left.code);
      const rightDefaultIndex = DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES.indexOf(right.code);
      if (leftDefaultIndex >= 0 || rightDefaultIndex >= 0) {
        return (
          (leftDefaultIndex >= 0 ? leftDefaultIndex : Number.POSITIVE_INFINITY) -
          (rightDefaultIndex >= 0 ? rightDefaultIndex : Number.POSITIVE_INFINITY)
        );
      }
      return left.label.localeCompare(right.label) || left.code.localeCompare(right.code);
    });
}

function googleFlightsCountrySearchValue(code: string, language: AppLanguage): string {
  const label = googleFlightsCountryLabel(code, language);
  const english = googleFlightsCountryEnglishLabel(code);
  return label === english ? `${label} (${code})` : `${label} (${code}) - ${english}`;
}

function googleFlightsCountryAliases(code: string, language: AppLanguage): string[] {
  const label = googleFlightsCountryLabel(code, language);
  const english = googleFlightsCountryEnglishLabel(code);
  return uniqueAliases([code, label, english, `${label} (${code})`, `${english} (${code})`]);
}

function countryAliases(country: { code: string; label: string; searchValue: string; aliases?: string[] }): string[] {
  return country.aliases || [country.code, country.label, country.searchValue];
}

function googleFlightsCountryLabel(code: string, language: AppLanguage): string {
  const display = countryDisplayNames(languageLocale(language));
  try {
    return display?.of(code) || googleFlightsCountryEnglishLabel(code);
  } catch {
    return googleFlightsCountryEnglishLabel(code);
  }
}

function googleFlightsCountryEnglishLabel(code: string): string {
  try {
    return ENGLISH_COUNTRY_DISPLAY?.of(code) || code;
  } catch {
    return code;
  }
}

function languageLocale(language: AppLanguage): string {
  if (language === "zh-Hans") return "zh-Hans";
  if (language === "zh-Hant") return "zh-Hant";
  return language;
}

function normalizeSearch(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function uniqueAliases(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      const normalized = normalizeSearch(value);
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

function createCountryDisplayNames(locale: string): Intl.DisplayNames | undefined {
  if (typeof Intl === "undefined" || typeof Intl.DisplayNames !== "function") return undefined;

  try {
    return new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    return undefined;
  }
}

function countryDisplayNames(locale: string): Intl.DisplayNames | undefined {
  if (!COUNTRY_DISPLAY_BY_LOCALE.has(locale)) {
    COUNTRY_DISPLAY_BY_LOCALE.set(locale, createCountryDisplayNames(locale));
  }
  return COUNTRY_DISPLAY_BY_LOCALE.get(locale);
}
