import regionPresetData from "./data/airport-region-presets.json";
import airportData from "./data/airports.json";
import type { Airport, AirportFilters, AppLanguage } from "./types";

type CompactAirport = [
  name: string,
  city: string,
  country: string,
  continent: string,
  latitude: number,
  longitude: number,
];

type AirportData = {
  airports: Record<string, CompactAirport>;
};

type AirportRegionPreset = {
  id: string;
  label: string;
  codes: string[];
};

export type AirportAreaOption = {
  type: "region" | "continent" | "country";
  value: string;
  label: string;
  searchValue: string;
  aliases: string[];
};

const DATA = airportData as unknown as AirportData;
export const AIRPORT_REGION_PRESETS = regionPresetData as AirportRegionPreset[];

export const AIRPORTS: Airport[] = Object.entries(DATA.airports)
  .map(([code, airport]) => ({
    code,
    name: airport[0],
    city: airport[1],
    country: airport[2],
    continent: airport[3],
    latitude: airport[4],
    longitude: airport[5],
  }))
  .sort((a, b) => a.code.localeCompare(b.code));

const AIRPORTS_BY_CODE = new Map(AIRPORTS.map((airport) => [airport.code, airport]));
const REGION_PRESETS_BY_ID = new Map(AIRPORT_REGION_PRESETS.map((preset) => [preset.id, preset]));
const ENGLISH_COUNTRY_DISPLAY = createCountryDisplayNames("en");
const COUNTRY_DISPLAY_BY_LOCALE = new Map<string, Intl.DisplayNames | undefined>([["en", ENGLISH_COUNTRY_DISPLAY]]);

export function filterAirports(filters: AirportFilters, list: Airport[] = AIRPORTS): Airport[] {
  if (!hasAirportAreaFilter(filters)) return [];
  const countries = new Set(filters.countries);
  const exclusions = new Set(filters.exclusions.map((code) => code.toUpperCase()));
  const regionCodes = regionAirportCodes(filters.region);

  const filtered = list
    .filter((airport) => regionCodes.size === 0 || regionCodes.has(airport.code))
    .filter((airport) => regionCodes.size > 0 || !filters.continent || airport.continent === filters.continent)
    .filter((airport) => regionCodes.size > 0 || countries.size === 0 || countries.has(airport.country))
    .filter((airport) => !exclusions.has(airport.code));

  return list === AIRPORTS ? filtered : filtered.sort((a, b) => a.code.localeCompare(b.code));
}

export function airportCodes(filters: AirportFilters, list: Airport[] = AIRPORTS): string[] {
  return filterAirports(filters, list).map((airport) => airport.code);
}

export function uniqueAirportValues(field: keyof Pick<Airport, "continent" | "country">): string[] {
  return Array.from(new Set(AIRPORTS.map((airport) => String(airport[field])).filter(Boolean))).sort();
}

