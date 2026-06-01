import { sendRuntimeMessage } from "../shared/chromeRuntime";
import { flagEmoji } from "../shared/flags";
import {
  DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES,
  type GoogleFlightsCountryResult,
  type GoogleFlightsMatrixSearch,
  googleFlightsCountryUrl,
  googleFlightsPanelPageKey,
  inferGoogleFlightsCurrency,
  normalizeGoogleFlightsCurrency,
  parseGoogleFlightsBookingOptions,
  parseGoogleFlightsCountryInput,
  parseGoogleFlightsMatrixSearch,
} from "../shared/googleFlightsBooking";
import {
  allGoogleFlightsCountryCodes,
  filterAvailableGoogleFlightsCountryCodes,
  googleFlightsAvailableCountryOptions,
  googleFlightsCountryCodeFromSearchValue,
  isAllGoogleFlightsCountryCodes,
} from "../shared/googleFlightsCountries";
import { mileageCarrierName } from "../shared/mileageCarriers";
import { loadSettings } from "../shared/storage";
import { muTravelPanelHeaderStyles, renderMuTravelMinimizedButton, renderMuTravelPanelHeader } from "./panelChrome";

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
  panelMinimized: boolean;
  panelPosition: PanelPosition;
  panelCollapsePosition: PanelPosition | null;
  comparingRequestId: string;
  comparingCountryCodes: string[];
  progressCompleted: number;
  progressTotal: number;
  countrySearch: string;
};

type PanelEdge = "top" | "right" | "bottom" | "left";

type PanelPosition = {
  edge: PanelEdge;
  ratio: number;
};

const PANEL_ID = "mu-travel-google-flights-panel";
const RESULT_CACHE_TTL_MS = 10 * 60 * 1000;
const INFERRED_CURRENCY_CACHE_TTL_MS = 5000;
const RESULT_CACHE_STORAGE_KEY = "muTravelGoogleFlightsCountryResults";
const PANEL_UI_STORAGE_KEY = "muTravelGoogleFlightsPanelUi";
const DEFAULT_PANEL_POSITION: PanelPosition = { edge: "right", ratio: 1 };
const PANEL_EDGE_OFFSET_PX = 16;
const GOOGLE_FLIGHTS_HEADER_HEIGHT_PX = 64;
const GOOGLE_FLIGHTS_HEADER_BUFFER_PX = 12;
const PANEL_CORNER_SNAP_PX = 96;
const PANEL_MINIMIZED_ICON_SIZE_PX = 56;
const STORED_OPTIONS_LIMIT = 24;
const COUNTRY_OPTIONS = googleFlightsAvailableCountryOptions();
let regionDisplayNames: Intl.DisplayNames | null | undefined;
let countryCodeByDisplayName: Map<string, string> | null | undefined;
let suppressPanelRestoreClick = false;
let inferredCurrencyCache: { href: string; currency: string; cachedAt: number } | null = null;
const panelUi = loadPanelUiState();

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
  panelMinimized: panelUi.minimized,
  panelPosition: panelUi.position,
  panelCollapsePosition: panelUi.collapsePosition,
  comparingRequestId: "",
  comparingCountryCodes: [],
  progressCompleted: 0,
  progressTotal: 0,
  countrySearch: "",
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
  const payload = message as { command?: string; requestId?: unknown; result?: unknown; ok?: unknown; error?: unknown };
  if (payload.command === "parseGoogleFlightsBookingOptions") {
    sendResponse(parseCurrentBookingPage());
    return false;
  }
  if (payload.command === "googleFlightsCountryComparisonResult") {
    applyGoogleFlightsCountryProgress(payload);
    return false;
  }
  if (payload.command === "googleFlightsCountryComparisonComplete") {
    applyGoogleFlightsCountryComplete(payload);
    return false;
  }
  return false;
});

void init();

