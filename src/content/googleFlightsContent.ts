import {
  DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES,
  type GoogleFlightsCountryResult,
  type GoogleFlightsMatrixSearch,
  googleFlightsCountryUrl,
  parseGoogleFlightsBookingOptions,
  parseGoogleFlightsCountryInput,
  parseGoogleFlightsMatrixSearch,
} from "../shared/googleFlightsBooking";
import { mileageCarrierName } from "../shared/mileageCarriers";
import { loadSettings } from "../shared/storage";

type CompareState = {
  comparing: boolean;
  baseline: GoogleFlightsCountryResult | null;
  baselineSignature: string;
  results: GoogleFlightsCountryResult[];
  resultsCachedAt: number;
  error: string;
  countryInput: string;
  pageKey: string;
  cacheKey: string;
};

type CompareResponse = {
  ok: boolean;
  results?: GoogleFlightsCountryResult[];
  error?: string;
};

const PANEL_ID = "mu-travel-google-flights-panel";
const BOOKING_PATH_RE = /^\/travel\/flights\/booking/;
const RESULT_CACHE_TTL_MS = 10 * 60 * 1000;
const RESULT_CACHE_STORAGE_KEY = "muTravelGoogleFlightsCountryResults";
const STORED_OPTIONS_LIMIT = 24;
let regionDisplayNames: Intl.DisplayNames | null | undefined;
let countryCodeByDisplayName: Map<string, string> | null | undefined;

const state: CompareState = {
  comparing: false,
  baseline: null,
  baselineSignature: "",
  results: [],
  resultsCachedAt: 0,
  error: "",
  countryInput: DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES.join(", "),
  pageKey: "",
  cacheKey: "",
};

const resultCache = new Map<
  string,
  {
    results: GoogleFlightsCountryResult[];
    cachedAt: number;
  }
>();

type StoredResultCache = Record<string, { results: GoogleFlightsCountryResult[]; cachedAt: number }>;

function readCachedResults(
  pageKey: string,
  now = Date.now(),
): { results: GoogleFlightsCountryResult[]; cachedAt: number } | null {
  const cached = resultCache.get(pageKey);
  if (!cached) return null;
  if (now - cached.cachedAt <= RESULT_CACHE_TTL_MS) return cached;
  resultCache.delete(pageKey);
  return null;
}

function pruneExpiredResultCache(now = Date.now()): void {
  for (const [pageKey, cached] of resultCache.entries()) {
    if (now - cached.cachedAt > RESULT_CACHE_TTL_MS) resultCache.delete(pageKey);
  }
}

function applyCachedResults(cached: { results: GoogleFlightsCountryResult[]; cachedAt: number } | null): void {
  state.results = cached?.results || [];
  state.resultsCachedAt = cached?.cachedAt || 0;
}

async function loadStoredCachedResults(cacheKey: string, now = Date.now()): Promise<void> {
  const cache = await readStoredResultCache();
  const cached = cache[cacheKey];
  if (!cached) return;
  if (now - cached.cachedAt > RESULT_CACHE_TTL_MS) {
    delete cache[cacheKey];
    await writeStoredResultCache(cache);
    return;
  }
  resultCache.set(cacheKey, cached);
  if (state.cacheKey !== cacheKey || state.results.length > 0) return;
  applyCachedResults(cached);
  render();
}

async function storeCachedResults(
  cacheKey: string,
  results: GoogleFlightsCountryResult[],
  cachedAt = Date.now(),
): Promise<void> {
  const cached = { results, cachedAt };
  resultCache.set(cacheKey, cached);
  const cache = await readStoredResultCache();
  cache[cacheKey] = { results: sanitizeResultsForStorage(results), cachedAt };
  await writeStoredResultCache(pruneStoredResultCache(cache, cachedAt));
}

async function readStoredResultCache(): Promise<StoredResultCache> {
  try {
    const stored = await chrome.storage.local.get(RESULT_CACHE_STORAGE_KEY);
    return normalizeStoredResultCache(stored[RESULT_CACHE_STORAGE_KEY]);
  } catch {
    return {};
  }
}