export function uniqueAirportCountries(
  language: AppLanguage = "en",
): Array<{ code: string; label: string; searchValue: string; aliases: string[] }> {
  return uniqueAirportValues("country")
    .map((code) => {
      const label = countryDisplayName(code, language);
      return {
        code,
        label,
        searchValue: countrySearchValue(code, language),
        aliases: countrySearchAliases(code, language),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label) || a.code.localeCompare(b.code));
}

export function countrySearchValue(code: string, language: AppLanguage = "en"): string {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return "";
  const localized = countryDisplayName(normalized, language);
  return localized === countryEnglishName(normalized)
    ? `${localized} (${normalized})`
    : `${localized} (${normalized}) - ${countryEnglishName(normalized)}`;
}

export function countryDisplayName(code: string, language: AppLanguage = "en"): string {
  return countryLabel(code, language);
}

export function countryCodeFromSearchValue(value: string, language: AppLanguage = "en"): string {
  const query = value.trim();
  if (!query) return "";
  const countries = uniqueAirportCountries(language);
  const directCode = query.toUpperCase();
  if (countries.some((country) => country.code === directCode)) return directCode;
  const parenthesizedCode = query.match(/\(([A-Z]{2})\)/i)?.[1]?.toUpperCase();
  if (parenthesizedCode && countries.some((country) => country.code === parenthesizedCode)) return parenthesizedCode;
  const normalizedQuery = normalizeSearch(query);
  return (
    countries.find((country) => country.aliases.some((alias) => normalizeSearch(alias) === normalizedQuery))?.code ||
    countries.find((country) => country.aliases.some((alias) => normalizeSearch(alias).startsWith(normalizedQuery)))
      ?.code ||
    ""
  );
}

export function uniqueAirportRegions(): AirportRegionPreset[] {
  return [...AIRPORT_REGION_PRESETS].sort((a, b) => a.label.localeCompare(b.label));
}

export function airportAreaOptions(language: AppLanguage = "en"): AirportAreaOption[] {
  return [
    ...uniqueAirportRegions().map((region) => airportRegionOption(region, language)),
    ...uniqueAirportValues("continent").map((continent) => airportContinentOption(continent, language)),
    ...uniqueAirportCountries(language).map((country) => ({
      type: "country" as const,
      value: country.code,
      label: country.label,
      searchValue: country.searchValue,
      aliases: country.aliases,
    })),
  ];
}

export function airportAreaSearchValue(filters: AirportFilters, language: AppLanguage = "en"): string {
  if (filters.region) {
    const region = REGION_PRESETS_BY_ID.get(filters.region);
    return region ? airportRegionOption(region, language).searchValue : filters.region;
  }
  if (filters.continent) return airportContinentOption(filters.continent, language).searchValue;
  if (filters.countries[0]) return countrySearchValue(filters.countries[0], language);
  return "";
}

export function airportAreaFromSearchValue(
  value: string,
  language: AppLanguage = "en",
): Pick<AirportFilters, "region" | "continent" | "countries"> {
  const query = normalizeSearch(value);
  if (!query) return { region: "", continent: "", countries: [] };

  const options = airportAreaOptions(language);
  const direct = uniqueAirportAreaOption(options.filter((option) => normalizeSearch(option.value) === query));
  const exactSearchValue = uniqueAirportAreaOption(
    options.filter((option) => normalizeSearch(option.searchValue) === query),
  );
  const exactCountrySearchValue = options.find(
    (option) => option.type === "country" && normalizeSearch(option.searchValue) === query,
  );
  const exactLabel = uniqueAirportAreaOption(options.filter((option) => normalizeSearch(option.label) === query));
  const exactAlias = uniqueAirportAreaOption(
    options.filter((option) => option.aliases.some((alias) => normalizeSearch(alias) === query)),
  );
  const partialLabel = uniqueAirportAreaOption(
    options.filter((option) => normalizeSearch(option.label).startsWith(query)),
  );
  const partialAlias = uniqueAirportAreaOption(
    options.filter((option) => option.aliases.some((alias) => normalizeSearch(alias).startsWith(query))),
  );
  const partialSearchValue = uniqueAirportAreaOption(
    options.filter((option) => normalizeSearch(option.searchValue).includes(query)),
  );
  const option =
    direct ||
    exactCountrySearchValue ||
    exactSearchValue ||
    exactLabel ||
    exactAlias ||
    partialLabel ||
    partialAlias ||
    partialSearchValue;

  if (!option) return { region: "", continent: "", countries: [] };
  if (option.type === "region") return { region: option.value, continent: "", countries: [] };
  if (option.type === "continent") return { region: "", continent: option.value, countries: [] };
  return { region: "", continent: "", countries: [option.value] };
}

function uniqueAirportAreaOption(options: AirportAreaOption[]): AirportAreaOption | null {
  return options.length === 1 ? options[0] : null;
}

export function airportCoordinate(code: string): { latitude: number; longitude: number } | undefined {
  const airport = AIRPORTS_BY_CODE.get(code.toUpperCase());
  if (!airport) return undefined;
  return {
    latitude: airport.latitude / 10_000,
    longitude: airport.longitude / 10_000,
  };
}

export function parseAirportCodes(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toUpperCase()
        .split(/[^A-Z0-9]+/)
        .map((code) => code.trim())
        .filter((code) => /^[A-Z0-9]{3}$/.test(code)),
    ),
  ).sort();
}