async function init(): Promise<void> {
  try {
    const settings = await loadSettings();
    state.countryInput = filterAvailableGoogleFlightsCountryCodes(settings.googleFlights.countryCodes).join(", ");
  } catch {
    state.countryInput = DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES.join(", ");
  }
  scheduleRender();
  installObserver();
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

function currentComparableCurrencyCode(): string {
  return currentVisibleCurrencyCode() || "USD";
}

function currentVisibleCurrencyCode(): string {
  const urlCurrency = urlCurrencyCode();
  if (urlCurrency) return urlCurrency;
  const now = Date.now();
  if (
    inferredCurrencyCache &&
    inferredCurrencyCache.href === window.location.href &&
    now - inferredCurrencyCache.cachedAt <= INFERRED_CURRENCY_CACHE_TTL_MS
  ) {
    return inferredCurrencyCache.currency;
  }
  const currency = inferGoogleFlightsCurrency(document);
  inferredCurrencyCache = currency ? { href: window.location.href, currency, cachedAt: now } : null;
  return currency;
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
    state.comparingRequestId = "";
    state.progressCompleted = 0;
    state.progressTotal = 0;
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
    state.comparingRequestId = "";
    state.progressCompleted = 0;
    state.progressTotal = 0;
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
  return googleFlightsPanelPageKey(
    window.location.href,
    currentComparableCountryCode(),
    includeCountry,
    currentComparableCurrencyCode(),
  );
}

function render(): void {
  const shadow = getShadowRoot();
  if (!shadow) return;
  const matrixSearch = parseGoogleFlightsMatrixSearch(window.location.href);
  const selectedCodes = selectedGoogleFlightsCountries();

  shadow.innerHTML = `
    <style>${styles()}</style>
    <section class="panel ${state.panelMinimized ? "minimized" : ""}" style="${panelPositionStyle(state.panelPosition)}" aria-label="Mu Travel country price comparison">
      ${
        state.panelMinimized
          ? renderMuTravelMinimizedButton()
          : `${renderMuTravelPanelHeader({ optionsAction: "open-options" })}
            ${renderMilesEstimatePrompt(matrixSearch)}
            <div class="section-heading">Compare country pricing</div>
            ${renderCountrySelect(selectedCodes)}
            <div class="actions">
              <button type="button" class="wide" ${state.comparing || selectedCodes.length === 0 ? "disabled" : ""} data-action="compare-countries">
                ${state.comparing ? "Checking..." : `Compare (${selectedCodes.length})`}
              </button>
            </div>
            ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
            ${renderComparisonNotice()}
            ${renderCacheNotice()}
            ${renderResults(state.results)}`
      }
    </section>
  `;

  shadow.querySelector('[data-action="minimize-panel"]')?.addEventListener("click", () => {
    const panel = shadow.querySelector<HTMLElement>(".panel");
    state.panelPosition =
      state.panelCollapsePosition || (panel ? minimizedPanelPositionFromPanel(panel) : state.panelPosition);
    state.panelCollapsePosition = null;
    state.panelMinimized = true;
    savePanelUiState();
    render();
  });
  shadow.querySelector('[data-action="restore-panel"]')?.addEventListener("click", () => {
    if (!state.panelMinimized) return;
    if (suppressPanelRestoreClick) {
      suppressPanelRestoreClick = false;
      return;
    }
    state.panelCollapsePosition = state.panelPosition;
    restoreExpandedPanelPosition();
    state.panelMinimized = false;
    savePanelUiState();
    render();
  });
  shadow.querySelector<HTMLElement>('[data-action="restore-panel"]')?.addEventListener("pointerdown", onPanelDragStart);
  shadow.querySelector<HTMLElement>('[data-role="panel-header"]')?.addEventListener("pointerdown", onPanelDragStart);

  const countrySearch = shadow.querySelector<HTMLInputElement>('[data-role="country-search"]');
  const countryDropdown = shadow.querySelector<HTMLElement>('[data-role="country-dropdown"]');
  countrySearch?.addEventListener("input", () => {
    state.countrySearch = countrySearch.value;
    if (state.error) {
      state.error = "";
      shadow.querySelector(".error")?.remove();
    }
    if (state.countrySearch.includes(",")) {
      addCountrySearchValue(true);
      return;
    }
    renderCountryDropdown(countryDropdown);
  });
  countrySearch?.addEventListener("paste", (event) => {
    const pasted = event.clipboardData?.getData("text") || "";
    if (!pasted || parseGoogleFlightsCountryInput(pasted).length === 0) return;
    event.preventDefault();
    state.countrySearch = pasted;
    addCountrySearchValue(true);
  });
  countrySearch?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addCountrySearchValue(false);
      return;
    }
    if (event.key === "Escape") {
      state.countrySearch = "";
      countrySearch.value = "";
      renderCountryDropdown(countryDropdown);
      return;
    }
    if (event.key === "Backspace" && countrySearch.value === "") {
      removeGoogleFlightsCountry(selectedGoogleFlightsCountries().at(-1) || "");
    }
  });
  countrySearch?.addEventListener("focus", () => {
    renderCountryDropdown(countryDropdown);
  });
  shadow.querySelectorAll<HTMLElement>('[data-action="add-country"]').forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      const code = button.dataset.code || "";
      if (!code) return;
      addGoogleFlightsCountries([code], true);
    });
  });
  shadow.querySelectorAll<HTMLElement>('[data-action="remove-country"]').forEach((button) => {
    button.addEventListener("click", () => {
      removeGoogleFlightsCountry(button.dataset.code || "");
    });
  });
  shadow.querySelector('[data-action="country-recommended"]')?.addEventListener("click", () => {
    if (state.comparing) return;
    updateGoogleFlightsCountrySelection(DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES);
    render();
  });
  shadow.querySelector('[data-action="country-all"]')?.addEventListener("click", () => {
    if (state.comparing) return;
    updateGoogleFlightsCountrySelection(allGoogleFlightsCountryCodes());
    render();
  });
  shadow.querySelector('[data-action="country-clear"]')?.addEventListener("click", () => {
    if (state.comparing) return;
    updateGoogleFlightsCountrySelection([]);
    render();
  });
  shadow.querySelector('[data-action="compare-countries"]')?.addEventListener("click", () => {
    void compareCountries();
  });
  shadow.querySelector('[data-action="open-options"]')?.addEventListener("click", () => {
    sendRuntimeMessage({ command: "openOptionsPage" });
  });
}

