import "../shared/firefoxChromeCompat";
import { validatedUsageSignal } from "../shared/analytics";
import {
  buildFareObservation,
  buildMarketObservation,
  type FareQuery,
  marketQueriesForSearchRows,
  marketQueryForUrl,
} from "../shared/communityHistory";
import { type CountryResult, countryComparisonUrl, type SearchCountryResult } from "../shared/countryComparison";
import { isSkyscannerFlightsPageUrl } from "../shared/skyscannerBooking";
import type { NormalizedItinerary, RemoteProviderMetadata } from "../shared/types";
import {
  contributeHistory,
  deleteSharedHistory,
  estimateFare,
  prepareHistoryDeletionRequest,
  prioritizeCountries,
  prioritizeSearchCountries,
  recordUsage,
} from "./communityHistory";
import { updateComparisonCache } from "./comparisonCache";
import { ComparisonTabRegistry, workerTabUrls } from "./comparisonTabs";
import { fetchProviderMetadataWithCache } from "./providerMetadata";
import { createSerialQueue } from "./serialQueue";
import { sendTabMessage } from "./tabMessaging";

type RuntimeMessage = {
  command?: string;
  usageSignal?: unknown;
  baseline?: CountryResult;
  searchBaseline?: SearchCountryResult;
  itinerary?: NormalizedItinerary;
  fareQuery?: FareQuery;
  baseUrl?: string;
  countries?: string[];
  baselineOptionCount?: number;
  baselineSearchResultCount?: number;
  matrixUrl?: string;
  openedByPage?: boolean;
  requestId?: string;
  waitForExpansion?: boolean;
};

type GoogleFlightsSearchExpansionResult = {
  ok?: boolean;
  clicked?: boolean;
  beforeRows?: number;
  afterRows?: number;
};

type GoogleFlightsComparisonRun = {
  sourceTabId: number;
  requestId: string;
  controller: AbortController;
  activeTabIds: Set<number>;
  closedTabIds: Set<number>;
};

const GOOGLE_FLIGHTS_COMPARE_CONCURRENCY = 3;
const GOOGLE_FLIGHTS_TAB_CREATE_SPACING_MS = 750;
const MATRIX_AUTO_OPEN_TABS_STORAGE_KEY = "muTravelMatrixAutoOpenTabs";
const LEGACY_MATRIX_AUTO_OPEN_UNTIL_STORAGE_KEY = "muTravelMatrixAutoOpenUntil";
const MATRIX_AUTO_OPEN_TTL_MS = 5 * 60 * 1000;

let tabCreateQueue = Promise.resolve();
let lastTabCreatedAt = 0;
const activeGoogleFlightsComparisonRuns = new Map<string, GoogleFlightsComparisonRun>();
const serializeWorkerStorage = createSerialQueue();
const comparisonTabs = new ComparisonTabRegistry(
  chrome.storage.session || chrome.storage.local,
  getTabOrNull,
  removeTab,
);
void comparisonTabs.ready.catch(() => undefined);

