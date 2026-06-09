import type { ExtensionSettings, RemoteProviderMetadata } from "./types";

export async function fetchRemoteProviderMetadata(settings: ExtensionSettings): Promise<RemoteProviderMetadata[]> {
  if (typeof __MOOFLIGHTS_DEV_BUILD__ !== "undefined" && !__MOOFLIGHTS_DEV_BUILD__) return [];
  if (!settings.backend.enabled || !settings.backend.baseUrl) return [];

  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.id) {
      const response = (await chrome.runtime.sendMessage({
        command: "fetchProviderMetadata",
        baseUrl: settings.backend.baseUrl,
      })) as { providers?: RemoteProviderMetadata[] } | undefined;
      return Array.isArray(response?.providers) ? response.providers : [];
    }

    const response = await fetch(`${settings.backend.baseUrl.replace(/\/$/, "")}/api/extension/v1/providers`, {
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { providers?: RemoteProviderMetadata[] };
    return Array.isArray(body.providers) ? body.providers : [];
  } catch {
    return [];
  }
}