function renderCountrySelect(selectedCodes: string[]): string {
  const dropdownOptions = countryDropdownOptions();
  const disabled = state.comparing ? "disabled" : "";
  return `
    <div class="country-select">
      <div class="country-head">
        <span>Countries</span>
        <small>${selectedCodes.length} selected</small>
      </div>
      <div class="country-combo">
        <input type="search" data-role="country-search" aria-label="Add a country" placeholder="Add a country..." autocomplete="off" spellcheck="false" value="${escapeHtml(state.countrySearch)}" ${disabled}>
        <ul class="country-dropdown" data-role="country-dropdown" ${dropdownOptions.length === 0 ? "hidden" : ""}>
          ${renderCountryDropdownRows(dropdownOptions)}
        </ul>
      </div>
      <div class="country-chips" data-role="country-chips">
        ${selectedCodes
          .map(
            (code) => `
              <button type="button" class="country-chip" data-action="remove-country" data-code="${escapeHtml(code)}" aria-label="Remove ${escapeHtml(countryDisplayName(code))}" ${disabled}>
                <span class="flag" aria-hidden="true">${escapeHtml(flagEmoji(code))}</span>${escapeHtml(code)}<span class="x">x</span>
              </button>
            `,
          )
          .join("")}
      </div>
      <div class="country-toolbar">
        <button type="button" class="link" data-action="country-recommended" ${disabled}>Recommended</button>
        <button type="button" class="link" data-action="country-all" ${disabled}>All useful</button>
        <button type="button" class="link" data-action="country-clear" ${disabled}>Clear</button>
      </div>
    </div>
  `;
}

function countryDropdownOptions(): Array<{ code: string; label: string; searchValue: string }> {
  const query = normalizeCountryName(state.countrySearch);
  if (!query) return [];
  const selectedCodes = new Set(selectedGoogleFlightsCountries());
  return COUNTRY_OPTIONS.filter((country) => {
    if (selectedCodes.has(country.code)) return false;
    return (
      country.code.toLowerCase().includes(query) ||
      normalizeCountryName(country.label).includes(query) ||
      normalizeCountryName(country.searchValue).includes(query)
    );
  }).slice(0, 8);
}

function renderCountryDropdownRows(countries: Array<{ code: string; label: string }>): string {
  const disabled = state.comparing ? "disabled" : "";
  return countries
    .map(
      (country, index) => `
        <li>
          <button type="button" class="${index === 0 ? "active" : ""}" data-action="add-country" data-code="${escapeHtml(country.code)}" ${disabled}>
            <span class="flag" aria-hidden="true">${escapeHtml(flagEmoji(country.code))}</span>
            <span>${escapeHtml(country.label)}</span>
            <small>${escapeHtml(country.code)}</small>
          </button>
        </li>
      `,
    )
    .join("");
}

function renderCountryDropdown(dropdown: HTMLElement | null): void {
  if (!dropdown) return;
  const countries = countryDropdownOptions();
  dropdown.hidden = countries.length === 0;
  dropdown.innerHTML = renderCountryDropdownRows(countries);
  dropdown.querySelectorAll<HTMLElement>('[data-action="add-country"]').forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      const code = button.dataset.code || "";
      if (!code) return;
      addGoogleFlightsCountries([code], true);
    });
  });
}