chrome.tabs.onRemoved.addListener((tabId) => {
  for (const run of activeGoogleFlightsComparisonRuns.values()) {
    if (run.sourceTabId === tabId) cancelGoogleFlightsComparison(run);
    else if (run.activeTabIds.delete(tabId)) run.closedTabIds.add(tabId);
  }
  void comparisonTabs.forget(tabId).catch(() => undefined);
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    openOptionsPage();
  }
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;
  const payload = message as RuntimeMessage;
  if (payload.command === "updateComparisonCache") {
    void updateComparisonCache(message)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (payload.command === "getComparisonWorkerContext") {
    const tabId = sender.tab?.id;
    if (typeof tabId !== "number") {
      sendResponse({ worker: false });
      return false;
    }
    void comparisonTabs
      .context(tabId, sender.url || sender.tab?.url)
      .then((record) =>
        sendResponse(
          record ? { worker: true, sourceTabId: record.sourceTabId, requestId: record.requestId } : { worker: false },
        ),
      )
      .catch(() => sendResponse({ worker: false }));
    return true;
  }
  if (payload.command === "recordUsageEvent") {
    const signal = validatedUsageSignal(payload.usageSignal);
    if (
      signal &&
      sender.tab?.url &&
      (isGoogleFlightsSender(sender.tab.url) || isSkyscannerFlightsPageUrl(sender.tab.url))
    )
      void recordUsage(signal);
    sendResponse({ ok: true });
    return false;
  }
  if (payload.command === "recordConfirmedFare" && sender.tab?.url?.startsWith("https://matrix.itasoftware.com/")) {
    try {
      void contributeHistory(
        "fare",
        payload.itinerary ? buildFareObservation(payload.itinerary, crypto.randomUUID()) : null,
      );
    } catch {
      /* Ignore malformed captures. */
    }
    sendResponse({ ok: true });
    return false;
  }
  if (payload.command === "estimateHistoricalFare" && isGoogleFlightsSender(sender.tab?.url) && payload.fareQuery) {
    void estimateFare(payload.fareQuery).then(sendResponse);
    return true;
  }
  if (
    payload.command === "prepareHistoryDeletionRequest" &&
    sender.url === chrome.runtime.getURL("options/index.html")
  ) {
    void prepareHistoryDeletionRequest(payload.baseUrl || "")
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch(() => sendResponse({ ok: false, error: "Could not prepare deletion request. Please retry." }));
    return true;
  }
  if (payload.command === "deleteSharedHistory" && sender.url === chrome.runtime.getURL("options/index.html")) {
    void deleteSharedHistory(payload.baseUrl || "")
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false, error: "Could not delete shared history. Please retry." }));
    return true;
  }
  if (payload.command === "openOptionsPage") {
    openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  if (payload.command === "openMatrixWithAutoOpen") {
    void openMatrixWithAutoOpen(payload.matrixUrl || "", payload.openedByPage === true, sender.tab?.windowId)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : "Could not open ITA Matrix." });
      });
    return true;
  }

  if (payload.command === "consumeMatrixAutoOpenForTab") {
    void consumeMatrixAutoOpenForTab(sender.tab?.id)
      .then((ok) => sendResponse({ ok }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (payload.command === "compareGoogleFlightsCountries") {
    const progressTabId = sender.tab?.id;
    if (typeof progressTabId !== "number") {
      sendResponse({ ok: false, error: "Missing Google Flights tab." });
      return false;
    }
    if (typeof payload.requestId !== "string" || !payload.requestId) {
      sendResponse({ ok: false, error: "Missing Google Flights comparison request." });
      return false;
    }
    const run = startGoogleFlightsComparison(progressTabId, payload.requestId);
    void comparisonTabs.ready
      .then(() => compareGoogleFlightsCountries(payload, progressTabId, run))
      .catch((error) => {
        finishGoogleFlightsComparison(run);
        const message = error instanceof Error ? error.message : "Compare failed.";
        sendGoogleFlightsCountryComplete(progressTabId, payload.requestId, {
          ok: false,
          error: message,
        });
      });
    sendResponse({ ok: true, accepted: true });
    return false;
  }

  if (payload.command === "compareGoogleFlightsSearchCountries") {
    const progressTabId = sender.tab?.id;
    if (typeof progressTabId !== "number") {
      sendResponse({ ok: false, error: "Missing Google Flights tab." });
      return false;
    }
    if (typeof payload.requestId !== "string" || !payload.requestId) {
      sendResponse({ ok: false, error: "Missing Google Flights comparison request." });
      return false;
    }
    const run = startGoogleFlightsComparison(progressTabId, payload.requestId);
    void comparisonTabs.ready
      .then(() => compareGoogleFlightsSearchCountries(payload, progressTabId, run))
      .catch((error) => {
        finishGoogleFlightsComparison(run);
        const message = error instanceof Error ? error.message : "Search comparison failed.";
        sendGoogleFlightsSearchComplete(progressTabId, payload.requestId, {
          ok: false,
          error: message,
        });
      });
    sendResponse({ ok: true, accepted: true });
    return false;
  }

  if (payload.command === "cancelGoogleFlightsComparison") {
    const progressTabId = sender.tab?.id;
    if (typeof progressTabId !== "number" || typeof payload.requestId !== "string" || !payload.requestId) {
      sendResponse({ ok: false });
      return false;
    }
    const run = activeGoogleFlightsComparisonRuns.get(googleFlightsComparisonRunKey(progressTabId, payload.requestId));
    if (!run) {
      sendResponse({ ok: false });
      return false;
    }
    cancelGoogleFlightsComparison(run);
    sendResponse({ ok: true });
    return false;
  }

  if (payload.command !== "fetchProviderMetadata") return false;

  void fetchProviderMetadata(payload.baseUrl || "")
    .then((providers) => sendResponse({ providers }))
    .catch(() => sendResponse({ providers: [] }));
  return true;
});

async function compareGoogleFlightsCountries(
  payload: RuntimeMessage,
  progressTabId: number,
  run: GoogleFlightsComparisonRun,
): Promise<void> {
  const baseUrl = payload.baseUrl || "";
  if (!baseUrl) throw new Error("Missing Google Flights URL.");
  const selectedCountries = Array.from(
    new Set((payload.countries || []).filter((country) => /^[A-Z]{2}$/.test(country))),
  );
  const usageRunId = crypto.randomUUID();
  const usageStartedAt = performance.now();
  const usageSurface = isSkyscannerFlightsPageUrl(baseUrl)
    ? ("skyscanner-booking" as const)
    : ("google-flights-booking" as const);
  let usageCompleted = 0;
  let usageReady = 0;
  let usageOutcome: "completed" | "cancelled" | "error" = "completed";
  void recordUsage({
    eventName: "comparison.started",
    surface: usageSurface,
    runId: usageRunId,
    requestedCountryCount: selectedCountries.length,
  });
  const countries = await prioritizeCountries(marketQueryForUrl(baseUrl, selectedCountries), selectedCountries);
  const baselineOptionCount = payload.baselineOptionCount || 0;
  const freshResults: CountryResult[] = payload.baseline ? [payload.baseline] : [];
  try {
    await mapWithConcurrency(countries, GOOGLE_FLIGHTS_COMPARE_CONCURRENCY, async (country) => {
      throwIfGoogleFlightsComparisonCancelled(run);
      const result = await compareBookingCountry(baseUrl, country, baselineOptionCount, run);
      throwIfGoogleFlightsComparisonCancelled(run);
      freshResults.push(result);
      usageCompleted += 1;
      if (result.status === "ready") usageReady += 1;
      sendGoogleFlightsCountryProgress(progressTabId, payload.requestId, result);
      return result;
    });
    if (isGoogleFlightsSender(baseUrl)) {
      void contributeHistory(
        "market",
        buildMarketObservation(baseUrl, payload.baseline?.country || "", freshResults, crypto.randomUUID()),
      );
    }
    sendGoogleFlightsCountryComplete(progressTabId, payload.requestId, { ok: true });
  } catch (error) {
    usageOutcome = isGoogleFlightsComparisonCancelled(error, run) ? "cancelled" : "error";
    if (isGoogleFlightsComparisonCancelled(error, run)) {
      sendGoogleFlightsCountryComplete(progressTabId, payload.requestId, { ok: true, cancelled: true });
      return;
    }
    throw error;
  } finally {
    void recordUsage({
      eventName: "comparison.completed",
      surface: usageSurface,
      runId: usageRunId,
      requestedCountryCount: selectedCountries.length,
      completedCountryCount: usageCompleted,
      readyCountryCount: usageReady,
      durationMs: Math.min(86400000, Math.max(0, Math.round(performance.now() - usageStartedAt))),
      outcome: usageOutcome,
    });
    finishGoogleFlightsComparison(run);
  }
}

async function compareGoogleFlightsSearchCountries(
  payload: RuntimeMessage,
  progressTabId: number,
  run: GoogleFlightsComparisonRun,
): Promise<void> {
  const baseUrl = payload.baseUrl || "";
  if (!baseUrl) throw new Error("Missing Google Flights URL.");
  const selectedCountries = Array.from(
    new Set((payload.countries || []).filter((country) => /^[A-Z]{2}$/.test(country))),
  );
  const usageRunId = crypto.randomUUID();
  const usageStartedAt = performance.now();
  const usageSurface = isSkyscannerFlightsPageUrl(baseUrl)
    ? ("skyscanner-search" as const)
    : ("google-flights-search" as const);
  let usageCompleted = 0;
  let usageReady = 0;
  let usageOutcome: "completed" | "cancelled" | "error" = "completed";
  void recordUsage({
    eventName: "comparison.started",
    surface: usageSurface,
    runId: usageRunId,
    requestedCountryCount: selectedCountries.length,
  });
  const countries = await prioritizeSearchCountries(
    marketQueriesForSearchRows(baseUrl, payload.searchBaseline?.results || [], selectedCountries),
    selectedCountries,
  );
  const baselineResultCount = payload.baselineSearchResultCount || 0;
  try {
    await mapWithConcurrency(countries, GOOGLE_FLIGHTS_COMPARE_CONCURRENCY, async (country) => {
      throwIfGoogleFlightsComparisonCancelled(run);
      const result = await compareGoogleFlightsSearchCountry(baseUrl, country, baselineResultCount, run, (result) => {
        throwIfGoogleFlightsComparisonCancelled(run);
        sendGoogleFlightsSearchProgress(progressTabId, payload.requestId, result);
      });
      usageCompleted += 1;
      if (result.status === "ready") usageReady += 1;
      return result;
    });
    sendGoogleFlightsSearchComplete(progressTabId, payload.requestId, { ok: true });
  } catch (error) {
    usageOutcome = isGoogleFlightsComparisonCancelled(error, run) ? "cancelled" : "error";
    if (isGoogleFlightsComparisonCancelled(error, run)) {
      sendGoogleFlightsSearchComplete(progressTabId, payload.requestId, { ok: true, cancelled: true });
      return;
    }
    throw error;
  } finally {
    void recordUsage({
      eventName: "comparison.completed",
      surface: usageSurface,
      runId: usageRunId,
      requestedCountryCount: selectedCountries.length,
      completedCountryCount: usageCompleted,
      readyCountryCount: usageReady,
      durationMs: Math.min(86400000, Math.max(0, Math.round(performance.now() - usageStartedAt))),
      outcome: usageOutcome,
    });
    finishGoogleFlightsComparison(run);
  }
}

function startGoogleFlightsComparison(tabId: number, requestId: string): GoogleFlightsComparisonRun {
  const key = googleFlightsComparisonRunKey(tabId, requestId);
  for (const existing of activeGoogleFlightsComparisonRuns.values()) {
    if (existing.sourceTabId === tabId) cancelGoogleFlightsComparison(existing);
  }
  const run = {
    sourceTabId: tabId,
    requestId,
    controller: new AbortController(),
    activeTabIds: new Set<number>(),
    closedTabIds: new Set<number>(),
  };
  activeGoogleFlightsComparisonRuns.set(key, run);
  return run;
}

function finishGoogleFlightsComparison(run: GoogleFlightsComparisonRun): void {
  const key = googleFlightsComparisonRunKey(run.sourceTabId, run.requestId);
  if (activeGoogleFlightsComparisonRuns.get(key) === run) activeGoogleFlightsComparisonRuns.delete(key);
}

function googleFlightsComparisonRunKey(tabId: number, requestId: string): string {
  return `${tabId}:${requestId}`;
}

function cancelGoogleFlightsComparison(run: GoogleFlightsComparisonRun): void {
  if (run.controller.signal.aborted) return;
  run.controller.abort();
  for (const tabId of run.activeTabIds) {
    run.activeTabIds.delete(tabId);
    run.closedTabIds.add(tabId);
    void removeTab(tabId)
      .then(() => comparisonTabs.forget(tabId))
      .catch(() => undefined);
  }
}

function throwIfGoogleFlightsComparisonCancelled(run: GoogleFlightsComparisonRun): void {
  if (!run.controller.signal.aborted) return;
  throw googleFlightsComparisonCancelledError();
}

function isGoogleFlightsComparisonCancelled(error: unknown, run: GoogleFlightsComparisonRun): boolean {
  return run.controller.signal.aborted || (error instanceof Error && error.name === "GoogleFlightsComparisonCancelled");
}

function googleFlightsComparisonCancelledError(): Error {
  const error = new Error("Google Flights comparison cancelled.");
  error.name = "GoogleFlightsComparisonCancelled";
  return error;
}

async function openMatrixWithAutoOpen(matrixUrl: string, openedByPage = false, sourceWindowId?: number): Promise<void> {
  const url = validatedMatrixUrl(matrixUrl);
  await serializeWorkerStorage(async () => {
    const stored = await chrome.storage.local.get(LEGACY_MATRIX_AUTO_OPEN_UNTIL_STORAGE_KEY);
    if (stored[LEGACY_MATRIX_AUTO_OPEN_UNTIL_STORAGE_KEY] !== undefined)
      await chrome.storage.local.remove(LEGACY_MATRIX_AUTO_OPEN_UNTIL_STORAGE_KEY);
  });
  if (openedByPage) {
    const tab = await findPageOpenedMatrixTab(url, sourceWindowId);
    if (typeof tab?.id === "number") await rememberMatrixAutoOpenTab(tab.id);
    return;
  }
  const tab = await createActiveTab(url);
  if (typeof tab.id !== "number") throw new Error("Chrome did not provide a tab id.");
  await rememberMatrixAutoOpenTab(tab.id);
}

async function findPageOpenedMatrixTab(matrixUrl: string, sourceWindowId?: number): Promise<chrome.tabs.Tab | null> {
  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    const tabs = await queryTabs({
      active: true,
      ...(typeof sourceWindowId === "number" ? { windowId: sourceWindowId } : { lastFocusedWindow: true }),
    });
    const tab = tabs.find((candidate) => tabMatchesMatrixUrl(candidate, matrixUrl));
    if (tab) return tab;
    await delay(100);
  }
  return null;
}