async function writeStoredResultCache(cache: StoredResultCache): Promise<void> {
  try {
    await chrome.storage.local.set({ [RESULT_CACHE_STORAGE_KEY]: cache });
  } catch {
    // Country comparison cache is optional; fresh comparisons still work without persistence.
  }
}

function normalizeStoredResultCache(value: unknown): StoredResultCache {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const cache: StoredResultCache = {};
  for (const [pageKey, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const candidate = entry as { results?: unknown; cachedAt?: unknown };
    if (!Array.isArray(candidate.results) || typeof candidate.cachedAt !== "number") continue;
    cache[pageKey] = {
      results: sanitizeResultsForStorage(candidate.results.filter(isGoogleFlightsCountryResult)),
      cachedAt: candidate.cachedAt,
    };
  }
  return cache;
}

function pruneStoredResultCache(cache: StoredResultCache, now = Date.now()): StoredResultCache {
  return Object.fromEntries(Object.entries(cache).filter(([, cached]) => now - cached.cachedAt <= RESULT_CACHE_TTL_MS));
}

function isGoogleFlightsCountryResult(value: unknown): value is GoogleFlightsCountryResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as { country?: unknown; url?: unknown; options?: unknown; status?: unknown };
  return (
    typeof candidate.country === "string" &&
    typeof candidate.url === "string" &&
    Array.isArray(candidate.options) &&
    typeof candidate.status === "string"
  );
}

function sanitizeResultsForStorage(results: GoogleFlightsCountryResult[]): GoogleFlightsCountryResult[] {
  return results.map(sanitizeResultForStorage);
}

function sanitizeResultForStorage(result: GoogleFlightsCountryResult): GoogleFlightsCountryResult {
  const safeOptions = result.options.filter(isGoogleFlightsBookingOption).map((option) => {
    const { bookingUrl: _bookingUrl, ...safeOption } = option;
    return safeOption;
  });
  const direct = safeOptions.find((option) => option.isDirect);
  const options = safeOptions.slice(0, STORED_OPTIONS_LIMIT);
  if (direct && !options.some((option) => bookingOptionKey(option) === bookingOptionKey(direct))) {
    options.push(direct);
  }
  return {
    ...result,
    options,
    cheapest: options[0],
    direct: options.find((option) => option.isDirect),
  };
}

function isGoogleFlightsBookingOption(value: unknown): value is GoogleFlightsCountryResult["options"][number] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as {
    provider?: unknown;
    price?: unknown;
    currency?: unknown;
    priceText?: unknown;
    isDirect?: unknown;
  };
  return (
    typeof candidate.provider === "string" &&
    typeof candidate.price === "number" &&
    typeof candidate.currency === "string" &&
    typeof candidate.priceText === "string" &&
    typeof candidate.isDirect === "boolean"
  );
}

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const payload = message as { command?: string };
  if (payload.command !== "parseGoogleFlightsBookingOptions") return false;
  sendResponse(parseCurrentBookingPage());
  return false;
});

void init();

async function init(): Promise<void> {
  try {
    const settings = await loadSettings();
    state.countryInput = settings.googleFlights.countryCodes.join(", ");
  } catch {
    state.countryInput = DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES.join(", ");
  }
  scheduleRender();
  installObserver();
}

function isBookingPage(): boolean {
  return BOOKING_PATH_RE.test(window.location.pathname);
}

function currentCountryCode(): string {
  const country = urlCountryCode();
  if (country) return country;
  const visibleCountry = visibleGoogleFlightsLocation();
  return countryCodeFromDisplayName(visibleCountry) || visibleCountry || "CURRENT";
}

function currentComparableCountryCode(): string {
  return (
    urlCountryCode() ||
    countryCodeFromDisplayName(visibleGoogleFlightsLocation()) ||
    DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES[0] ||
    "US"
  );
}

