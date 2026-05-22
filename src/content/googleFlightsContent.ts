import {
  DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES,
  type GoogleFlightsCountryResult,
  parseGoogleFlightsBookingOptions,
  parseGoogleFlightsCountryInput,
} from "../shared/googleFlightsBooking";
import { loadSettings } from "../shared/storage";

type CompareState = {
  comparing: boolean;
  baseline: GoogleFlightsCountryResult | null;
  results: GoogleFlightsCountryResult[];
  error: string;
  countryInput: string;
};

type CompareResponse = {
  ok: boolean;
  results?: GoogleFlightsCountryResult[];
  error?: string;
};

const PANEL_ID = "mu-travel-google-flights-panel";
const BOOKING_PATH_RE = /^\/travel\/flights\/booking/;

const state: CompareState = {
  comparing: false,
  baseline: null,
  results: [],
  error: "",
  countryInput: DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES.join(", "),
};

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const payload = message as { command?: string };
  if (payload.command !== "parseGoogleFlightsBookingOptions") return false;
  sendResponse(parseCurrentBookingPage());
  return false;
});

if (isBookingPage()) {
  void init();
}

async function init(): Promise<void> {
  installPanel();
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

function parseCurrentBookingPage(): GoogleFlightsCountryResult {
  return parseGoogleFlightsBookingOptions(document, currentCountryCode(), window.location.href);
}

function installPanel(): void {
  getShadowRoot();
}

function installObserver(): void {
  let timer: number | undefined;
  const observer = new MutationObserver(() => {
    window.clearTimeout(timer);
    timer = window.setTimeout(scheduleRender, 250);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

function scheduleRender(): void {
  if (state.comparing) return;
  state.baseline = parseCurrentBookingPage();
  render();
}

function render(): void {
  const shadow = getShadowRoot();
  if (!shadow) return;
  const baseline = state.baseline || parseCurrentBookingPage();

  shadow.innerHTML = `
    <style>${styles()}</style>
    <section class="panel" aria-label="Mu Travel country price comparison">
      <header>
        <strong>Mu Travel</strong>
        <span>Country price check</span>
      </header>
      ${renderBaseline(baseline)}
      <label class="country-input">
        Countries
        <input type="text" value="${escapeHtml(state.countryInput)}" data-role="country-input" spellcheck="false" />
      </label>
      <div class="actions">
        <button type="button" ${state.comparing ? "disabled" : ""} data-action="compare-countries">
          ${state.comparing ? "Checking..." : "Compare countries"}
        </button>
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
  shadow.querySelector('[data-action="open-options"]')?.addEventListener("click", () => {
    void chrome.runtime.openOptionsPage();
  });
}

function renderBaseline(result: GoogleFlightsCountryResult): string {
  return `
    <dl>
      <div><dt>This page</dt><dd>${escapeHtml(countryDisplayName(result.country))}</dd></div>
    </dl>
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
  try {
    const label = new Intl.DisplayNames(["en"], { type: "region" }).of(code);
    return label ? `${label} (${code})` : code;
  } catch {
    return code;
  }
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
  state.baseline = parseCurrentBookingPage();
  render();

  const currentCountry = currentCountryCode();
  const countries = selectedCountries.filter((country) => country !== currentCountry);
  try {
    const response = (await chrome.runtime.sendMessage({
      command: "compareGoogleFlightsCountries",
      baseUrl: window.location.href,
      countries,
      baselineOptionCount: state.baseline.options.length,
    })) as CompareResponse;
    if (!response?.ok) throw new Error(response?.error || "Country comparison failed.");
    state.results = [state.baseline, ...(response.results || [])];
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Country comparison failed.";
  } finally {
    state.comparing = false;
    render();
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