async function rememberMatrixAutoOpenTab(tabId: number): Promise<void> {
  await serializeWorkerStorage(async () => {
    const existing = await chrome.storage.local.get(MATRIX_AUTO_OPEN_TABS_STORAGE_KEY);
    const tabs = autoOpenTabMap(existing[MATRIX_AUTO_OPEN_TABS_STORAGE_KEY]);
    tabs[String(tabId)] = Date.now() + MATRIX_AUTO_OPEN_TTL_MS;
    pruneAutoOpenTabMap(tabs);
    await chrome.storage.local.set({ [MATRIX_AUTO_OPEN_TABS_STORAGE_KEY]: tabs });
  });
}

async function consumeMatrixAutoOpenForTab(tabId: number | undefined): Promise<boolean> {
  if (typeof tabId !== "number") return false;
  return serializeWorkerStorage(async () => {
    const existing = await chrome.storage.local.get(MATRIX_AUTO_OPEN_TABS_STORAGE_KEY);
    const tabs = autoOpenTabMap(existing[MATRIX_AUTO_OPEN_TABS_STORAGE_KEY]);
    const before = JSON.stringify(tabs);
    pruneAutoOpenTabMap(tabs);
    const tabKey = String(tabId);
    const authorized = Boolean(tabs[tabKey] && tabs[tabKey] >= Date.now());
    if (authorized) delete tabs[tabKey];
    if (JSON.stringify(tabs) !== before) await chrome.storage.local.set({ [MATRIX_AUTO_OPEN_TABS_STORAGE_KEY]: tabs });
    return authorized;
  });
}

function validatedMatrixUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "matrix.itasoftware.com") {
    throw new Error("Invalid ITA Matrix URL.");
  }
  return url.toString();
}

function autoOpenTabMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, number] => /^\d+$/.test(entry[0]) && typeof entry[1] === "number")
      .slice(-50),
  );
}

function pruneAutoOpenTabMap(tabs: Record<string, number>, now = Date.now()): void {
  for (const [tabId, expiresAt] of Object.entries(tabs)) {
    if (!tabId || expiresAt < now) delete tabs[tabId];
  }
}

function tabMatchesMatrixUrl(tab: chrome.tabs.Tab, matrixUrl: string): boolean {
  const value = tab.pendingUrl || tab.url || "";
  try {
    const tabUrl = new URL(value);
    const targetUrl = new URL(matrixUrl);
    return (
      tabUrl.protocol === targetUrl.protocol &&
      tabUrl.hostname === targetUrl.hostname &&
      tabUrl.pathname === targetUrl.pathname
    );
  } catch {
    return false;
  }
}

function sendGoogleFlightsCountryProgress(
  tabId: number | undefined,
  requestId: string | undefined,
  result: CountryResult,
): void {
  if (typeof tabId !== "number" || !requestId) return;
  chrome.tabs.sendMessage(
    tabId,
    {
      command: "googleFlightsCountryComparisonResult",
      requestId,
      result,
    },
    () => {
      // The user may navigate away before long all-country checks finish.
      void chrome.runtime.lastError;
    },
  );
}