function parseCurrentBookingPage(): GoogleFlightsCountryResult {
  return parseGoogleFlightsBookingOptions(document, currentCountryCode(), window.location.href);
}

function installPanel(): void {
  getShadowRoot();
}

function installObserver(): void {
  let timer: number | undefined;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(scheduleRender, 250);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  installNavigationObserver(schedule);
}

function installNavigationObserver(schedule: () => void): void {
  window.addEventListener("popstate", schedule);
  window.addEventListener("hashchange", schedule);
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;
  history.pushState = function pushState(...args) {
    const result = originalPushState.apply(this, args);
    schedule();
    return result;
  };
  history.replaceState = function replaceState(...args) {
    const result = originalReplaceState.apply(this, args);
    schedule();
    return result;
  };
}

function scheduleRender(): void {
  const pageKey = currentBookingPageKey();
  const cacheKey = currentComparisonCacheKey();
  if (!pageKey) {
    if (!state.pageKey && !document.getElementById(PANEL_ID)) return;
    removePanel();
    state.pageKey = "";
    state.cacheKey = "";
    state.baseline = null;
    state.baselineSignature = "";
    state.results = [];
    state.resultsCachedAt = 0;
    state.error = "";
    state.comparing = false;
    return;
  }

  installPanel();
  if (state.comparing && state.pageKey === pageKey) return;
  const baseline = parseCurrentBookingPage();
  const baselineSignature = googleFlightsResultSignature(baseline);
  if (state.pageKey !== pageKey) {
    state.pageKey = pageKey;
    state.cacheKey = cacheKey;
    state.baselineSignature = "";
    state.error = "";
    state.comparing = false;
    applyCachedResults(readCachedResults(cacheKey));
    void loadStoredCachedResults(cacheKey);
  } else if (state.baselineSignature && state.baselineSignature !== baselineSignature) {
    if (state.results.length > 0 && !state.resultsCachedAt) {
      state.resultsCachedAt = Date.now();
    } else if (state.results.length === 0) {
      void loadStoredCachedResults(cacheKey);
    }
  }

  if (state.baselineSignature === baselineSignature) return;
  state.baseline = baseline;
  state.baselineSignature = baselineSignature;
  render();
}

function currentBookingPageKey(): string {
  return currentBookingPageKeyForCountry(true);
}

function currentComparisonCacheKey(): string {
  return currentBookingPageKeyForCountry(false);
}

function currentBookingPageKeyForCountry(includeCountry: boolean): string {
  if (!isBookingPage()) return "";
  const url = new URL(window.location.href);
  const params = new URLSearchParams();
  for (const key of ["tfs", "tfu"]) {
    const value = url.searchParams.get(key);
    if (value) params.set(key, value);
  }
  params.set("curr", url.searchParams.get("curr") || "USD");
  if (includeCountry) params.set("gl", currentComparableCountryCode());
  return `${url.pathname}?${params.toString()}`;
}

function render(): void {
  const shadow = getShadowRoot();
  if (!shadow) return;
  const baseline = state.baseline || parseCurrentBookingPage();
  const matrixSearch = parseGoogleFlightsMatrixSearch(window.location.href);

  shadow.innerHTML = `
    <style>${styles()}</style>
    <section class="panel" aria-label="Mu Travel country price comparison">
      <header>
        <strong>Mu Travel</strong>
        <span>Country price check</span>
      </header>
      ${renderBaseline(baseline)}
      ${renderMilesEstimatePrompt(matrixSearch)}
      <label class="country-input">
        Countries
        <input type="text" value="${escapeHtml(state.countryInput)}" data-role="country-input" spellcheck="false" />
      </label>
      <div class="actions">
        <button type="button" ${state.comparing ? "disabled" : ""} data-action="compare-countries">
          ${state.comparing ? "Checking..." : "Compare countries"}
        </button>
        ${matrixSearch ? '<button type="button" class="secondary" data-action="open-matrix">Search Matrix</button>' : ""}
        <button type="button" class="secondary" data-action="open-options">Options</button>
      </div>
      ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
      ${renderCacheNotice()}
      ${renderResults(state.results)}
    </section>
  `;

  const input = shadow.querySelector<HTMLInputElement>('[data-role="country-input"]');
  input?.addEventListener("input", () => {
    state.countryInput = input.value;
  });
  shadow.querySelector('[data-action="compare-countries"]')?.addEventListener("click", () => {
    void compareCountries();
  });
  shadow.querySelector('[data-action="open-matrix"]')?.addEventListener("click", () => {
    if (!matrixSearch) return;
    window.open(matrixSearch.matrixUrl, "_blank", "noopener,noreferrer");
  });
  shadow.querySelector('[data-action="open-options"]')?.addEventListener("click", () => {
    sendRuntimeMessage({ command: "openOptionsPage" });
  });
}

