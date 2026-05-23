import { type GoogleFlightsCountryResult, googleFlightsCountryUrl } from "../shared/googleFlightsBooking";
import type { RemoteProviderMetadata } from "../shared/types";

type RuntimeMessage = {
  command?: string;
  baseUrl?: string;
  countries?: string[];
  baselineOptionCount?: number;
};

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    openOptionsPage();
  }
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const payload = message as RuntimeMessage;
  if (payload.command === "openOptionsPage") {
    openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  if (payload.command === "compareGoogleFlightsCountries") {
    void compareGoogleFlightsCountries(payload)
      .then((results) => sendResponse({ ok: true, results }))
      .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "Compare failed." }));
    return true;
  }

  if (payload.command !== "fetchProviderMetadata") return false;

  void fetchProviderMetadata(payload.baseUrl || "")
    .then((providers) => sendResponse({ providers }))
    .catch(() => sendResponse({ providers: [] }));
  return true;
});

async function compareGoogleFlightsCountries(payload: RuntimeMessage): Promise<GoogleFlightsCountryResult[]> {
  const baseUrl = payload.baseUrl || "";
  if (!baseUrl) throw new Error("Missing Google Flights URL.");
  const countries = Array.from(new Set((payload.countries || []).filter((country) => /^[A-Z]{2}$/.test(country))));
  const baselineOptionCount = payload.baselineOptionCount || 0;
  return mapWithConcurrency(countries, 3, (country) =>
    compareGoogleFlightsCountry(baseUrl, country, baselineOptionCount),
  );
}

async function compareGoogleFlightsCountry(
  baseUrl: string,
  country: string,
  baselineOptionCount: number,
): Promise<GoogleFlightsCountryResult> {
  const url = googleFlightsCountryUrl(baseUrl, country);
  let tabId: number | undefined;
  try {
    const tab = await createInactiveTab(url);
    tabId = tab.id;
    if (typeof tabId !== "number") throw new Error("Chrome did not provide a tab id.");
    await waitForTabComplete(tabId);
    let result = await parseGoogleFlightsTab(tabId, country, url);
    if (shouldRetrySparseResult(result, baselineOptionCount)) {
      await reloadTab(tabId);
      await waitForTabComplete(tabId);
      result = await parseGoogleFlightsTab(tabId, country, url);
      result.refreshed = true;
      if (isSparseResult(result, baselineOptionCount)) result.status = "sparse";
    }
    return result;
  } catch (error) {
    return {
      country,
      url,
      options: [],
      status: "error",
      error: error instanceof Error ? error.message : "Country check failed.",
    };
  } finally {
    if (typeof tabId === "number") await removeTab(tabId);
  }
}

function shouldRetrySparseResult(result: GoogleFlightsCountryResult, baselineOptionCount: number): boolean {
  return baselineOptionCount > 3 && result.status !== "error" && result.options.length <= 3 && !result.refreshed;
}

function isSparseResult(result: GoogleFlightsCountryResult, baselineOptionCount: number): boolean {
  return (
    baselineOptionCount > 3 && result.status !== "error" && result.options.length > 0 && result.options.length <= 3
  );
}

async function parseGoogleFlightsTab(tabId: number, country: string, url: string): Promise<GoogleFlightsCountryResult> {
  let latest: GoogleFlightsCountryResult | null = null;
  const deadline = Date.now() + 18000;
  while (Date.now() < deadline) {
    try {
      latest = await sendTabMessage<GoogleFlightsCountryResult>(tabId, {
        command: "parseGoogleFlightsBookingOptions",
      });
      if (latest.options.length > 0) return { ...latest, country, url };
    } catch {
      // The content script may not be ready immediately after the tab completes.
    }
    await delay(600);
  }
  if (latest) return { ...latest, country, url };
  return { country, url, options: [], status: "empty" };
}

async function fetchProviderMetadata(baseUrl: string): Promise<RemoteProviderMetadata[]> {
  if (!baseUrl) return [];
  const origin = hostPermissionOrigin(baseUrl);
  if (origin && !(await hasHostPermission(origin))) return [];

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/extension/v1/providers`, {
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok) return [];
  const body = (await response.json()) as { providers?: RemoteProviderMetadata[] };
  return Array.isArray(body.providers) ? body.providers : [];
}

async function hasHostPermission(origin: string): Promise<boolean> {
  if (!chrome.permissions?.contains) return false;
  return chrome.permissions.contains({ origins: [origin] });
}

function hostPermissionOrigin(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    return `${url.origin}/*`;
  } catch {
    return "";
  }
}

function openOptionsPage(): void {
  const openOptionsTab = () => {
    void chrome.tabs.create({ url: chrome.runtime.getURL("options/index.html") });
  };

  if (typeof chrome.runtime.openOptionsPage !== "function") {
    openOptionsTab();
    return;
  }

  chrome.runtime.openOptionsPage(() => {
    if (!chrome.runtime.lastError) return;
    openOptionsTab();
  });
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(values[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, runWorker));
  return results;
}

function createInactiveTab(url: string): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url, active: false }, (tab) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tab);
    });
  });
}

function reloadTab(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.tabs.reload(tabId, {}, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function removeTab(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    chrome.tabs.remove(tabId, () => resolve());
  });
}

function waitForTabComplete(tabId: number): Promise<void> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(done, 20000);

    function done(): void {
      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }

    function listener(updatedTabId: number, changeInfo: { status?: string }): void {
      if (updatedTabId === tabId && changeInfo.status === "complete") done();
    }

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId, (tab) => {
      if (!chrome.runtime.lastError && tab.status === "complete") done();
    });
  });
}

function sendTabMessage<T>(tabId: number, message: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response: T) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(response);
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