function sendGoogleFlightsCountryComplete(
  tabId: number | undefined,
  requestId: string | undefined,
  result: { ok: boolean; cancelled?: boolean; error?: string },
): void {
  if (typeof tabId !== "number" || !requestId) return;
  chrome.tabs.sendMessage(
    tabId,
    {
      command: "googleFlightsCountryComparisonComplete",
      requestId,
      ...result,
    },
    () => {
      void chrome.runtime.lastError;
    },
  );
}

function sendGoogleFlightsSearchProgress(
  tabId: number | undefined,
  requestId: string | undefined,
  result: SearchCountryResult,
): void {
  if (typeof tabId !== "number" || !requestId) return;
  chrome.tabs.sendMessage(
    tabId,
    {
      command: "googleFlightsSearchComparisonResult",
      requestId,
      result,
    },
    () => {
      void chrome.runtime.lastError;
    },
  );
}

function sendGoogleFlightsSearchComplete(
  tabId: number | undefined,
  requestId: string | undefined,
  result: { ok: boolean; cancelled?: boolean; error?: string },
): void {
  if (typeof tabId !== "number" || !requestId) return;
  chrome.tabs.sendMessage(
    tabId,
    {
      command: "googleFlightsSearchComparisonComplete",
      requestId,
      ...result,
    },
    () => {
      void chrome.runtime.lastError;
    },
  );
}

