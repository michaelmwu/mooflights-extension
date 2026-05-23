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
  results: GoogleFlightsCountryResult[];
  error: string;
  countryInput: string;
  pageKey: string;
};

type CompareResponse = {
  ok: boolean;
  results?: GoogleFlightsCountryResult[];
  error?: string;
};

const PANEL_ID = "mu-travel-google-flights-panel";
const BOOKING_PATH_RE = /^\/travel\/flights\/booking/;
const RESULT_CACHE_TTL_MS = 60 * 60 * 1000;
let regionDisplayNames: Intl.DisplayNames | null | undefined;

const state: CompareState = {
  comparing: false,
  baseline: null,
  results: [],
  error: "",
  countryInput: DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES.join(", "),
  pageKey: "",
};

const resultCache = new Map<
  string,
  {
    results: GoogleFlightsCountryResult[];
    cachedAt: number;
  }
>();

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
  return new URL(window.location.href).searchParams.get("gl")?.toUpperCase() || "CURRENT";
}

function currentComparableCountryCode(): string {
  const country = new URL(window.location.href).searchParams.get("gl")?.toUpperCase();
  return /^[A-Z]{2}$/.test(country || "") ? country || "" : DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES[0] || "US";
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
  if (!pageKey) {
    if (!state.pageKey && !document.getElementById(PANEL_ID)) return;
    removePanel();
    state.pageKey = "";
    state.baseline = null;
    state.results = [];
    state.error = "";
    state.comparing = false;
    return;
  }

  installPanel();
  if (state.pageKey !== pageKey) {
    state.pageKey = pageKey;
    state.error = "";
    state.comparing = false;
    const cached = resultCache.get(pageKey);
    state.results = cached && Date.now() - cached.cachedAt <= RESULT_CACHE_TTL_MS ? cached.results : [];
  }

  if (state.comparing) return;
  state.baseline = parseCurrentBookingPage();
  render();
}

function currentBookingPageKey(): string {
  if (!isBookingPage()) return "";
  const url = new URL(window.location.href);
  const params = new URLSearchParams();
  for (const key of ["tfs", "tfu", "curr", "gl"]) {
    const value = url.searchParams.get(key);
    if (value) params.set(key, value);
  }
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
    void chrome.runtime.sendMessage({ command: "openOptionsPage" });
  });
}

function renderBaseline(result: GoogleFlightsCountryResult): string {
  return `
    <dl>
      <div><dt>This page</dt><dd>${escapeHtml(countryDisplayName(result.country))}</dd></div>
    </dl>
  `;
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
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderCheapest(result: GoogleFlightsCountryResult): string {
  if (!result.cheapest) return "No options";
  const tiedProviders = result.options
    .filter((option) => option.price === result.cheapest?.price)
    .map((option) => option.provider);
  return `${result.cheapest.priceText} ${tiedProviders.join(", ")}`;
}

function countryDisplayName(country: string): string {
  const code = country.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "Current country";
  const displayNames = getRegionDisplayNames();
  if (displayNames) {
    const label = displayNames.of(code);
    return label ? `${label} (${code})` : code;
  }
  return code;
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
  state.results = [];
  const currentUrl = new URL(window.location.href);
  const hasComparableCurrency = currentUrl.searchParams.has("curr");
  state.baseline = hasComparableCurrency ? parseCurrentBookingPage() : null;
  const comparePageKey = state.pageKey;
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
    state.results = baseline ? [baseline, ...(response.results || [])] : response.results || [];
    if (comparePageKey) {
      resultCache.set(comparePageKey, {
        results: state.results,
        cachedAt: Date.now(),
      });
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
    .panel {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 2147483647;
      width: min(360px, calc(100vw - 32px));
      max-height: min(560px, calc(100vh - 32px));
      overflow: auto;
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
      grid-template-columns: 1fr auto;
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