function addCountrySearchValue(parseAsList: boolean): void {
  if (state.comparing) return;
  const parsedCodes = parseAsList
    ? filterAvailableGoogleFlightsCountryCodes(parseGoogleFlightsCountryInput(state.countrySearch))
    : [];
  const firstMatch = countryDropdownOptions()[0]?.code || "";
  const code = googleFlightsCountryCodeFromSearchValue(state.countrySearch, COUNTRY_OPTIONS) || firstMatch;
  const countryCodes = parsedCodes.length > 0 ? parsedCodes : code ? [code] : [];
  addGoogleFlightsCountries(countryCodes, true);
}

function addGoogleFlightsCountries(countryCodes: string[], refocusSearch: boolean): void {
  if (state.comparing) return;
  const availableCountryCodes = filterAvailableGoogleFlightsCountryCodes(countryCodes);
  if (availableCountryCodes.length === 0) {
    state.error = "Choose an available Google Flights country.";
    render();
    if (refocusSearch) focusCountrySearch();
    return;
  }
  const nextCountries = filterAvailableGoogleFlightsCountryCodes([
    ...selectedGoogleFlightsCountries(),
    ...availableCountryCodes,
  ]);
  if (nextCountries.length === 0) return;
  updateGoogleFlightsCountrySelection(nextCountries);
  render();
  if (refocusSearch) focusCountrySearch();
}

function removeGoogleFlightsCountry(countryCode: string): void {
  if (state.comparing) return;
  if (!countryCode) return;
  const nextCountries = selectedGoogleFlightsCountries().filter((code) => code !== countryCode);
  updateGoogleFlightsCountrySelection(nextCountries);
  render();
}

function updateGoogleFlightsCountrySelection(countryCodes: string[]): void {
  const nextCountries = filterAvailableGoogleFlightsCountryCodes(countryCodes);
  const selectedCountrySet = new Set(nextCountries);
  state.countryInput = nextCountries.join(", ");
  state.countrySearch = "";
  state.results = state.results.filter((result) => selectedCountrySet.has(result.country));
  state.resultsCachedAt = 0;
  state.error = "";
}

function selectedGoogleFlightsCountries(): string[] {
  return filterAvailableGoogleFlightsCountryCodes(parseGoogleFlightsCountryInput(state.countryInput));
}

function focusCountrySearch(): void {
  getShadowRoot()?.querySelector<HTMLInputElement>('[data-role="country-search"]')?.focus();
}

function renderCacheNotice(now = Date.now()): string {
  if (!state.resultsCachedAt || state.results.length === 0) return "";
  const minutes = Math.max(0, Math.floor((now - state.resultsCachedAt) / 60000));
  const age = minutes <= 0 ? "just now" : `${minutes} min ago`;
  return `<p class="cache-note">Cached country comparison from ${escapeHtml(age)}.</p>`;
}

function renderComparisonNotice(): string {
  if (state.comparing) {
    return `<p class="cache-note">${state.progressCompleted} of ${state.progressTotal} countries checked.</p>`;
  }
  const selectedCountries = selectedGoogleFlightsCountries();
  const selectedCount = selectedCountries.length;
  if (selectedCount <= DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES.length) return "";
  if (isAllGoogleFlightsCountryCodes(selectedCountries)) {
    return `<p class="cache-note">All useful countries excludes unsupported and not-useful markets. Large checks can take a long time.</p>`;
  }
  return `<p class="cache-note">Large country selections can take a long time. Results appear as each country finishes.</p>`;
}