async function compareBookingCountry(
  baseUrl: string,
  country: string,
  baselineOptionCount: number,
  run: GoogleFlightsComparisonRun,
): Promise<CountryResult> {
  const url = countryComparisonUrl(baseUrl, country);
  let tabId: number | undefined;
  try {
    const tab = await createInactiveTabPaced(url, run);
    tabId = tab.id;
    if (typeof tabId !== "number") throw new Error("Chrome did not provide a tab id.");
    run.activeTabIds.add(tabId);
    await waitForTabComplete(tabId, run.controller.signal);
    throwIfGoogleFlightsComparisonCancelled(run);
    let result = await parseBookingComparisonTab(tabId, country, url, run.controller.signal);
    if (shouldRetrySparseResult(result, baselineOptionCount)) {
      throwIfGoogleFlightsComparisonCancelled(run);
      await reloadTab(tabId);
      await waitForTabComplete(tabId, run.controller.signal);
      result = await parseBookingComparisonTab(tabId, country, url, run.controller.signal);
      result.refreshed = true;
      if (isSparseResult(result, baselineOptionCount)) result.status = "sparse";
    }
    return result;
  } catch (error) {
    if (isGoogleFlightsComparisonCancelled(error, run)) throw googleFlightsComparisonCancelledError();
    return {
      country,
      url,
      options: [],
      status: "error",
      error: error instanceof Error ? error.message : "Country check failed.",
    };
  } finally {
    if (typeof tabId === "number") {
      run.activeTabIds.delete(tabId);
      if (!run.closedTabIds.delete(tabId)) await removeTab(tabId);
      await comparisonTabs.forget(tabId);
    }
  }
}

async function compareGoogleFlightsSearchCountry(
  baseUrl: string,
  country: string,
  baselineResultCount: number,
  run: GoogleFlightsComparisonRun,
  onProgress?: (result: SearchCountryResult) => void,
): Promise<SearchCountryResult> {
  const url = countryComparisonUrl(baseUrl, country);
  let tabId: number | undefined;
  let sentProgress = false;
  try {
    const tab = await createInactiveTabPaced(url, run);
    tabId = tab.id;
    if (typeof tabId !== "number") throw new Error("Chrome did not provide a tab id.");
    run.activeTabIds.add(tabId);
    await waitForTabComplete(tabId, run.controller.signal);
    throwIfGoogleFlightsComparisonCancelled(run);
    let result = await parseGoogleFlightsSearchTab(tabId, country, url, run.controller.signal);
    if (baselineResultCount > 0 && result.status !== "error" && result.results.length === 0) {
      throwIfGoogleFlightsComparisonCancelled(run);
      await reloadTab(tabId);
      await waitForTabComplete(tabId, run.controller.signal);
      result = await parseGoogleFlightsSearchTab(tabId, country, url, run.controller.signal);
    }
    throwIfGoogleFlightsComparisonCancelled(run);
    onProgress?.(result);
    sentProgress = true;
    const expandedResult = await waitForExpandedGoogleFlightsSearchTab(
      tabId,
      country,
      url,
      result.results.length,
      run.controller.signal,
    );
    if (expandedResult && expandedResult.results.length > result.results.length) {
      result = expandedResult;
      throwIfGoogleFlightsComparisonCancelled(run);
      onProgress?.(result);
    }
    return result;
  } catch (error) {
    if (isGoogleFlightsComparisonCancelled(error, run)) throw googleFlightsComparisonCancelledError();
    const result = {
      country,
      url,
      results: [],
      status: "error",
      error: error instanceof Error ? error.message : "Search country check failed.",
    } satisfies SearchCountryResult;
    if (!sentProgress) onProgress?.(result);
    return result;
  } finally {
    if (typeof tabId === "number") {
      run.activeTabIds.delete(tabId);
      if (!run.closedTabIds.delete(tabId)) await removeTab(tabId);
      await comparisonTabs.forget(tabId);
    }
  }
}

