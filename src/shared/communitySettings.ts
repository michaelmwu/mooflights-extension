import type { ExtensionSettings } from "./types";

// Keep the background worker's consent read independent of provider/airport registries.
const SETTINGS_KEY = "muTravelSettings";
export const COMMUNITY_PROMPT_KEY = "mooFlightsCommunityPromptDecision";
export const COMMUNITY_CONSENT_VERSION = "community-v2";
export const DEFAULT_HISTORY_API_ORIGIN = "https://app.mooflights.com";

export function historyBaseUrl(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return "";
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return "";
    return url.origin;
  } catch {
    return "";
  }
}

export function normalizeCommunityHistory(candidate: unknown): ExtensionSettings["communityHistory"] {
  const value = candidate && typeof candidate === "object" ? (candidate as Record<string, unknown>) : {};
  return {
    enabled: value.enabled === true && value.consentVersion === COMMUNITY_CONSENT_VERSION,
    consentVersion: typeof value.consentVersion === "string" ? value.consentVersion.slice(0, 32) : "",
    baseUrl: historyBaseUrl(value.baseUrl),
  };
}

export async function loadCommunitySettings(): Promise<{ communityHistory: ExtensionSettings["communityHistory"] }> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  const settings = stored[SETTINGS_KEY];
  const candidate =
    settings && typeof settings === "object" ? (settings as Record<string, unknown>).communityHistory : undefined;
  return { communityHistory: normalizeCommunityHistory(candidate) };
}