function sendRuntimeMessage(message: unknown): void {
  try {
    void chrome.runtime.sendMessage(message);
  } catch {
    // Content scripts can outlive their extension context after reload/update.
  }
}

function renderBaseline(result: GoogleFlightsCountryResult): string {
  return `
    <dl>
      <div><dt>This page</dt><dd>${escapeHtml(countryDisplayName(result.country))}</dd></div>
    </dl>
  `;
}

function renderCacheNotice(now = Date.now()): string {
  if (!state.resultsCachedAt || state.results.length === 0) return "";
  const minutes = Math.max(0, Math.floor((now - state.resultsCachedAt) / 60000));
  const age = minutes <= 0 ? "just now" : `${minutes} min ago`;
  return `<p class="cache-note">Cached country comparison from ${escapeHtml(age)}.</p>`;
}

function renderMilesEstimatePrompt(matrixSearch: GoogleFlightsMatrixSearch | null): string {
  if (!matrixSearch) return "";
  const earningCarriers = matrixSearch.carriers
    .map((carrier) => ({ carrier, name: mileageCarrierName(carrier) }))
    .filter((carrier): carrier is { carrier: string; name: string } => Boolean(carrier.name));
  if (earningCarriers.length === 0) return "";
  const carrierLabels = earningCarriers.map((carrier) => `${carrier.name} (${carrier.carrier})`).join(", ");
  return `
    <div class="mileage-prompt">
      <strong>Miles earning</strong>
      <span>Search ITA Matrix to see booking classes and mileage earning details for ${escapeHtml(carrierLabels)}.</span>
    </div>
  `;
}

