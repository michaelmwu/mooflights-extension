import regionPresetData from "./data/airport-region-presets.json";
import airportData from "./data/airports.json";
import type { Airport, AirportFilters } from "./types";

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

type ItaCityCodeCoverage = {
  code: string;
  label: string;
  airportCodes: string[];
};

export type AirportAreaOption = {
  type: "region" | "continent" | "country";
  value: string;
  label: string;
  searchValue: string;
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
const COUNTRY_DISPLAY = createCountryDisplayNames();
const ITA_CITY_CODE_COVERAGE: ItaCityCodeCoverage[] = [
  cityCodeCoverage("NYC", "New York City", "nyc"),
  cityCodeCoverage("LON", "London", "london"),
  cityCodeCoverage("PAR", "Paris", "paris"),
  cityCodeCoverage("TYO", "Tokyo", "tokyo"),
  cityCodeCoverage("SEL", "Seoul", "seoul"),
  cityCodeCoverage("OSA", "Osaka", "osaka"),
  cityCodeCoverage("BJS", "Beijing", "beijing"),
  cityCodeCoverage("SHA", "Shanghai", "shanghai"),
].filter((coverage) => coverage.airportCodes.length > 0);

export function filterAirports(filters: AirportFilters, list: Airport[] = AIRPORTS): Airport[] {
  if (!hasAirportAreaFilter(filters)) return [];
  const countries = new Set(filters.countries);
  const exclusions = new Set(filters.exclusions.map((code) => code.toUpperCase()));
  const regionCodes = regionAirportCodes(filters.region);
  const cityCodeCoveredAirports =
    filters.coverageMode === "all-airports" ? new Set<string>() : itaCityCodeCoveredAirportCodes(filters);

  const filtered = list
    .filter((airport) => regionCodes.size === 0 || regionCodes.has(airport.code))
    .filter((airport) => regionCodes.size > 0 || !filters.continent || airport.continent === filters.continent)
    .filter((airport) => regionCodes.size > 0 || countries.size === 0 || countries.has(airport.country))
    .filter((airport) => !cityCodeCoveredAirports.has(airport.code))
    .filter((airport) => !exclusions.has(airport.code));

  return list === AIRPORTS ? filtered : filtered.sort((a, b) => a.code.localeCompare(b.code));
}

export function airportCodes(filters: AirportFilters, list: Airport[] = AIRPORTS): string[] {
  return filterAirports(filters, list).map((airport) => airport.code);
}

export function uniqueAirportValues(field: keyof Pick<Airport, "continent" | "country">): string[] {
  return Array.from(new Set(AIRPORTS.map((airport) => String(airport[field])).filter(Boolean))).sort();
}

export function uniqueAirportCountries(): Array<{ code: string; label: string; searchValue: string }> {
  return uniqueAirportValues("country")
    .map((code) => {
      const label = countryLabel(code);
      return {
        code,
        label,
        searchValue: countrySearchValue(code),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label) || a.code.localeCompare(b.code));
}

export function countrySearchValue(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return "";
  return `${countryLabel(normalized)} (${normalized})`;
}

export function countryCodeFromSearchValue(value: string): string {
  const query = value.trim();
  if (!query) return "";
  const countries = uniqueAirportCountries();
  const directCode = query.toUpperCase();
  if (countries.some((country) => country.code === directCode)) return directCode;
  const parenthesizedCode = query.match(/\(([A-Z]{2})\)$/i)?.[1]?.toUpperCase();
  if (parenthesizedCode && countries.some((country) => country.code === parenthesizedCode)) return parenthesizedCode;
  return countries.find((country) => country.label.toLowerCase() === query.toLowerCase())?.code || "";
}

export function uniqueAirportRegions(): AirportRegionPreset[] {
  return [...AIRPORT_REGION_PRESETS].sort((a, b) => a.label.localeCompare(b.label));
}

export function airportAreaOptions(): AirportAreaOption[] {
  return [
    ...uniqueAirportRegions().map((region) => ({
      type: "region" as const,
      value: region.id,
      label: region.label,
      searchValue: `${region.label} (region)`,
    })),
    ...uniqueAirportValues("continent").map((continent) => ({
      type: "continent" as const,
      value: continent,
      label: continent,
      searchValue: `${continent} (continent)`,
    })),
    ...uniqueAirportCountries().map((country) => ({
      type: "country" as const,
      value: country.code,
      label: country.label,
      searchValue: country.searchValue,
    })),
  ];
}

export function airportAreaSearchValue(filters: AirportFilters): string {
  if (filters.region) {
    const region = REGION_PRESETS_BY_ID.get(filters.region);
    return region ? `${region.label} (region)` : filters.region;
  }
  if (filters.continent) return `${filters.continent} (continent)`;
  if (filters.countries[0]) return countrySearchValue(filters.countries[0]);
  return "";
}

export function airportAreaFromSearchValue(value: string): Pick<AirportFilters, "region" | "continent" | "countries"> {
  const query = normalizeSearch(value);
  if (!query) return { region: "", continent: "", countries: [] };

  const options = airportAreaOptions();
  const direct = options.find((option) => normalizeSearch(option.value) === query);
  const exact = direct || options.find((option) => normalizeSearch(option.searchValue) === query);
  const byLabel = exact || options.find((option) => normalizeSearch(option.label) === query);
  const partial =
    byLabel ||
    options.find((option) => normalizeSearch(option.label).startsWith(query)) ||
    options.find((option) => normalizeSearch(option.searchValue).includes(query));
  const option = partial;

  if (!option) return { region: "", continent: "", countries: [] };
  if (option.type === "region") return { region: option.value, continent: "", countries: [] };
  if (option.type === "continent") return { region: "", continent: option.value, countries: [] };
  return { region: "", continent: "", countries: [option.value] };
}

export function itaCityCodeCoverage(filters: AirportFilters): ItaCityCodeCoverage[] {
  if (!hasAirportAreaFilter(filters)) return [];
  const pool = filterAirports({ ...filters, exclusions: [], coverageMode: "all-airports" });
  const poolCodes = new Set(pool.map((airport) => airport.code));

  return ITA_CITY_CODE_COVERAGE.filter((coverage) => coverage.airportCodes.some((code) => poolCodes.has(code)));
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

function itaCityCodeCoveredAirportCodes(filters: AirportFilters): Set<string> {
  return new Set(itaCityCodeCoverage(filters).flatMap((coverage) => coverage.airportCodes));
}

function cityCodeCoverage(code: string, label: string, regionId: string): ItaCityCodeCoverage {
  return {
    code,
    label,
    airportCodes: REGION_PRESETS_BY_ID.get(regionId)?.codes || [],
  };
}

function countryLabel(code: string): string {
  try {
    return COUNTRY_DISPLAY?.of(code) || code;
  } catch {
    return code;
  }
}

function normalizeSearch(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function createCountryDisplayNames(): Intl.DisplayNames | undefined {
  if (typeof Intl === "undefined" || typeof Intl.DisplayNames !== "function") return undefined;

  try {
    return new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    return undefined;
  }
}