function renderMilesEstimatePrompt(matrixSearch: GoogleFlightsMatrixSearch | null): string {
  if (!matrixSearch) return "";
  const earningCarriers = matrixSearch.carriers
    .map((carrier) => ({ carrier, name: mileageCarrierName(carrier) }))
    .filter((carrier): carrier is { carrier: string; name: string } => Boolean(carrier.name));
  const carrierLabels = earningCarriers.map((carrier) => `${carrier.name} (${carrier.carrier})`).join(", ");
  const promptText =
    earningCarriers.length > 0
      ? ` to see booking classes and mileage earning details for ${escapeHtml(carrierLabels)}.`
      : " to see booking classes and mileage earning details.";
  return `
    <div class="mileage-prompt">
      <strong>Miles earning</strong>
      <span><a href="${escapeHtml(matrixSearch.matrixUrl)}" target="_blank" rel="noopener noreferrer" data-action="open-matrix">Search ITA Matrix</a>${promptText}</span>
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

function loadPanelUiState(): {
  minimized: boolean;
  position: PanelPosition;
  collapsePosition: PanelPosition | null;
} {
  try {
    const raw = sessionStorage.getItem(PANEL_UI_STORAGE_KEY);
    if (!raw) {
      return { minimized: false, position: DEFAULT_PANEL_POSITION, collapsePosition: null };
    }
    const parsed = JSON.parse(raw) as {
      minimized?: unknown;
      position?: unknown;
      collapsePosition?: unknown;
    };
    const position = isPanelPosition(parsed.position) ? parsed.position : DEFAULT_PANEL_POSITION;
    return {
      minimized: parsed.minimized === true,
      position,
      collapsePosition: isPanelPosition(parsed.collapsePosition) ? parsed.collapsePosition : null,
    };
  } catch {
    return { minimized: false, position: DEFAULT_PANEL_POSITION, collapsePosition: null };
  }
}

function savePanelUiState(): void {
  try {
    sessionStorage.setItem(
      PANEL_UI_STORAGE_KEY,
      JSON.stringify({
        minimized: state.panelMinimized,
        position: state.panelPosition,
        collapsePosition: state.panelCollapsePosition,
      }),
    );
  } catch {
    // Session storage is an enhancement; the panel still works without it.
  }
}

function isPanelPosition(value: unknown): value is PanelPosition {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { edge?: unknown; ratio?: unknown };
  return (
    (candidate.edge === "top" ||
      candidate.edge === "right" ||
      candidate.edge === "bottom" ||
      candidate.edge === "left") &&
    typeof candidate.ratio === "number" &&
    Number.isFinite(candidate.ratio) &&
    candidate.ratio >= 0 &&
    candidate.ratio <= 1
  );
}

function onPanelDragStart(event: PointerEvent): void {
  const handle = event.currentTarget;
  if (!(handle instanceof HTMLElement)) return;
  if (handle.dataset.role === "panel-header" && isInteractivePanelDragTarget(event.target)) return;
  const panel = handle.closest<HTMLElement>(".panel");
  if (!panel) return;

  event.preventDefault();
  handle.setPointerCapture(event.pointerId);
  let dragged = false;
  const startX = event.clientX;
  const startY = event.clientY;

  const movePanel = (pointerEvent: PointerEvent) => {
    if (Math.hypot(pointerEvent.clientX - startX, pointerEvent.clientY - startY) <= 4) return;
    dragged = true;
    state.panelPosition = panelPositionFromPoint(pointerEvent.clientX, pointerEvent.clientY);
    panel.setAttribute("style", panelPositionStyle(state.panelPosition));
  };

  const stopDragging = (pointerEvent: PointerEvent) => {
    if (dragged) movePanel(pointerEvent);
    if (dragged) state.panelCollapsePosition = null;
    savePanelUiState();
    handle.releasePointerCapture(pointerEvent.pointerId);
    handle.removeEventListener("pointermove", movePanel);
    handle.removeEventListener("pointerup", stopDragging);
    handle.removeEventListener("pointercancel", stopDragging);
    if (dragged && handle.dataset.action === "restore-panel") {
      suppressPanelRestoreClick = true;
      window.setTimeout(() => {
        suppressPanelRestoreClick = false;
      }, 0);
    } else if (handle.dataset.action === "restore-panel") {
      state.panelCollapsePosition = state.panelPosition;
      restoreExpandedPanelPosition();
      state.panelMinimized = false;
      savePanelUiState();
      render();
    }
  };

  handle.addEventListener("pointermove", movePanel);
  handle.addEventListener("pointerup", stopDragging);
  handle.addEventListener("pointercancel", stopDragging);
}

function isInteractivePanelDragTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("button, a, input, select, textarea, summary, label"));
}

function restoreExpandedPanelPosition(): void {
  state.panelPosition = nearestWindowCornerPanelPosition(state.panelPosition);
}

function panelPositionFromPoint(clientX: number, clientY: number): PanelPosition {
  const width = Math.max(window.innerWidth, 1);
  const height = Math.max(window.innerHeight, 1);
  const topOffset = panelTopOffsetPx();
  const verticalAxisLength = Math.max(height - topOffset - PANEL_EDGE_OFFSET_PX, 1);
  const verticalAxisPoint = clamp(clientY - topOffset, 0, verticalAxisLength);
  const distances: Array<{ edge: PanelEdge; distance: number }> = [
    { edge: "left", distance: clientX },
    { edge: "right", distance: width - clientX },
    { edge: "top", distance: Math.max(clientY - topOffset, 0) },
    { edge: "bottom", distance: height - clientY },
  ];
  distances.sort((a, b) => a.distance - b.distance);

  const edge = distances[0]?.edge || DEFAULT_PANEL_POSITION.edge;
  const axisLength = edge === "top" || edge === "bottom" ? width : verticalAxisLength;
  const axisPoint = edge === "top" || edge === "bottom" ? clientX : verticalAxisPoint;
  let ratio = clamp(axisPoint / axisLength, 0, 1);

  if (axisPoint <= PANEL_CORNER_SNAP_PX) ratio = 0;
  if (axisLength - axisPoint <= PANEL_CORNER_SNAP_PX) ratio = 1;

  return { edge, ratio };
}

function minimizedPanelPositionFromPanel(panel: HTMLElement): PanelPosition {
  const rect = panel.getBoundingClientRect();
  const topOffset = panelTopOffsetPx();
  const width = Math.max(window.innerWidth, 1);
  const height = Math.max(window.innerHeight, 1);
  const viewportCorners = [
    { x: 0, y: topOffset },
    { x: width, y: topOffset },
    { x: 0, y: height },
    { x: width, y: height },
  ];
  const panelCorners = [
    { distanceX: rect.left, distanceY: rect.top, x: rect.left, y: rect.top },
    { distanceX: rect.right, distanceY: rect.top, x: rect.right, y: rect.top },
    {
      distanceX: rect.left,
      distanceY: rect.bottom,
      x: rect.left,
      y: rect.bottom - PANEL_MINIMIZED_ICON_SIZE_PX,
    },
    {
      distanceX: rect.right,
      distanceY: rect.bottom,
      x: rect.right,
      y: rect.bottom - PANEL_MINIMIZED_ICON_SIZE_PX,
    },
  ];
  const nearest = panelCorners
    .map((corner) => ({
      ...corner,
      distance: Math.min(
        ...viewportCorners.map((viewportCorner) =>
          Math.hypot(corner.distanceX - viewportCorner.x, corner.distanceY - viewportCorner.y),
        ),
      ),
    }))
    .sort((left, right) => left.distance - right.distance)[0];
  return panelPositionFromPoint(nearest?.x ?? rect.right, nearest?.y ?? rect.top);
}

function nearestWindowCornerPanelPosition(position: PanelPosition): PanelPosition {
  const point = panelPositionPoint(position);
  const topOffset = panelTopOffsetPx();
  const width = Math.max(window.innerWidth, 1);
  const height = Math.max(window.innerHeight, 1);
  const corners: Array<{ position: PanelPosition; x: number; y: number }> = [
    { position: { edge: "top", ratio: 0 }, x: 0, y: topOffset },
    { position: { edge: "top", ratio: 1 }, x: width, y: topOffset },
    { position: { edge: "bottom", ratio: 0 }, x: 0, y: height },
    { position: { edge: "bottom", ratio: 1 }, x: width, y: height },
  ];
  return (
    corners
      .map((corner) => ({
        ...corner,
        distance: Math.hypot(point.x - corner.x, point.y - corner.y),
      }))
      .sort((left, right) => left.distance - right.distance)[0]?.position || DEFAULT_PANEL_POSITION
  );
}

function panelPositionPoint(position: PanelPosition): { x: number; y: number } {
  const width = Math.max(window.innerWidth, 1);
  const height = Math.max(window.innerHeight, 1);
  const topOffset = panelTopOffsetPx();
  const verticalAxisLength = Math.max(height - topOffset - PANEL_EDGE_OFFSET_PX, 1);
  if (position.edge === "top") return { x: width * position.ratio, y: topOffset };
  if (position.edge === "bottom") return { x: width * position.ratio, y: height };
  return {
    x: position.edge === "left" ? 0 : width,
    y: topOffset + verticalAxisLength * position.ratio,
  };
}

function panelPositionStyle(position: PanelPosition): string {
  const percent = `${Math.round(position.ratio * 1000) / 10}%`;
  const offset = `${PANEL_EDGE_OFFSET_PX}px`;
  const topOffsetPx = panelTopOffsetPx();
  const topOffset = `${topOffsetPx}px`;
  const topMaxHeight = `max-height: calc(100vh - ${topOffsetPx + PANEL_EDGE_OFFSET_PX}px);`;
  const verticalAxisLength = Math.max(window.innerHeight - topOffsetPx - PANEL_EDGE_OFFSET_PX, 1);
  const topPx = Math.round(topOffsetPx + verticalAxisLength * position.ratio);
  if (position.edge === "top" && position.ratio === 0) return `top: ${topOffset}; left: ${offset}; ${topMaxHeight}`;
  if (position.edge === "top" && position.ratio === 1) return `top: ${topOffset}; right: ${offset}; ${topMaxHeight}`;
  if (position.edge === "bottom" && position.ratio === 0) return `bottom: ${offset}; left: ${offset};`;
  if (position.edge === "bottom" && position.ratio === 1) return `right: ${offset}; bottom: ${offset};`;
  if (position.edge === "left" && position.ratio === 0) return `top: ${topOffset}; left: ${offset}; ${topMaxHeight}`;
  if (position.edge === "left" && position.ratio === 1) return `bottom: ${offset}; left: ${offset};`;
  if (position.edge === "right" && position.ratio === 0) return `top: ${topOffset}; right: ${offset}; ${topMaxHeight}`;
  if (position.edge === "right" && position.ratio === 1) return `right: ${offset}; bottom: ${offset};`;
  if (position.edge === "top") {
    return `top: ${topOffset}; left: ${percent}; transform: translateX(-${percent}); ${topMaxHeight}`;
  }
  if (position.edge === "bottom") return `bottom: ${offset}; left: ${percent}; transform: translateX(-${percent});`;
  if (position.edge === "left")
    return `left: ${offset}; top: ${topPx}px; transform: translateY(-${percent}); ${topMaxHeight}`;
  return `right: ${offset}; top: ${topPx}px; transform: translateY(-${percent}); ${topMaxHeight}`;
}

function panelTopOffsetPx(): number {
  const maxOffset = Math.max(PANEL_EDGE_OFFSET_PX, window.innerHeight - 96);
  return clamp(GOOGLE_FLIGHTS_HEADER_HEIGHT_PX + GOOGLE_FLIGHTS_HEADER_BUFFER_PX, PANEL_EDGE_OFFSET_PX, maxOffset);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

function urlCurrencyCode(): string {
  return normalizeGoogleFlightsCurrency(new URL(window.location.href).searchParams.get("curr"));
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
  const selectedCountries = selectedGoogleFlightsCountries();
  if (selectedCountries.length === 0) {
    state.error = "Enter at least one country code.";
    render();
    return;
  }
  state.countryInput = selectedCountries.join(", ");
  state.comparing = true;
  state.comparingCountryCodes = selectedCountries;
  state.error = "";
  state.comparingRequestId = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
  state.progressCompleted = 0;
  const previousResults = state.results;
  const visibleCurrency = currentVisibleCurrencyCode();
  const comparableCurrency = currentComparableCurrencyCode();
  const hasComparableCurrency = Boolean(visibleCurrency);
  const comparePageKey = state.pageKey;
  const baseUrl = googleFlightsCountryUrl(window.location.href, currentComparableCountryCode(), comparableCurrency);
  const currentCountry = currentComparableCountryCode();
  state.baseline = hasComparableCurrency ? parseCurrentBookingPage() : null;
  const baseline = state.baseline && selectedCountries.includes(currentCountry) ? state.baseline : null;
  const countries = selectedCountries.filter((country) => !hasComparableCurrency || country !== currentCountry);
  state.progressTotal = countries.length;
  if (baseline) {
    state.results = mergeCountryResults(previousResults, [baseline], selectedCountries).results;
    state.resultsCachedAt = 0;
  }
  const requestId = state.comparingRequestId;
  render();
  try {
    const response = (await chrome.runtime.sendMessage({
      command: "compareGoogleFlightsCountries",
      baseUrl,
      countries,
      baselineOptionCount: baseline?.options.length ?? 0,
      requestId,
    })) as { ok?: boolean; error?: string } | undefined;
    if (state.pageKey !== comparePageKey || state.comparingRequestId !== requestId) return;
    if (!response?.ok) throw new Error(response?.error || "Country comparison failed.");
  } catch (error) {
    if (state.pageKey !== comparePageKey || state.comparingRequestId !== requestId) return;
    state.error = error instanceof Error ? error.message : "Country comparison failed.";
    state.comparing = false;
    state.comparingRequestId = "";
    state.comparingCountryCodes = [];
    render();
  }
}

function applyGoogleFlightsCountryProgress(payload: { requestId?: unknown; result?: unknown }): void {
  if (
    typeof payload.requestId !== "string" ||
    payload.requestId !== state.comparingRequestId ||
    !isGoogleFlightsCountryResult(payload.result)
  ) {
    return;
  }

  const selectedCountries =
    state.comparingCountryCodes.length > 0 ? state.comparingCountryCodes : selectedGoogleFlightsCountries();
  state.results = mergeCountryResults(state.results, [payload.result], selectedCountries).results;
  state.resultsCachedAt = 0;
  state.progressCompleted = Math.min(state.progressTotal, state.progressCompleted + 1);
  render();
}

function applyGoogleFlightsCountryComplete(payload: { requestId?: unknown; ok?: unknown; error?: unknown }): void {
  if (typeof payload.requestId !== "string" || payload.requestId !== state.comparingRequestId) return;
  if (!payload.ok) {
    state.error = typeof payload.error === "string" ? payload.error : "Country comparison failed.";
  } else if (state.cacheKey || state.pageKey) {
    state.resultsCachedAt = Date.now();
    pruneExpiredResultCache();
    void storeCachedResults(state.cacheKey || state.pageKey, state.results, state.resultsCachedAt);
  }
  state.progressCompleted = state.progressTotal;
  state.comparing = false;
  state.comparingRequestId = "";
  state.comparingCountryCodes = [];
  render();
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
      z-index: 2147483647;
      width: min(340px, calc(100vw - 32px));
      max-height: min(560px, calc(100vh - 32px));
      overflow-x: hidden;
      overflow-y: auto;
      border: 1px solid #d7dde8;
      border-radius: 8px;
      background: #ffffff;
      color: #172033;
      box-shadow: 0 18px 48px rgba(15, 23, 42, 0.18);
      font: 12px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .panel.minimized {
      width: auto;
      max-height: none;
      overflow: visible;
      border: 0;
      border-radius: 999px;
      background: transparent;
      box-shadow: none;
    }
    ${muTravelPanelHeaderStyles()}
    .panel-icon {
      display: inline-grid;
      place-items: center;
      width: 56px;
      height: 56px;
      border: 1px solid #0f766e;
      border-radius: 999px;
      background: #0f766e;
      color: #ffffff;
      box-shadow: 0 8px 28px rgba(15, 23, 42, 0.24);
      font: inherit;
      font-weight: 750;
      letter-spacing: 0;
      cursor: pointer;
      overflow: hidden;
    }
    .panel-icon img {
      width: 48px;
      height: 48px;
      border-radius: 10px;
    }
    .icon-button {
      flex: 0 0 auto;
      display: inline-grid;
      place-items: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border-color: #cbd5e1;
      background: #ffffff;
      color: #475569;
      font-size: 18px;
      line-height: 1;
    }
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
    .mileage-prompt a {
      color: #0f766e;
      font-weight: 700;
      text-decoration: none;
    }
    .mileage-prompt a:hover {
      text-decoration: underline;
    }
    .section-heading {
      padding: 10px 12px 0;
      color: #172033;
      font-weight: 750;
    }
    .country-select {
      display: grid;
      gap: 6px;
      padding: 6px 12px 0;
    }
    .country-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 8px;
      color: #64748b;
      font-weight: 650;
    }
    .country-head small {
      color: #94a3b8;
      font-size: 11px;
      font-weight: 650;
    }
    .country-combo {
      position: relative;
    }
    .country-combo input {
      width: 100%;
      min-width: 0;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #ffffff;
      color: #172033;
      -webkit-text-fill-color: #172033;
      appearance: none;
      padding: 7px 8px;
      font: inherit;
      font-weight: 400;
      min-height: 32px;
    }
    .country-dropdown {
      position: absolute;
      z-index: 2;
      left: 0;
      right: 0;
      top: calc(100% + 2px);
      max-height: 200px;
      overflow: auto;
      margin: 0;
      padding: 4px;
      list-style: none;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #ffffff;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
    }
    .country-dropdown[hidden] {
      display: none;
    }
    .country-dropdown button {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 7px;
      width: 100%;
      border: 0;
      border-radius: 5px;
      background: transparent;
      color: #172033;
      padding: 6px 7px;
      text-align: left;
      font-weight: 550;
    }
    .country-dropdown button:hover,
    .country-dropdown button.active {
      background: #f1f5f9;
    }
    .country-dropdown small {
      color: #94a3b8;
      font-size: 11px;
      font-weight: 650;
    }
    .country-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      max-height: 120px;
      overflow-y: auto;
    }
    .country-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-height: 0;
      border: 1px solid #cbd5e1;
      border-radius: 999px;
      background: #f8fafc;
      color: #172033;
      padding: 2px 6px 2px 5px;
      font-weight: 600;
    }
    .country-chip .flag {
      font-weight: 400;
    }
    .country-chip .x {
      color: #94a3b8;
    }
    .country-chip:hover .x {
      color: #dc2626;
    }
    .country-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    button.link {
      min-height: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: #0f766e;
      padding: 0;
      font-weight: 650;
    }
    .actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 6px;
      padding: 9px 12px;
    }
    .actions .wide {
      grid-column: 1 / -1;
    }
    button {
      border: 1px solid #0f766e;
      border-radius: 6px;
      background: #0f766e;
      color: #ffffff;
      padding: 7px 9px;
      font: inherit;
      font-weight: 650;
      cursor: pointer;
      min-width: 0;
      min-height: 32px;
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