function regionAirportCodes(regionId: string): Set<string> {
  const preset = REGION_PRESETS_BY_ID.get(regionId);
  return new Set(preset?.codes || []);
}

function hasAirportAreaFilter(filters: AirportFilters): boolean {
  return Boolean(filters.region || filters.continent || filters.countries.length > 0);
}

function airportRegionOption(region: AirportRegionPreset, language: AppLanguage): AirportAreaOption {
  const label = regionLabel(region, language);
  const typeLabel = areaTypeLabel("region", language);
  return {
    type: "region",
    value: region.id,
    label,
    searchValue: `${label} (${typeLabel})`,
    aliases: uniqueAliases([region.id, label, region.label, `${region.label} (region)`, `${label} (${typeLabel})`]),
  };
}

function airportContinentOption(continent: string, language: AppLanguage): AirportAreaOption {
  const label = continentLabel(continent, language);
  const typeLabel = areaTypeLabel("continent", language);
  return {
    type: "continent",
    value: continent,
    label,
    searchValue: `${label} (${typeLabel})`,
    aliases: uniqueAliases([continent, label, `${continent} (continent)`, `${label} (${typeLabel})`]),
  };
}

function countrySearchAliases(code: string, language: AppLanguage): string[] {
  const normalized = code.trim().toUpperCase();
  const localized = countryDisplayName(normalized, language);
  const english = countryEnglishName(normalized);
  return uniqueAliases([normalized, localized, english, `${localized} (${normalized})`, `${english} (${normalized})`]);
}

function countryLabel(code: string, language: AppLanguage): string {
  const locale = languageLocale(language);
  const display = countryDisplayNames(locale);
  try {
    return display?.of(code) || countryEnglishName(code);
  } catch {
    return countryEnglishName(code);
  }
}

function countryEnglishName(code: string): string {
  try {
    return ENGLISH_COUNTRY_DISPLAY?.of(code) || code;
  } catch {
    return code;
  }
}

function regionLabel(region: AirportRegionPreset, language: AppLanguage): string {
  if (language === "en") return region.label;
  const override = REGION_LABELS[language]?.[region.id];
  if (override) return override;
  if (region.label.endsWith(" Area")) return areaRegionLabel(region.label.slice(0, -" Area".length), language);
  return region.label;
}

function areaRegionLabel(place: string, language: AppLanguage): string {
  if (language === "es") return `Área de ${place}`;
  if (language === "zh-Hans") return `${place}地区`;
  if (language === "zh-Hant") return `${place}地區`;
  if (language === "ja") return `${place}地域`;
  if (language === "ko") return `${place} 지역`;
  return `${place} Area`;
}

function continentLabel(continent: string, language: AppLanguage): string {
  return CONTINENT_LABELS[language]?.[continent] || continent;
}

function areaTypeLabel(type: "region" | "continent", language: AppLanguage): string {
  return AREA_TYPE_LABELS[language]?.[type] || type;
}

