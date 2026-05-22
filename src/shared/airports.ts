import airports from "./data/airports.json";
import type { Airport, AirportFilters } from "./types";

export const AIRPORTS = airports as Airport[];

export function filterAirports(filters: AirportFilters, list: Airport[] = AIRPORTS): Airport[] {
  const countries = new Set(filters.countries);
  const airlines = new Set(filters.airlines);
  const exclusions = new Set(filters.exclusions.map((code) => code.toUpperCase()));

  return list
    .filter((airport) => !filters.continent || airport.continent === filters.continent)
    .filter((airport) => countries.size === 0 || countries.has(airport.country))
    .filter((airport) => !filters.alliance || airport.alliance.includes(filters.alliance))
    .filter((airport) => airlines.size === 0 || airport.airlines.some((airline) => airlines.has(airline)))
    .filter((airport) => !exclusions.has(airport.code))
    .sort((a, b) => a.code.localeCompare(b.code));
}

export function airportCodes(filters: AirportFilters, list: Airport[] = AIRPORTS): string[] {
  return filterAirports(filters, list).map((airport) => airport.code);
}

export function uniqueAirportValues(field: keyof Pick<Airport, "continent" | "country">): string[] {
  return Array.from(new Set(AIRPORTS.map((airport) => String(airport[field])).filter(Boolean))).sort();
}

export function uniqueAirlines(): string[] {
  return Array.from(new Set(AIRPORTS.flatMap((airport) => airport.airlines))).sort();
}

export function uniqueAlliances(): string[] {
  return Array.from(new Set(AIRPORTS.flatMap((airport) => airport.alliance))).sort();
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
