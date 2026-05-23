import { DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES, normalizeGoogleFlightsCountryCodes } from "./googleFlightsBooking";
import type { ExtensionSettings } from "./types";

export const DEFAULT_SETTINGS: ExtensionSettings = {
  hiddenProviderIds: [],
  preferredProviderIds: ["where-to-credit", "google-flights", "kayak"],
  preferredFrequentFlyerPrograms: [],
  frequentFlyerProgramTiers: {},
  affiliateOptOut: false,
  debugMode: false,
  googleFlights: {
    countryCodes: [...DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES],
  },
  airportHelper: {
    region: "",
    continent: "",
    countries: [],
    exclusions: [],
  },
  backend: {
    enabled: false,
    baseUrl: "https://travel.mu-travel.com",
  },
};

const SETTINGS_KEY = "muTravelSettings";

export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return mergeSettings(stored[SETTINGS_KEY]);
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
}

export async function patchSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const current = await loadSettings();
  const next = mergeSettings({
    ...current,
    ...patch,
    airportHelper: {
      ...current.airportHelper,
      ...(patch.airportHelper || {}),
    },
    backend: {
      ...current.backend,
      ...(patch.backend || {}),
    },
    googleFlights: {
      ...current.googleFlights,
      ...(patch.googleFlights || {}),
    },
  });
  await saveSettings(next);
  return next;
}

export function mergeSettings(value: unknown): ExtensionSettings {
  const candidate = isRecord(value) ? value : {};
  const airportHelper = isRecord(candidate.airportHelper) ? candidate.airportHelper : {};
  const backend = isRecord(candidate.backend) ? candidate.backend : {};
  const googleFlights = isRecord(candidate.googleFlights) ? candidate.googleFlights : {};

  return {
    hiddenProviderIds: stringArray(candidate.hiddenProviderIds, DEFAULT_SETTINGS.hiddenProviderIds),
    preferredProviderIds: stringArray(candidate.preferredProviderIds, DEFAULT_SETTINGS.preferredProviderIds),
    preferredFrequentFlyerPrograms: stringArray(
      candidate.preferredFrequentFlyerPrograms,
      DEFAULT_SETTINGS.preferredFrequentFlyerPrograms,
    ),
    frequentFlyerProgramTiers: stringRecord(candidate.frequentFlyerProgramTiers),
    affiliateOptOut: booleanValue(candidate.affiliateOptOut, DEFAULT_SETTINGS.affiliateOptOut),
    debugMode: booleanValue(candidate.debugMode, DEFAULT_SETTINGS.debugMode),
    googleFlights: {
      countryCodes: normalizeGoogleFlightsCountryCodes(
        googleFlights.countryCodes,
        Array.isArray(googleFlights.countryCodes) ? [] : DEFAULT_SETTINGS.googleFlights.countryCodes,
      ),
    },
    airportHelper: {
      region: stringValue(airportHelper.region, DEFAULT_SETTINGS.airportHelper.region),
      continent: stringValue(airportHelper.continent, DEFAULT_SETTINGS.airportHelper.continent),
      countries: stringArray(airportHelper.countries, DEFAULT_SETTINGS.airportHelper.countries),
      exclusions: stringArray(airportHelper.exclusions, DEFAULT_SETTINGS.airportHelper.exclusions),
    },
    backend: {
      enabled: booleanValue(backend.enabled, DEFAULT_SETTINGS.backend.enabled),
      baseUrl: stringValue(backend.baseUrl, DEFAULT_SETTINGS.backend.baseUrl),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : fallback;
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}