function languageLocale(language: AppLanguage): string {
  if (language === "zh-Hans") return "zh-Hans";
  if (language === "zh-Hant") return "zh-Hant";
  return language;
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

function normalizeSearch(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
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

const AREA_TYPE_LABELS: Partial<Record<AppLanguage, Record<"region" | "continent", string>>> = {
  es: { region: "región", continent: "continente" },
  "zh-Hans": { region: "地区", continent: "洲" },
  "zh-Hant": { region: "地區", continent: "洲" },
  ja: { region: "地域", continent: "大陸" },
  ko: { region: "지역", continent: "대륙" },
};

const CONTINENT_LABELS: Partial<Record<AppLanguage, Record<string, string>>> = {
  es: {
    Africa: "África",
    Asia: "Asia",
    Europe: "Europa",
    "North America": "Norteamérica",
    Oceania: "Oceanía",
    "South America": "Sudamérica",
  },
  "zh-Hans": {
    Africa: "非洲",
    Asia: "亚洲",
    Europe: "欧洲",
    "North America": "北美洲",
    Oceania: "大洋洲",
    "South America": "南美洲",
  },
  "zh-Hant": {
    Africa: "非洲",
    Asia: "亞洲",
    Europe: "歐洲",
    "North America": "北美洲",
    Oceania: "大洋洲",
    "South America": "南美洲",
  },
  ja: {
    Africa: "アフリカ",
    Asia: "アジア",
    Europe: "ヨーロッパ",
    "North America": "北米",
    Oceania: "オセアニア",
    "South America": "南米",
  },
  ko: {
    Africa: "아프리카",
    Asia: "아시아",
    Europe: "유럽",
    "North America": "북아메리카",
    Oceania: "오세아니아",
    "South America": "남아메리카",
  },
};

const REGION_LABELS: Partial<Record<AppLanguage, Record<string, string>>> = {
  es: {
    nyc: "Área de Nueva York",
    "sf-bay": "Área de la Bahía de San Francisco",
    "los-angeles": "Área de Los Ángeles",
    "washington-dc": "Área de Washington DC",
    chicago: "Área de Chicago",
    london: "Área de Londres",
    paris: "Área de París",
    tokyo: "Área de Tokio",
    seoul: "Área de Seúl",
    taipei: "Área de Taipéi",
    bangkok: "Área de Bangkok",
    shanghai: "Área de Shanghái",
    beijing: "Área de Pekín",
  },
  "zh-Hans": {
    nyc: "纽约地区",
    "sf-bay": "旧金山湾区",
    "los-angeles": "洛杉矶地区",
    "washington-dc": "华盛顿特区地区",
    chicago: "芝加哥地区",
    london: "伦敦地区",
    paris: "巴黎地区",
    tokyo: "东京地区",
    seoul: "首尔地区",
    taipei: "台北地区",
    osaka: "大阪/关西地区",
    bangkok: "曼谷地区",
    shanghai: "上海地区",
    beijing: "北京地区",
    hawaii: "夏威夷",
  },
  "zh-Hant": {
    nyc: "紐約地區",
    "sf-bay": "舊金山灣區",
    "los-angeles": "洛杉磯地區",
    "washington-dc": "華盛頓特區地區",
    chicago: "芝加哥地區",
    london: "倫敦地區",
    paris: "巴黎地區",
    tokyo: "東京地區",
    seoul: "首爾地區",
    taipei: "台北地區",
    osaka: "大阪/關西地區",
    bangkok: "曼谷地區",
    shanghai: "上海地區",
    beijing: "北京地區",
    hawaii: "夏威夷",
  },
  ja: {
    nyc: "ニューヨーク地域",
    "sf-bay": "サンフランシスコ・ベイエリア",
    "los-angeles": "ロサンゼルス地域",
    "washington-dc": "ワシントンDC地域",
    chicago: "シカゴ地域",
    london: "ロンドン地域",
    paris: "パリ地域",
    tokyo: "東京地域",
    seoul: "ソウル地域",
    taipei: "台北地域",
    osaka: "大阪/関西地域",
    bangkok: "バンコク地域",
    shanghai: "上海地域",
    beijing: "北京地域",
    hawaii: "ハワイ",
  },
  ko: {
    nyc: "뉴욕 지역",
    "sf-bay": "샌프란시스코 베이 지역",
    "los-angeles": "로스앤젤레스 지역",
    "washington-dc": "워싱턴 DC 지역",
    chicago: "시카고 지역",
    london: "런던 지역",
    paris: "파리 지역",
    tokyo: "도쿄 지역",
    seoul: "서울 지역",
    taipei: "타이베이 지역",
    osaka: "오사카/간사이 지역",
    bangkok: "방콕 지역",
    shanghai: "상하이 지역",
    beijing: "베이징 지역",
    hawaii: "하와이",
  },
};
