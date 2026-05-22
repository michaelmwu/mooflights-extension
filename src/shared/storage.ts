import type { ExtensionSettings } from "./types";

export const DEFAULT_SETTINGS: ExtensionSettings = {
  hiddenProviderIds: [],
  preferredProviderIds: ["where-to-credit", "google-flights", "kayak"],
  affiliateOptOut: false,
  debugMode: false,
  airportHelper: {
    continent: "",
    countries: [],
    alliance: "",
    airlines: [],
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
  const next = mergeSettings({ ...current, ...patch });
  await saveSettings(next);
  return next;
}

export function mergeSettings(value: unknown): ExtensionSettings {
  const candidate = value as Partial<ExtensionSettings> | undefined;
  return {
    ...DEFAULT_SETTINGS,
    ...(candidate || {}),
    airportHelper: {
      ...DEFAULT_SETTINGS.airportHelper,
      ...(candidate?.airportHelper || {}),
    },
    backend: {
      ...DEFAULT_SETTINGS.backend,
      ...(candidate?.backend || {}),
    },
  };
}