function renderResults(results: GoogleFlightsCountryResult[]): string {
  if (results.length === 0) return "";
  const sorted = [...results].sort(
    (left, right) =>
      (left.cheapest?.price ?? Number.POSITIVE_INFINITY) - (right.cheapest?.price ?? Number.POSITIVE_INFINITY) ||
      left.country.localeCompare(right.country),
  );

  return `
    <div class="results">
      ${sorted
        .map((result) => {
          const cheapest = renderCheapest(result);
          const direct = result.direct ? `${result.direct.priceText} direct` : "No direct";
          const isCurrent = state.baseline?.url === result.url;
          return `
            <div class="result ${result.status}">
              <strong>${escapeHtml(countryDisplayName(result.country))}${isCurrent ? ' <span class="current">current</span>' : ""}</strong>
              <span>${escapeHtml(cheapest)}</span>
              <small>${escapeHtml(direct)} · ${result.options.length} option(s)${result.refreshed ? " · retried" : ""}</small>
              ${renderResultActions(result)}
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderResultActions(result: GoogleFlightsCountryResult): string {
  const bookingTargets = bookingActionTargets(result);
  return `
    <div class="result-actions">
      <a href="${escapeHtml(result.url)}" target="_blank" rel="noopener noreferrer">Open country page</a>
      ${bookingTargets
        .map(
          (target) =>
            `<a href="${escapeHtml(target.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(target.label)}</a>`,
        )
        .join("")}
    </div>
  `;
}

function mergeCountryResults(
  previousResults: GoogleFlightsCountryResult[],
  updates: GoogleFlightsCountryResult[],
  selectedCountries: string[],
): { results: GoogleFlightsCountryResult[]; retained: boolean } {
  const updateCountries = new Set(updates.map((result) => result.country));
  const selectedCountrySet = new Set(selectedCountries);
  const byCountry = new Map(
    previousResults
      .filter((result) => selectedCountrySet.has(result.country) || updateCountries.has(result.country))
      .map((result) => [result.country, result]),
  );
  let retained = false;
  for (const update of updates) {
    const previous = byCountry.get(update.country);
    const merged = previous ? mergeCountryResult(previous, update) : update;
    if (previous && resultRetainedPreviousData(previous, update, merged)) retained = true;
    byCountry.set(update.country, merged);
  }
  for (const previous of previousResults) {
    if (selectedCountrySet.has(previous.country) && !updateCountries.has(previous.country)) retained = true;
  }
  return { results: Array.from(byCountry.values()), retained };
}

function mergeCountryResult(
  previous: GoogleFlightsCountryResult,
  update: GoogleFlightsCountryResult,
): GoogleFlightsCountryResult {
  const optionsByKey = new Map(previous.options.map((option) => [bookingOptionKey(option), option]));
  for (const option of update.options) optionsByKey.set(bookingOptionKey(option), option);
  const options = Array.from(optionsByKey.values()).sort(
    (left, right) => left.price - right.price || left.provider.localeCompare(right.provider),
  );
  return {
    ...previous,
    ...update,
    options,
    cheapest: options[0],
    direct: options.find((option) => option.isDirect),
    status: options.length > 0 && update.status === "empty" ? previous.status : update.status,
  };
}

function resultRetainedPreviousData(
  previous: GoogleFlightsCountryResult,
  update: GoogleFlightsCountryResult,
  merged: GoogleFlightsCountryResult,
): boolean {
  return (
    merged.options.length > update.options.length ||
    Boolean(previous.direct && !update.direct && merged.direct) ||
    previous.country !== update.country
  );
}

function bookingOptionKey(option: GoogleFlightsCountryResult["options"][number]): string {
  return `${option.provider}:${option.isDirect ? "direct" : "ota"}`;
}

function bookingActionTargets(result: GoogleFlightsCountryResult): Array<{ label: string; url: string }> {
  const targets: Array<{ label: string; url: string }> = [];
  if (result.cheapest?.bookingUrl) {
    targets.push({ label: `Book ${result.cheapest.provider}`, url: result.cheapest.bookingUrl });
  }
  if (result.direct?.bookingUrl && result.direct.bookingUrl !== result.cheapest?.bookingUrl) {
    targets.push({ label: `Book direct`, url: result.direct.bookingUrl });
  }
  return targets;
}

function renderCheapest(result: GoogleFlightsCountryResult): string {
  if (!result.cheapest) return "No options";
  const tiedProviders = result.options
    .filter((option) => option.price === result.cheapest?.price)
    .map((option) => option.provider);
  return `${result.cheapest.priceText} ${tiedProviders.join(", ")}`;
}

function googleFlightsResultSignature(result: GoogleFlightsCountryResult): string {
  const cheapest = result.cheapest ? `${result.cheapest.provider}:${result.cheapest.priceText}` : "";
  const direct = result.direct ? `${result.direct.provider}:${result.direct.priceText}` : "";
  return [result.country, result.options.length, cheapest, direct, result.status].join("|");
}

function countryDisplayName(country: string): string {
  const code = country.toUpperCase();
  if (country === "CURRENT") return "Current country";
  if (!/^[A-Z]{2}$/.test(code)) return country;
  const displayNames = getRegionDisplayNames();
  if (displayNames) {
    const label = displayNames.of(code);
    return label || code;
  }
  return code;
}

function urlCountryCode(): string {
  const country = new URL(window.location.href).searchParams.get("gl")?.toUpperCase() || "";
  return /^[A-Z]{2}$/.test(country) ? country : "";
}

function visibleGoogleFlightsLocation(): string {
  const locationLabel = Array.from(document.querySelectorAll<HTMLElement>(".twocKe"))
    .map((element) => ({
      value: normalizeText(element.textContent || ""),
      context: normalizeText(element.parentElement?.textContent || ""),
    }))
    .find((entry) => entry.value && /\bLocation\b/i.test(entry.context));
  return locationLabel?.value || "";
}

function countryCodeFromDisplayName(value: string): string {
  const normalized = normalizeCountryName(value);
  if (!normalized) return "";
  return getCountryCodeByDisplayName()?.get(normalized) || "";
}

function getCountryCodeByDisplayName(): Map<string, string> | null {
  if (countryCodeByDisplayName !== undefined) return countryCodeByDisplayName;
  const displayNames = getRegionDisplayNames();
  if (!displayNames) {
    countryCodeByDisplayName = null;
    return countryCodeByDisplayName;
  }

  countryCodeByDisplayName = new Map<string, string>();
  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = `${String.fromCharCode(first)}${String.fromCharCode(second)}`;
      const label = displayNames.of(code);
      if (!label || label === code) continue;
      countryCodeByDisplayName.set(normalizeCountryName(label), code);
    }
  }
  return countryCodeByDisplayName;
}

function getRegionDisplayNames(): Intl.DisplayNames | null {
  if (regionDisplayNames !== undefined) return regionDisplayNames;
  try {
    regionDisplayNames = new Intl.DisplayNames(["en"], { type: "region" });
  } catch {
    regionDisplayNames = null;
  }
  return regionDisplayNames;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeCountryName(value: string): string {
  return normalizeText(value).toLocaleLowerCase("en-US");
}

async function compareCountries(): Promise<void> {
  const selectedCountries = parseGoogleFlightsCountryInput(state.countryInput);
  if (selectedCountries.length === 0) {
    state.error = "Enter at least one country code.";
    render();
    return;
  }
  state.countryInput = selectedCountries.join(", ");
  state.comparing = true;
  state.error = "";
  const previousResults = state.results;
  const previousCachedAt = state.resultsCachedAt;
  const currentUrl = new URL(window.location.href);
  const hasComparableCurrency = currentUrl.searchParams.has("curr");
  state.baseline = hasComparableCurrency ? parseCurrentBookingPage() : null;
  const comparePageKey = state.pageKey;
  const compareCacheKey = state.cacheKey;
  const baseline = state.baseline;
  const baseUrl = googleFlightsCountryUrl(window.location.href, currentComparableCountryCode());
  render();

  const currentCountry = currentComparableCountryCode();
  const countries = selectedCountries.filter((country) => !hasComparableCurrency || country !== currentCountry);
  try {
    const response = (await chrome.runtime.sendMessage({
      command: "compareGoogleFlightsCountries",
      baseUrl,
      countries,
      baselineOptionCount: baseline?.options.length ?? 0,
    })) as CompareResponse;
    if (state.pageKey !== comparePageKey) return;
    if (!response?.ok) throw new Error(response?.error || "Country comparison failed.");
    const updates = baseline ? [baseline, ...(response.results || [])] : response.results || [];
    const merged = mergeCountryResults(previousResults, updates, selectedCountries);
    state.results = merged.results;
    state.resultsCachedAt = merged.retained ? previousCachedAt || Date.now() : 0;
    if (comparePageKey) {
      pruneExpiredResultCache();
      void storeCachedResults(compareCacheKey || comparePageKey, state.results);
    }
  } catch (error) {
    if (state.pageKey !== comparePageKey) return;
    state.error = error instanceof Error ? error.message : "Country comparison failed.";
  } finally {
    if (state.pageKey === comparePageKey) {
      state.comparing = false;
      render();
    } else {
      state.comparing = false;
      scheduleRender();
    }
  }
}

function getShadowRoot(): ShadowRoot | null {
  let host = document.getElementById(PANEL_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = PANEL_ID;
    document.documentElement.appendChild(host);
  }
  return host.shadowRoot || host.attachShadow({ mode: "open" });
}

function removePanel(): void {
  document.getElementById(PANEL_ID)?.remove();
}

function styles(): string {
  return `
    :host { all: initial; }
    .panel, .panel * {
      box-sizing: border-box;
    }
    .panel {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 2147483647;
      width: min(360px, calc(100vw - 32px));
      max-height: min(560px, calc(100vh - 32px));
      overflow-x: hidden;
      overflow-y: auto;
      border: 1px solid #d7dde8;
      border-radius: 8px;
      background: #ffffff;
      color: #172033;
      box-shadow: 0 18px 48px rgba(15, 23, 42, 0.18);
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-bottom: 1px solid #e2e8f0;
    }
    header span { color: #64748b; }
    dl {
      display: grid;
      gap: 6px;
      margin: 0;
      padding: 10px 12px;
      border-bottom: 1px solid #e2e8f0;
    }
    dl div {
      display: grid;
      grid-template-columns: 72px 1fr;
      gap: 8px;
    }
    dt { color: #64748b; font-weight: 650; }
    dd { margin: 0; text-align: right; }
    .mileage-prompt {
      display: grid;
      gap: 3px;
      margin: 10px 12px 0;
      border: 1px solid #d7dde8;
      border-left: 4px solid #0f766e;
      border-radius: 6px;
      padding: 8px;
    }
    .mileage-prompt strong { color: #172033; }
    .mileage-prompt span { color: #64748b; }
    .country-input {
      display: grid;
      gap: 6px;
      padding: 10px 12px 0;
      color: #64748b;
      font-weight: 650;
    }
    .country-input input {
      width: 100%;
      min-width: 0;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #ffffff;
      color: #172033;
      -webkit-text-fill-color: #172033;
      appearance: none;
      padding: 7px 9px;
      font: inherit;
      font-weight: 400;
    }
    .actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      padding: 10px 12px;
    }
    button {
      border: 1px solid #0f766e;
      border-radius: 6px;
      background: #0f766e;
      color: #ffffff;
      padding: 8px 10px;
      font: inherit;
      font-weight: 650;
      cursor: pointer;
      min-width: 0;
    }
    button.secondary {
      border-color: #94a3b8;
      background: #ffffff;
      color: #334155;
    }
    button:disabled { cursor: wait; opacity: 0.72; }
    .error {
      margin: 0 12px 10px;
      border-radius: 6px;
      background: #fef2f2;
      color: #991b1b;
      padding: 8px;
    }
    .cache-note {
      margin: 0 12px 10px;
      border-radius: 6px;
      background: #f8fafc;
      color: #64748b;
      padding: 6px 8px;
      font-size: 12px;
    }
    .results {
      display: grid;
      gap: 6px;
      padding: 0 12px 12px;
    }
    .result {
      display: grid;
      gap: 2px;
      border: 1px solid #e2e8f0;
      border-left: 4px solid #0f766e;
      border-radius: 6px;
      padding: 8px;
    }
    .result.sparse { border-left-color: #d97706; }
    .result.empty, .result.error { border-left-color: #dc2626; }
    .result span { font-weight: 650; }
    .result .current {
      margin-left: 6px;
      border-radius: 999px;
      background: #e0f2fe;
      color: #0369a1;
      padding: 1px 6px;
      font-size: 11px;
      font-weight: 700;
    }
    .result small { color: #64748b; }
    .result-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 4px;
    }
    .result-actions a {
      border: 1px solid #cbd5e1;
      border-radius: 5px;
      color: #334155;
      padding: 3px 6px;
      text-decoration: none;
      font-size: 12px;
      font-weight: 650;
    }
    .result-actions a:hover {
      border-color: #0f766e;
      color: #0f766e;
    }
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] || character;
  });
}