function createInactiveTabPaced(url: string, run: GoogleFlightsComparisonRun): Promise<chrome.tabs.Tab> {
  const scheduled = tabCreateQueue.then(async () => {
    await comparisonTabs.ready;
    throwIfGoogleFlightsComparisonCancelled(run);
    const elapsed = Date.now() - lastTabCreatedAt;
    const waitMs = Math.max(0, GOOGLE_FLIGHTS_TAB_CREATE_SPACING_MS - elapsed);
    if (waitMs > 0) await delay(waitMs, run.controller.signal);
    throwIfGoogleFlightsComparisonCancelled(run);
    const workerUrls = workerTabUrls(url);
    const tab = await createInactiveTab(workerUrls.stagingUrl);
    lastTabCreatedAt = Date.now();
    const tabId = tab.id;
    if (typeof tabId !== "number") throw new Error("Chrome did not provide a tab id.");
    run.activeTabIds.add(tabId);
    try {
      await comparisonTabs.remember(tabId, { sourceTabId: run.sourceTabId, requestId: run.requestId, ...workerUrls });
      throwIfGoogleFlightsComparisonCancelled(run);
      await navigateTab(tabId, workerUrls.url);
      throwIfGoogleFlightsComparisonCancelled(run);
      return tab;
    } catch (error) {
      run.activeTabIds.delete(tabId);
      if (!run.closedTabIds.delete(tabId)) await removeTab(tabId);
      await comparisonTabs.forget(tabId);
      throw error;
    }
  });
  tabCreateQueue = scheduled.then(
    () => undefined,
    () => undefined,
  );
  return scheduled;
}

function shouldRetrySparseResult(result: CountryResult, baselineOptionCount: number): boolean {
  return baselineOptionCount > 3 && result.status !== "error" && result.options.length <= 3 && !result.refreshed;
}

function isSparseResult(result: CountryResult, baselineOptionCount: number): boolean {
  return (
    baselineOptionCount > 3 && result.status !== "error" && result.options.length > 0 && result.options.length <= 3
  );
}

async function parseBookingComparisonTab(
  tabId: number,
  country: string,
  url: string,
  signal: AbortSignal,
): Promise<CountryResult> {
  let latest: CountryResult | null = null;
  const deadline = Date.now() + 18000;
  while (Date.now() < deadline) {
    throwIfAborted(signal);
    try {
      latest = await sendTabMessage<CountryResult>(
        tabId,
        {
          command: "parseBookingOptions",
        },
        signal,
        Math.min(5000, deadline - Date.now()),
      );
      if (latest.options.length > 0) return { ...latest, country, url };
    } catch {
      // The content script may not be ready immediately after the tab completes.
    }
    await delay(600, signal);
  }
  if (latest) return { ...latest, country, url };
  return { country, url, options: [], status: "empty" };
}

async function parseGoogleFlightsSearchTab(
  tabId: number,
  country: string,
  url: string,
  signal: AbortSignal,
): Promise<SearchCountryResult> {
  let latest: SearchCountryResult | null = null;
  const deadline = Date.now() + 18000;
  let expanded = false;
  while (Date.now() < deadline) {
    throwIfAborted(signal);
    try {
      if (!expanded) {
        expanded = await tryExpandGoogleFlightsSearchResults(tabId, signal, Math.min(5000, deadline - Date.now()));
      }
      latest = await sendTabMessage<SearchCountryResult>(
        tabId,
        {
          command: "parseSearchResults",
        },
        signal,
        Math.min(5000, deadline - Date.now()),
      );
      if (latest.results.length > 0) return { ...latest, country, url };
    } catch {
      // The content script may not be ready immediately after the tab completes.
    }
    await delay(600, signal);
  }
  if (latest) return { ...latest, country, url };
  return { country, url, results: [], status: "empty" };
}

