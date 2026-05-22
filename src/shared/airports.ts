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

export function filterAirports(filters: AirportFilters, list: Airport[] = AIRPORTS): Airport[] {
  const countries = new Set(filters.countries);
  const exclusions = new Set(filters.exclusions.map((code) => code.toUpperCase()));
  const regionCodes = regionAirportCodes(filters.region);

  return list
    .filter((airport) => regionCodes.size === 0 || regionCodes.has(airport.code))
    .filter((airport) => regionCodes.size > 0 || !filters.continent || airport.continent === filters.continent)
    .filter((airport) => regionCodes.size > 0 || countries.size === 0 || countries.has(airport.country))
    .filter((airport) => !exclusions.has(airport.code))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export function airportCodes(filters: AirportFilters, list: Airport[] = AIRPORTS): string[] {
  return filterAirports(filters, list).map((airport) => airport.code);
}

export function uniqueAirportValues(field: keyof Pick<Airport, "continent" | "country">): string[] {
  return Array.from(new Set(AIRPORTS.map((airport) => String(airport[field])).filter(Boolean))).sort();
}

export function uniqueAirportRegions(): AirportRegionPreset[] {
  return [...AIRPORT_REGION_PRESETS].sort((a, b) => a.label.localeCompare(b.label));
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
