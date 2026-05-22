import {
  DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES,
  type GoogleFlightsCountryResult,
  parseGoogleFlightsBookingOptions,
} from "../shared/googleFlightsBooking";

type CompareState = {
  comparing: boolean;
  baseline: GoogleFlightsCountryResult | null;
  results: GoogleFlightsCountryResult[];
  error: string;
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
};

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const payload = message as { command?: string };
  if (payload.command !== "parseGoogleFlightsBookingOptions") return false;
  sendResponse(parseCurrentBookingPage());
  return false;
});

if (isBookingPage()) {
  installPanel();
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
      <button type="button" ${state.comparing ? "disabled" : ""} data-action="compare-countries">
        ${state.comparing ? "Checking..." : "Compare countries"}
      </button>
      ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
      ${renderResults(state.results)}
    </section>
  `;

  shadow.querySelector('[data-action="compare-countries"]')?.addEventListener("click", () => {
    void compareCountries();
  });
}

function renderBaseline(result: GoogleFlightsCountryResult): string {
  const direct = result.direct
    ? `${result.direct.priceText} ${result.direct.provider}`
    : "No direct airline option found";
  const cheapest = result.cheapest
    ? `${result.cheapest.priceText} ${result.cheapest.provider}`
    : "No booking options found";
  return `
    <dl>
      <div><dt>This page</dt><dd>${escapeHtml(result.country)}</dd></div>
      <div><dt>Cheapest</dt><dd>${escapeHtml(cheapest)}</dd></div>
      <div><dt>Direct</dt><dd>${escapeHtml(direct)}</dd></div>
      <div><dt>Options</dt><dd>${result.options.length}</dd></div>
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
          const cheapest = result.cheapest ? `${result.cheapest.priceText} ${result.cheapest.provider}` : "No options";
          const direct = result.direct ? `${result.direct.priceText} direct` : "No direct";
          return `
            <div class="result ${result.status}">
              <strong>${escapeHtml(result.country)}</strong>
              <span>${escapeHtml(cheapest)}</span>
              <small>${escapeHtml(direct)} · ${result.options.length} option(s)${result.refreshed ? " · retried" : ""}</small>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

async function compareCountries(): Promise<void> {
  state.comparing = true;
  state.error = "";
  state.results = [];
  state.baseline = parseCurrentBookingPage();
  render();

  const currentCountry = currentCountryCode();
  const countries = DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES.filter((country) => country !== currentCountry);
  try {
    const response = (await chrome.runtime.sendMessage({
      command: "compareGoogleFlightsCountries",
      baseUrl: window.location.href,
      countries,
      baselineOptionCount: state.baseline.options.length,
    })) as CompareResponse;
    if (!response?.ok) throw new Error(response?.error || "Country comparison failed.");
    state.results = response.results || [];
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
    button {
      width: calc(100% - 24px);
      margin: 10px 12px;
      border: 1px solid #0f766e;
      border-radius: 6px;
      background: #0f766e;
      color: #ffffff;
      padding: 8px 10px;
      font: inherit;
      font-weight: 650;
      cursor: pointer;
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