async function waitForExpandedGoogleFlightsSearchTab(
  tabId: number,
  country: string,
  url: string,
  previousResultCount: number,
  signal: AbortSignal,
): Promise<SearchCountryResult | null> {
  if (previousResultCount <= 0) return null;
  const deadline = Date.now() + 6500;
  let latest: SearchCountryResult | null = null;
  let expanded = false;
  while (Date.now() < deadline) {
    await delay(600, signal);
    throwIfAborted(signal);
    try {
      if (!expanded) {
        expanded = await tryExpandGoogleFlightsSearchResults(tabId, signal, Math.min(5000, deadline - Date.now()));
      }
      latest = await sendTabMessage<SearchCountryResult>(
        tabId,
        {
          command: "parseSearchResults",
        },
        signal,
        Math.min(5000, deadline - Date.now()),
      );
      if (latest.results.length > previousResultCount) return { ...latest, country, url };
    } catch {
      // Google may still be mutating the result list after View more is clicked.
    }
  }
  return latest && latest.results.length > previousResultCount ? { ...latest, country, url } : null;
}

async function tryExpandGoogleFlightsSearchResults(
  tabId: number,
  signal?: AbortSignal,
  timeoutMs = 5000,
): Promise<boolean> {
  const result = await sendTabMessage<GoogleFlightsSearchExpansionResult>(
    tabId,
    {
      command: "expandGoogleFlightsSearchResults",
      waitForExpansion: false,
    },
    signal,
    timeoutMs,
  );
  return result.clicked === true;
}

async function fetchProviderMetadata(baseUrl: string): Promise<RemoteProviderMetadata[]> {
  if (typeof __MOOFLIGHTS_DEV_BUILD__ !== "undefined" && !__MOOFLIGHTS_DEV_BUILD__) return [];
  return fetchProviderMetadataWithCache(baseUrl);
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

function getTabOrNull(tabId: number): Promise<chrome.tabs.Tab | null> {
  return new Promise((resolve) => chrome.tabs.get(tabId, (tab) => resolve(chrome.runtime.lastError ? null : tab)));
}

function navigateTab(tabId: number, url: string): Promise<void> {
  return new Promise((resolve, reject) =>
    chrome.tabs.update(tabId, { url }, () => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve();
    }),
  );
}

function createActiveTab(url: string): Promise<chrome.tabs.Tab> {
  return new Promise((resolve, reject) => {
    chrome.tabs.create({ url, active: true }, (tab) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tab);
    });
  });
}

function queryTabs(queryInfo: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(tabs);
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
    chrome.tabs.remove(tabId, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

function waitForTabComplete(tabId: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(googleFlightsComparisonCancelledError());
      return;
    }
    const timeoutId = setTimeout(done, 20000);

    function done(): void {
      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(listener);
      signal?.removeEventListener("abort", cancelled);
      resolve();
    }

    function cancelled(): void {
      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(listener);
      signal?.removeEventListener("abort", cancelled);
      reject(googleFlightsComparisonCancelledError());
    }

    function listener(updatedTabId: number, changeInfo: { status?: string }): void {
      if (updatedTabId === tabId && changeInfo.status === "complete") done();
    }

    chrome.tabs.onUpdated.addListener(listener);
    signal?.addEventListener("abort", cancelled, { once: true });
    chrome.tabs.get(tabId, (tab) => {
      if (!chrome.runtime.lastError && tab.status === "complete") done();
    });
  });
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(googleFlightsComparisonCancelledError());
      return;
    }
    const timeoutId = setTimeout(done, ms);

    function done(): void {
      signal?.removeEventListener("abort", cancelled);
      resolve();
    }

    function cancelled(): void {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", cancelled);
      reject(googleFlightsComparisonCancelledError());
    }

    signal?.addEventListener("abort", cancelled, { once: true });
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw googleFlightsComparisonCancelledError();
}

function isGoogleFlightsSender(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" &&
      ["www.google.com", "google.com"].includes(parsed.hostname) &&
      parsed.pathname.startsWith("/travel/flights")
    );
  } catch {
    return false;
  }
}
