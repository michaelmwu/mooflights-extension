import type { RemoteProviderMetadata } from "../shared/types";

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    openOptionsPage();
  }
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const payload = message as { command?: string; baseUrl?: string };
  if (payload.command === "openOptionsPage") {
    openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  if (payload.command !== "fetchProviderMetadata") return false;

  void fetchProviderMetadata(payload.baseUrl || "")
    .then((providers) => sendResponse({ providers }))
    .catch(() => sendResponse({ providers: [] }));
  return true;
});

async function fetchProviderMetadata(baseUrl: string): Promise<RemoteProviderMetadata[]> {
  if (!baseUrl) return [];
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/extension/v1/providers`, {
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) return [];
  const body = (await response.json()) as { providers?: RemoteProviderMetadata[] };
  return Array.isArray(body.providers) ? body.providers : [];
}

function openOptionsPage(): void {
  void chrome.runtime.openOptionsPage().catch(() => undefined);
}
