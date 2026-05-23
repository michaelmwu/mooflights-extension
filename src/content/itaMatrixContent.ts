import { airportDistanceMiles } from "../shared/airportCoordinates";
import {
  airportCodes,
  countryCodeFromSearchValue,
  countrySearchValue,
  parseAirportCodes,
  uniqueAirportCountries,
  uniqueAirportRegions,
  uniqueAirportValues,
} from "../shared/airports";
import { fetchRemoteProviderMetadata } from "../shared/backendClient";
import { flattenSegments, parseItaBookingDetails, parseItineraryJson } from "../shared/itinerary";
import { rankProviderLinks, summarizeItinerary } from "../shared/providers";
import { loadSettings, saveSettings } from "../shared/storage";
import type { ExtensionSettings, ItinerarySegment, NormalizedItinerary, RankedProviderLink } from "../shared/types";
import {
  type EarningsEstimate,
  estimateEarnings,
  estimateSegmentEarnings,
  inspectWhereToCreditSegments,
} from "../shared/wheretocredit";

type PanelState = {
  settings: ExtensionSettings | null;
  itinerary: NormalizedItinerary | null;
  links: RankedProviderLink[];
  status: string;
  error: string;
  airportPreview: string[];
  autoCaptureAttempted: boolean;
  captureInFlight: boolean;
  activeCaptureId: string;
  locationKey: string;
  showAllMileagePrograms: boolean;
};

type ResultMileageSummary = {
  entries: ResultMileageEntry[];
  title: string;
  status: "ready" | "fallback" | "missing";
};

type ResultMileageEntry = {
  value: string;
  program: string;
  calculation?: string;
  preferred?: boolean;
};

type MileageFormula = {
  direction: string;
  segment: string;
  formula: string;
};

const PANEL_ID = "mu-travel-flights-panel";
const BRIDGE_ID = "mu-travel-flights-page-bridge";
const MESSAGE_SOURCE = "mu-travel-flights";
const AUTO_CAPTURE_DEBOUNCE_MS = 150;
let autoCaptureCheckTimer: number | undefined;
let flightResultAnnotationTimer: number | undefined;

const state: PanelState = {
  settings: null,
  itinerary: null,
  links: [],
  status: "Ready",
  error: "",
  airportPreview: [],
  autoCaptureAttempted: false,
  captureInFlight: false,
  activeCaptureId: "",
  locationKey: currentLocationKey(),
  showAllMileagePrograms: false,
};

const AIRPORT_REGION_OPTIONS = uniqueAirportRegions();
const AIRPORT_COUNTRY_OPTIONS = uniqueAirportCountries();
const AIRPORT_CONTINENT_OPTIONS = uniqueAirportValues("continent");

void init();

async function init(): Promise<void> {
  injectPageBridge();
  installChipClearShortcut();
  window.addEventListener("message", onBridgeMessage);
  state.settings = await loadSettings();
  state.airportPreview = airportCodes(state.settings.airportHelper).slice(0, 120);
  render();
  installAutoCaptureObserver();
  installFlightResultObserver();
  maybeAutoCapture();
  annotateFlightResultsSoon();
}

function render(): void {
  const shadow = getShadowRoot();
  if (!shadow) return;
  const settings = state.settings;
  if (!settings) return;

  shadow.innerHTML = `
    <style>${styles()}</style>
    <section class="panel" aria-label="Mu Travel Flights">
      <header>
        <div>
          <strong>Mu Travel</strong>
          <span>ITA Matrix companion</span>
        </div>
      </header>

      ${state.error ? `<p class="message error">${escapeHtml(state.error)}</p>` : `<p class="message">${escapeHtml(state.status)}</p>`}

      ${isItineraryPage() ? renderItineraryPanel() : ""}
      ${isItineraryPage() ? renderLinksPanel() : ""}
      ${isSearchPage() ? renderAirportHelper(settings) : ""}

      <footer>
        <button type="button" class="link-button" data-action="options">Options</button>
      </footer>
    </section>
  `;

  bind(shadow);
}

function renderItineraryPanel(): string {
  return `
    <details ${state.itinerary ? "open" : ""}>
      <summary>Itinerary</summary>
      ${
        state.itinerary
          ? `<p class="summary">${escapeHtml(summarizeItinerary(state.itinerary))}</p>
             <p class="muted">${escapeHtml(state.itinerary.tripType)} · ${state.itinerary.passengerCount || 1} passenger(s) · ${escapeHtml(state.itinerary.currency || "")} ${state.itinerary.totalPrice ?? ""}</p>
             ${renderMileageCredit(state.itinerary)}`
          : `<p class="muted">Open an ITA result. The extension will auto-load ITA JSON when Share & Export is visible.</p>`
      }
      <details class="advanced" ${state.error ? "open" : ""}>
        <summary>Advanced fallback</summary>
        <textarea placeholder="Paste ITA Matrix Copy as JSON output here" data-role="json-input"></textarea>
        <div class="actions">
          <button type="button" class="secondary" data-action="capture">Retry capture</button>
          <button type="button" class="secondary" data-action="parse-paste">Parse pasted JSON</button>
        </div>
      </details>
    </details>
  `;
}

function renderLinksPanel(): string {
  return `
    <details ${state.itinerary ? "open" : ""}>
      <summary>Links</summary>
      <div class="links">${renderLinks(state.links)}</div>
    </details>
  `;
}

function bind(root: ShadowRoot): void {
  root.querySelector('[data-action="capture"]')?.addEventListener("click", () => {
    void captureItinerary(false);
  });
  root.querySelector('[data-action="parse-paste"]')?.addEventListener("click", () => {
    const input = root.querySelector<HTMLTextAreaElement>('[data-role="json-input"]');
    if (input?.value) void parseAndSetItinerary(input.value);
  });
  root.querySelector('[data-action="insert-airports"]')?.addEventListener("click", () => {
    const ok = insertAirportCodes(state.airportPreview);
    if (ok) {
      setStatus("Inserted airport codes into the active field.");
      return;
    }
    void copyAirportPreview("Copied airport codes; no active ITA input was found.");
  });
  root.querySelector('[data-action="copy-airports"]')?.addEventListener("click", () => {
    void copyAirportPreview("Copied airport codes.");
  });
  root.querySelector('[data-action="options"]')?.addEventListener("click", () => {
    void chrome.runtime.sendMessage({ command: "openOptionsPage" });
  });
  root.querySelector('[data-action="show-all-mileage"]')?.addEventListener("click", () => {
    state.showAllMileagePrograms = true;
    render();
  });

  root.querySelectorAll<HTMLSelectElement>("select[data-setting]").forEach((select) => {
    select.addEventListener("change", () => {
      void updateAirportSetting(select.dataset.setting || "", select.value);
    });
  });
  root.querySelectorAll<HTMLInputElement>('input[data-setting="country"]').forEach((input) => {
    input.addEventListener("change", () => {
      void updateAirportSetting("country", input.value);
    });
    input.addEventListener("input", () => {
      if (!input.value.trim()) void updateAirportSetting("country", "");
    });
  });
  root.querySelector<HTMLInputElement>('input[data-setting="exclusions"]')?.addEventListener("change", (event) => {
    const target = event.currentTarget as HTMLInputElement;
    void updateAirportSetting("exclusions", target.value);
  });
}

async function captureItinerary(isAutomatic: boolean): Promise<void> {
  if (state.captureInFlight) return;
  const captureId = crypto.randomUUID();
  state.captureInFlight = true;
  state.activeCaptureId = captureId;
  state.error = "";
  const captureLocationKey = state.locationKey;
  setStatus(isAutomatic ? "Loading ITA itinerary..." : "Looking for ITA Matrix Copy as JSON...");

  try {
    const text = await captureViaPageBridge();
    if (captureLocationKey !== state.locationKey) return;
    await parseAndSetItinerary(text, captureLocationKey);
  } catch (error) {
    if (!isActiveCapture(captureId, captureLocationKey)) return;
    if (isAutomatic) {
      state.status = "Auto-load did not find ITA JSON yet.";
      render();
      return;
    }
    setError(`Capture failed. Paste JSON manually. ${error instanceof Error ? error.message : ""}`.trim());
  } finally {
    if (isActiveCapture(captureId, captureLocationKey)) {
      state.captureInFlight = false;
      state.activeCaptureId = "";
    }
  }
}

function isActiveCapture(captureId: string, locationKey: string): boolean {
  return state.activeCaptureId === captureId && state.locationKey === locationKey;
}

async function parseAndSetItinerary(text: string, expectedLocationKey = state.locationKey): Promise<void> {
  try {
    const itinerary = parseItineraryJson(text);
    const settings = state.settings || (await loadSettings());
    if (expectedLocationKey !== state.locationKey) return;
    state.settings = settings;
    const remoteMetadata = await fetchRemoteProviderMetadata(settings);
    if (expectedLocationKey !== state.locationKey) return;
    state.itinerary = itinerary;
    state.links = applyPageLinkOverrides(rankProviderLinks(itinerary, settings, remoteMetadata));
    state.error = "";
    setStatus("Itinerary captured.");
  } catch (error) {
    if (expectedLocationKey !== state.locationKey) return;
    state.itinerary = null;
    state.links = [];
    setError(`Could not parse ITA JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function applyPageLinkOverrides(links: RankedProviderLink[]): RankedProviderLink[] {
  const googleFlightsHref = findGoogleFlightsHref();
  if (!googleFlightsHref) return links;

  return links.map((link) =>
    link.provider.id === "google-flights"
      ? {
          ...link,
          url: googleFlightsHref,
        }
      : link,
  );
}

function findGoogleFlightsHref(): string {
  const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
  const anchor = anchors.find((candidate) => {
    if (!isAllowedGoogleFlightsUrl(candidate.href)) return false;
    return (
      candidate.href.includes("source=ita_matrix") || /open\s+in\s+google\s+flights/i.test(candidate.textContent || "")
    );
  });
  return anchor?.href || "";
}

function isAllowedGoogleFlightsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "www.google.com" || url.hostname === "google.com") &&
      (url.pathname === "/travel/flights" || url.pathname.startsWith("/travel/flights/"))
    );
  } catch {
    return false;
  }
}

async function updateAirportSetting(key: string, value: string): Promise<void> {
  if (!state.settings) return;
  const countryCode = key === "country" ? countryCodeFromSearchValue(value) : "";
  const next: ExtensionSettings = {
    ...state.settings,
    airportHelper: {
      ...state.settings.airportHelper,
      ...(key === "continent" ? { continent: value } : {}),
      ...(key === "region" ? { region: value } : {}),
      ...(key === "country" ? { countries: countryCode ? [countryCode] : [] } : {}),
      ...(key === "exclusions" ? { exclusions: parseAirportCodes(value) } : {}),
    },
  };
  state.settings = next;
  state.airportPreview = airportCodes(next.airportHelper).slice(0, 120);
  await saveSettings(next);
  render();
}

function insertAirportCodes(codes: string[]): boolean {
  if (codes.length === 0) return false;
  const active = document.activeElement;
  const input =
    active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
      ? active
      : document.querySelector<HTMLInputElement>(
          ".mat-mdc-chip-input, input[aria-label*='airport' i], input[placeholder*='airport' i]",
        );

  if (!input) return false;
  input.focus();
  input.value = codes.join(", ");
  input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: input.value }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function injectPageBridge(): void {
  if (document.getElementById(BRIDGE_ID)) return;
  const script = document.createElement("script");
  script.id = BRIDGE_ID;
  script.src = chrome.runtime.getURL("content/itaMatrixPageBridge.js");
  script.async = false;
  (document.head || document.documentElement).appendChild(script);
}

function captureViaPageBridge(): Promise<string> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error("Timed out waiting for ITA JSON."));
    }, 3500);

    const handler = (event: MessageEvent) => {
      if (event.source !== window || event.data?.source !== MESSAGE_SOURCE) return;
      if (event.data.type !== "capture-ita-json-result" || event.data.requestId !== requestId) return;
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handler);
      if (event.data.ok && typeof event.data.data === "string") {
        resolve(event.data.data);
      } else {
        reject(new Error(event.data.error || "ITA JSON capture failed."));
      }
    };

    window.addEventListener("message", handler);
    window.postMessage(
      {
        source: MESSAGE_SOURCE,
        type: "capture-ita-json",
        requestId,
      },
      window.location.origin,
    );
  });
}

function onBridgeMessage(event: MessageEvent): void {
  if (event.source !== window || event.data?.source !== MESSAGE_SOURCE) return;
  if (event.data.type === "capture-ita-json-result" && !event.data.ok && state.captureInFlight) {
    state.status = event.data.error || state.status;
  }
  if (event.data.type === "alkali-booking-details") {
    annotateBookingDetailsResult(event.data.data);
  }
}

function installAutoCaptureObserver(): void {
  const observer = new MutationObserver(() => {
    if (isItineraryPage()) {
      scheduleAutoCaptureCheck();
    } else {
      resetForLocationChange();
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", scheduleAutoCaptureCheck);
  window.addEventListener("hashchange", scheduleAutoCaptureCheck);
}

function installFlightResultObserver(): void {
  const observer = new MutationObserver(() => {
    if (isFlightsPage()) annotateFlightResultsSoon();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", annotateFlightResultsSoon);
  window.addEventListener("hashchange", annotateFlightResultsSoon);
}

function scheduleAutoCaptureCheck(): void {
  if (autoCaptureCheckTimer) window.clearTimeout(autoCaptureCheckTimer);
  autoCaptureCheckTimer = window.setTimeout(() => {
    autoCaptureCheckTimer = undefined;
    resetForLocationChange();
    maybeAutoCapture(false);
  }, AUTO_CAPTURE_DEBOUNCE_MS);
}

function annotateFlightResultsSoon(): void {
  if (flightResultAnnotationTimer) window.clearTimeout(flightResultAnnotationTimer);
  flightResultAnnotationTimer = window.setTimeout(() => {
    flightResultAnnotationTimer = undefined;
    annotateFlightResults();
  }, 150);
}

function annotateFlightResults(): void {
  if (!isFlightsPage()) return;
  installFlightResultStyles();
  installResultTableColumns();

  for (const grid of document.querySelectorAll<HTMLElement>("matrix-itinerary-grid")) {
    const items = Array.from(grid.querySelectorAll<HTMLElement>("mat-list-item"));
    const parsedItems = items.map((item) => ({ item, segment: parseResultSegment(item) }));
    const segments = parsedItems
      .map((entry) => entry.segment)
      .filter((segment): segment is ItinerarySegment => Boolean(segment));
    if (segments.length === 0) continue;

    const itinerary = resultSegmentsToItinerary(segments);
    let segmentIndex = 0;
    parsedItems.forEach(({ item, segment }) => {
      if (!segment) return;
      const index = segmentIndex;
      segmentIndex++;
      if (item.querySelector(".mu-mileage-earnings")) return;
      const estimate = estimateSegmentEarnings(segment, itinerary, segments, index);
      const target = item.querySelector<HTMLElement>(".info-grid");
      if (!target) return;
      target.appendChild(renderResultMileageLine(segment, estimate));
    });

    const resultRow = resultRowForGrid(grid);
    if (resultRow) updateResultRowMileage(resultRow, resultMileageSummary(itinerary));
  }
}

function installResultTableColumns(): void {
  for (const table of document.querySelectorAll<HTMLElement>("table")) {
    const headerRows = Array.from(
      table.querySelectorAll<HTMLTableRowElement>("tr[mat-header-row], tr.mat-mdc-header-row"),
    );
    for (const row of headerRows) {
      if (row.querySelector(".mu-mileage-column")) continue;
      const header = document.createElement("th");
      header.className = "mat-mdc-header-cell mdc-data-table__header-cell mu-mileage-column";
      header.setAttribute("role", "columnheader");
      header.textContent = "Miles Earning";
      row.appendChild(header);
    }

    const resultRows = Array.from(
      table.querySelectorAll<HTMLTableRowElement>("tr[mat-row].mat-mdc-row:not(.detail-row)"),
    );
    for (const row of resultRows) {
      if (!row.querySelector(".mu-mileage-column")) {
        const cell = document.createElement("td");
        cell.className = "mat-mdc-cell mdc-data-table__cell mu-mileage-column";
        cell.setAttribute("role", "cell");
        cell.innerHTML = `<span class="mu-mileage-placeholder">Expand fare</span>`;
        row.appendChild(cell);
      }
    }

    const detailCells = Array.from(table.querySelectorAll<HTMLTableCellElement>("tr.detail-row > td[colspan]"));
    for (const cell of detailCells) {
      if (cell.dataset.muTravelColspanAdjusted === "true") continue;
      const colspan = Number(cell.getAttribute("colspan") || 0);
      if (Number.isFinite(colspan) && colspan > 0) cell.setAttribute("colspan", String(colspan + 1));
      cell.dataset.muTravelColspanAdjusted = "true";
    }
  }
}

function parseResultSegment(item: HTMLElement): ItinerarySegment | null {
  const routeText = normalize(item.querySelector(".info-line b")?.textContent || "");
  const routeMatch = routeText.match(/\(([A-Z0-9]{3})\)\s+to\s+.*\(([A-Z0-9]{3})\)/);
  const origin = routeMatch?.[1] || "";
  const destination = routeMatch?.[2] || "";
  const carrier = parseCarrierCode(item);
  const bookingClass =
    normalize(item.querySelector(".service-line")?.textContent || "").match(/\(([A-Z])\)/)?.[1] || "";
  if (!origin || !destination || !carrier || !bookingClass) return null;

  return {
    origin,
    destination,
    carrier,
    carrierName: parseCarrierName(item),
    bookingClass,
    cabin: "economy",
    duration: parseDurationMinutes(item.querySelector(".time-line")?.textContent || ""),
  };
}

function parseCarrierCode(item: HTMLElement): string {
  const logo = item.querySelector<HTMLImageElement>("img.carrier-img")?.src || "";
  return logo.match(/\/([A-Z0-9]{2,3})\.png(?:$|\?)/)?.[1] || "";
}

function parseCarrierName(item: HTMLElement): string | undefined {
  const lines = Array.from(item.querySelectorAll<HTMLElement>(".info-line"));
  const carrierLine = lines
    .map((line) => normalize(line.textContent || ""))
    .find((line) => /^[A-Za-z][A-Za-z .'-]+\s+\d+/.test(line));
  return carrierLine?.replace(/\s+\d+.*$/, "").trim() || undefined;
}

function parseDurationMinutes(value: string): number | undefined {
  const match = normalize(value).match(/\((?:(\d+)h)?\s*(?:(\d+)m)?\)/);
  if (!match) return undefined;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const total = hours * 60 + minutes;
  return total > 0 ? total : undefined;
}

function normalize(value: string | null): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function resultSegmentsToItinerary(segments: ItinerarySegment[]): NormalizedItinerary {
  return {
    source: "ita-matrix",
    capturedAt: new Date().toISOString(),
    tripType: "multi-city",
    carriers: Array.from(new Set(segments.map((segment) => segment.carrier))),
    fareBases: [],
    slices: [
      {
        origin: segments[0]?.origin || "",
        destination: segments.at(-1)?.destination || "",
        segments,
      },
    ],
  };
}

function annotateBookingDetailsResult(value: unknown): void {
  if (!isFlightsPage()) return;
  try {
    const itinerary = parseItaBookingDetails(value);
    const row = findResultRowForItinerary(itinerary);
    if (row) updateResultRowMileage(row, resultMileageSummary(itinerary));
  } catch {
    // Ignore non-bookingDetails responses; the visible DOM annotator remains the fallback.
  }
}

function findResultRowForItinerary(itinerary: NormalizedItinerary): HTMLTableRowElement | null {
  const flightNumbers = flattenSegments(itinerary)
    .map((segment) => segment.flightNumber)
    .filter((flightNumber): flightNumber is string => Boolean(flightNumber));
  if (flightNumbers.length === 0) return null;

  const expandedRows = Array.from(document.querySelectorAll<HTMLTableRowElement>("tr.detail-row")).filter((row) =>
    row.querySelector("matrix-itinerary-grid"),
  );
  if (expandedRows.length === 1) return resultRowForGrid(expandedRows[0]);

  for (const grid of document.querySelectorAll<HTMLElement>("matrix-itinerary-grid")) {
    const text = grid.textContent || "";
    if (!flightNumbers.every((flightNumber) => text.includes(flightNumber))) continue;
    return resultRowForGrid(grid);
  }
  return null;
}

function resultRowForGrid(grid: HTMLElement): HTMLTableRowElement | null {
  const detailRow = grid.closest<HTMLTableRowElement>("tr.detail-row");
  const previousRow = detailRow?.previousElementSibling;
  return previousRow instanceof HTMLTableRowElement ? previousRow : null;
}

function resultMileageSummary(itinerary: NormalizedItinerary): ResultMileageSummary {
  const preferredPrograms = state.settings?.preferredFrequentFlyerPrograms || [];
  const estimates = estimateEarnings(itinerary, preferredPrograms);
  const preferredProgramRanks = new Map(preferredPrograms.map((program, index) => [program, index]));
  const byProgram = new Map<string, { miles: number; formulas: MileageFormula[] }>();
  for (const estimate of estimates) {
    if (typeof estimate.estimatedMiles !== "number" || estimate.estimatedMiles < 0) continue;
    const program = estimate.program || "Best available program";
    const current = byProgram.get(program) || { miles: 0, formulas: [] };
    current.miles += estimate.estimatedMiles;
    current.formulas.push({
      direction: segmentDirectionLabel(itinerary, estimate.segment),
      segment: `${estimate.segment.origin}-${estimate.segment.destination}`,
      formula: estimate.formula,
    });
    byProgram.set(program, current);
  }

  const programs = Array.from(byProgram.entries())
    .map(([program, value]) => {
      const preferenceRank = mileageProgramPreferenceRank(program, preferredProgramRanks);
      return {
        program,
        miles: value.miles,
        formulas: value.formulas,
        preferenceRank,
        preferred: preferenceRank !== Number.POSITIVE_INFINITY,
      };
    })
    .sort((left, right) => {
      if (left.preferred !== right.preferred) return left.preferred ? -1 : 1;
      if (left.preferenceRank !== right.preferenceRank) return left.preferenceRank - right.preferenceRank;
      return right.miles - left.miles || left.program.localeCompare(right.program);
    });

  const hasPreferredPrograms = preferredProgramRanks.size > 0;
  const visiblePrograms = hasPreferredPrograms ? programs.filter((program) => program.preferred) : programs;

  if (programs.length > 0 && visiblePrograms.length === 0) {
    const best = programs[0];
    return {
      entries: [
        {
          value: "No preferred match",
          program: best ? `best local row: ${best.program}` : "local earning data",
        },
      ],
      title:
        "No preferred program matched the local top earning rows. The extension is hiding non-preferred programs to avoid orphan-mile suggestions.",
      status: "fallback",
    };
  }

  if (visiblePrograms.length > 0) {
    const visible = hasPreferredPrograms ? visiblePrograms : visiblePrograms.slice(0, 2);
    const remaining = hasPreferredPrograms ? 0 : visiblePrograms.length - visible.length;
    const entries: ResultMileageEntry[] = visible.map((program) => ({
      value: `~${program.miles.toLocaleString()}`,
      program: program.program,
      calculation: compactMileageCalculation(program.formulas),
      preferred: program.preferred,
    }));
    if (remaining > 0) {
      entries.push({
        value: `+${remaining}`,
        program: "more programs",
      });
    }
    return {
      entries,
      title: visiblePrograms
        .map(
          (program) =>
            `${program.program}: ~${program.miles.toLocaleString()} miles (${program.formulas
              .map(
                (formula) =>
                  `${formula.direction ? `${formula.direction} ` : ""}${formula.segment}: ${formula.formula}`,
              )
              .join("; ")})`,
        )
        .join("\n"),
      status: "ready",
    };
  }

  const flownMiles = flattenSegments(itinerary).reduce(
    (sum, segment) => sum + (airportDistanceMiles(segment.origin, segment.destination) || 0),
    0,
  );
  if (flownMiles > 0) {
    return {
      entries: [
        {
          value: `${Math.round(flownMiles).toLocaleString()}`,
          program: "flown miles",
        },
      ],
      title: "No earning data matched; showing approximate flown miles.",
      status: "fallback",
    };
  }

  return {
    entries: [
      {
        value: "No data",
        program: "expand fare",
      },
    ],
    title: "No mileage estimate available for this result.",
    status: "missing",
  };
}

function mileageProgramPreferenceRank(program: string, preferredProgramRanks: Map<string, number>): number {
  const exact = preferredProgramRanks.get(program);
  if (typeof exact === "number") return exact;
  for (const [preferredProgram, rank] of preferredProgramRanks.entries()) {
    if (program.startsWith(`${preferredProgram} `)) return rank;
  }
  return Number.POSITIVE_INFINITY;
}

function updateResultRowMileage(row: HTMLTableRowElement, summary: ResultMileageSummary): void {
  const cell = row.querySelector<HTMLElement>(".mu-mileage-column");
  if (!cell) return;
  cell.innerHTML = summary.entries
    .map(
      (entry) => `
        <span class="mu-mileage-program ${entry.preferred ? "preferred" : ""}">
          <strong>${escapeHtml(entry.value)}</strong>
          <span>${escapeHtml(entry.program)}${entry.preferred ? `<em>Preferred</em>` : ""}</span>
          ${entry.calculation ? `<small>${escapeHtml(entry.calculation)}</small>` : ""}
        </span>
      `,
    )
    .join("");
  cell.title = summary.title;
  cell.dataset.status = summary.status;
}

function renderResultMileageLine(segment: ItinerarySegment, estimate: EarningsEstimate | null): HTMLElement {
  const line = document.createElement("div");
  line.className = "info-line mu-mileage-earnings";
  if (estimate) {
    const miles =
      typeof estimate.estimatedMiles === "number"
        ? `~${estimate.estimatedMiles.toLocaleString()} miles`
        : estimate.formula;
    line.textContent = `Miles credit: ${miles} · ${estimate.program}`;
    line.title = estimate.formula;
    return line;
  }

  const distance = airportDistanceMiles(segment.origin, segment.destination);
  const distanceText = distance ? `~${Math.round(distance).toLocaleString()} flown miles` : "No distance estimate";
  line.textContent = `Miles credit: ${distanceText} · no earning data for ${segment.carrier} ${segment.bookingClass}`;
  return line;
}

function installFlightResultStyles(): void {
  if (document.getElementById("mu-travel-flight-result-styles")) return;
  const style = document.createElement("style");
  style.id = "mu-travel-flight-result-styles";
  style.textContent = `
    .mu-mileage-column {
      min-width: 190px;
      max-width: 270px;
      white-space: normal;
      color: #ffffff;
      text-align: left;
      line-height: 1.25;
      vertical-align: middle;
      font-size: 14px;
    }
    .mu-mileage-column[data-status="fallback"] {
      color: #ffffff;
    }
    .mu-mileage-column[data-status="missing"] {
      color: rgba(255, 255, 255, 0.7);
    }
    .mu-mileage-placeholder {
      color: rgba(255, 255, 255, 0.72);
      font-weight: 500;
    }
    .mu-mileage-program {
      display: grid;
      gap: 1px;
    }
    .mu-mileage-program + .mu-mileage-program {
      margin-top: 5px;
    }
    .mu-mileage-program strong {
      color: #ffffff;
      font-size: 15px;
      font-weight: 700;
    }
    .mu-mileage-program span {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      align-items: center;
      color: #ffffff;
      font-size: 13px;
      font-weight: 600;
    }
    .mu-mileage-program small {
      color: rgba(255, 255, 255, 0.74);
      font-size: 12px;
      font-weight: 500;
    }
    .mu-mileage-program em {
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.18);
      color: #ffffff;
      padding: 1px 5px;
      font-size: 10px;
      font-style: normal;
      font-weight: 700;
    }
    .mu-mileage-earnings {
      color: #0f766e;
      font-weight: 600;
    }
  `;
  document.head.appendChild(style);
}

function compactMileageCalculation(formulas: MileageFormula[]): string {
  const byDirection = new Map<string, MileageFormula[]>();
  for (const formula of formulas) {
    const direction = formula.direction || "matched";
    byDirection.set(direction, [...(byDirection.get(direction) || []), formula]);
  }
  return Array.from(byDirection.entries())
    .map(([direction, values]) => {
      const parts = values.map((value) => `${value.segment} ${value.formula.replace(/\bmiles x\b/g, "x")}`);
      return `${direction}: ${parts.join(" + ")}`;
    })
    .join("; ");
}

function segmentDirectionLabel(itinerary: NormalizedItinerary, segment: ItinerarySegment): string {
  if (itinerary.slices.length <= 1) return itinerary.tripType === "one-way" ? "one-way" : "";
  const sliceIndex = itinerary.slices.findIndex((slice) => slice.segments.includes(segment));
  if (sliceIndex < 0) return "";
  const slice = itinerary.slices[sliceIndex];
  const route = slice ? `${slice.origin}-${slice.destination}` : "";
  if (itinerary.tripType === "round-trip" && itinerary.slices.length === 2) {
    return sliceIndex === 0 ? `outbound ${route}` : `return ${route}`;
  }
  if (itinerary.tripType === "multi-city") return `leg ${sliceIndex + 1}${route ? ` ${route}` : ""}`;
  return `slice ${sliceIndex + 1}${route ? ` ${route}` : ""}`;
}

function maybeAutoCapture(shouldResetLocation = true): void {
  if (shouldResetLocation) resetForLocationChange();
  if (state.itinerary || state.captureInFlight || state.autoCaptureAttempted) return;
  if (!isItineraryPage()) return;
  if (!hasCopyJsonButton()) return;
  state.autoCaptureAttempted = true;
  void captureItinerary(true);
}

function resetForLocationChange(): void {
  const nextLocationKey = currentLocationKey();
  if (nextLocationKey === state.locationKey) return;
  state.locationKey = nextLocationKey;
  state.itinerary = null;
  state.links = [];
  state.error = "";
  state.status = "Ready";
  state.showAllMileagePrograms = false;
  state.autoCaptureAttempted = false;
  state.captureInFlight = false;
  state.activeCaptureId = "";
  render();
}

function currentLocationKey(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function hasCopyJsonButton(): boolean {
  return Array.from(document.querySelectorAll("button, [role='button']")).some((candidate) =>
    /copy\s+itinerary\s+as\s+json/i.test(candidate.textContent || ""),
  );
}

function isItineraryPage(): boolean {
  return window.location.pathname.startsWith("/itinerary");
}

function isSearchPage(): boolean {
  return window.location.pathname.startsWith("/search");
}

function isFlightsPage(): boolean {
  return window.location.pathname.startsWith("/flights");
}

function renderAirportHelper(settings: ExtensionSettings): string {
  const countryDatalistId = "mu-travel-country-options";
  return `
    <details>
      <summary>Airport helper</summary>
      <div class="grid">
        ${selectHtml(
          "region",
          "Region",
          ["", ...AIRPORT_REGION_OPTIONS.map((region) => region.id)],
          settings.airportHelper.region,
          new Map(AIRPORT_REGION_OPTIONS.map((region) => [region.id, region.label])),
        )}
        ${selectHtml("continent", "Continent", ["", ...AIRPORT_CONTINENT_OPTIONS], settings.airportHelper.continent)}
        <label>
          Country
          <input type="search" data-setting="country" list="${countryDatalistId}" value="${escapeHtml(countrySearchValue(settings.airportHelper.countries[0] || ""))}" placeholder="Search country">
          <datalist id="${countryDatalistId}">
            ${AIRPORT_COUNTRY_OPTIONS.map((country) => `<option value="${escapeHtml(country.searchValue)}"></option>`).join("")}
          </datalist>
        </label>
      </div>
      <label>
        Exclude codes
        <input type="text" data-setting="exclusions" value="${escapeHtml(settings.airportHelper.exclusions.join(", "))}" placeholder="JFK, LGA">
      </label>
      <div class="airport-output">${escapeHtml(state.airportPreview.join(", "))}</div>
      <div class="actions">
        <button type="button" data-action="insert-airports">Insert into active field</button>
        <button type="button" class="secondary" data-action="copy-airports">Copy codes</button>
      </div>
    </details>
  `;
}

function installChipClearShortcut(): void {
  document.addEventListener("keydown", (event) => {
    if (event.key !== "F8") return;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.classList.contains("mat-mdc-chip-input")) return;
    const chipGrid = active.closest("mat-chip-grid");
    const icons = Array.from(chipGrid?.querySelectorAll<HTMLElement>("mat-icon[matchipremove]") || []);
    for (const icon of icons) icon.click();
  });
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

function renderLinks(links: RankedProviderLink[]): string {
  if (!state.itinerary) return `<p class="muted">Capture an itinerary to rank links.</p>`;
  return links
    .map((link) => {
      const confidence = providerConfidenceCopy(link);
      const issue = link.provider.knownIssues ? `<small>${escapeHtml(link.provider.knownIssues)}</small>` : "";
      return `
        <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" class="provider ${link.confidence}">
          <span>${escapeHtml(link.provider.label)}</span>
          <em class="confidence"><i aria-hidden="true"></i>${escapeHtml(confidence.label)}</em>
          ${issue}
        </a>
      `;
    })
    .join("");
}

function providerConfidenceCopy(link: RankedProviderLink): { label: string } {
  if (link.confidence === "high") {
    return {
      label: "Reliable",
    };
  }
  if (link.confidence === "medium") {
    return {
      label: "Check details",
    };
  }
  return {
    label: "Unreliable",
  };
}

function renderMileageCredit(itinerary: NormalizedItinerary): string {
  const preferredProgramList = state.settings?.preferredFrequentFlyerPrograms || [];
  const estimates = estimateEarnings(itinerary, preferredProgramList);
  const preferredPrograms = new Set(preferredProgramList);
  const visibleEstimates =
    preferredPrograms.size > 0 && !state.showAllMileagePrograms
      ? estimates.filter((estimate) => matchesPreferredMileageProgram(estimate.program, preferredPrograms))
      : estimates;
  const hiddenEstimateCount = estimates.length - visibleEstimates.length;
  const insights = inspectWhereToCreditSegments(itinerary);
  const estimatedKeys = new Set(estimates.map((estimate) => creditSegmentKey(estimate.segment, estimate.bookingClass)));
  const notices = insights.filter(
    (insight) => insight.status !== "earning-data" && !estimatedKeys.has(creditSegmentKey(insight.segment)),
  );
  if (insights.length === 0 && estimates.length === 0) return "";
  return `
    <div class="segment-links">
      <strong>Miles credit</strong>
      ${
        visibleEstimates.length
          ? visibleEstimates
              .map(
                (estimate) => `
                  <a href="${escapeHtml(estimate.url)}" target="_blank" rel="noopener noreferrer" class="earning">
                    <span>${escapeHtml(`${estimate.segment.origin}-${estimate.segment.destination} ${estimate.segment.fareCarrier || estimate.segment.carrier} ${estimate.bookingClass}`)}</span>
                    <em>${escapeHtml(estimate.program)}</em>
                    <small>${typeof estimate.estimatedMiles === "number" ? `${estimate.estimatedMiles.toLocaleString()} miles · ` : ""}${escapeHtml(estimate.formula)}</small>
                  </a>
                `,
              )
              .join("")
          : ""
      }
      ${
        hiddenEstimateCount > 0 && visibleEstimates.length === 0
          ? `<div class="earning notice">
              <span>No preferred program match</span>
              <small>Local top earning rows exist, but they are not in your preferred programs.</small>
              <button type="button" class="inline-button" data-action="show-all-mileage">Show all</button>
            </div>`
          : ""
      }
      ${notices
        .map(
          (insight) => `
            <div class="earning notice">
              <span>${escapeHtml(insight.label)}</span>
              ${insight.url ? `<a href="${escapeHtml(insight.url)}" target="_blank" rel="noopener noreferrer">Open airline page</a>` : ""}
              <small>${escapeHtml(insight.message)}</small>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function matchesPreferredMileageProgram(program: string, preferredPrograms: Set<string>): boolean {
  if (preferredPrograms.has(program)) return true;
  for (const preferredProgram of preferredPrograms) {
    if (program.startsWith(`${preferredProgram} `)) return true;
  }
  return false;
}

function creditSegmentKey(
  segment: { origin: string; destination: string; carrier: string; fareCarrier?: string; bookingClass?: string },
  bookingClass = segment.bookingClass,
): string {
  return [segment.origin, segment.destination, segment.fareCarrier || segment.carrier, bookingClass || ""]
    .map((part) =>
      String(part || "")
        .trim()
        .toUpperCase(),
    )
    .join(":");
}

function selectHtml(
  name: string,
  label: string,
  values: string[],
  selected: string,
  labels = new Map<string, string>(),
): string {
  return `
    <label>
      ${escapeHtml(label)}
      <select data-setting="${escapeHtml(name)}">
        ${values.map((value) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(labels.get(value) || value || "Any")}</option>`).join("")}
      </select>
    </label>
  `;
}

function setStatus(message: string): void {
  state.status = message;
  state.error = "";
  render();
}

function setError(message: string): void {
  state.error = message;
  render();
}

async function copyAirportPreview(successMessage: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(state.airportPreview.join(", "));
    setStatus(successMessage);
  } catch (error) {
    setError(`Could not copy airport codes: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char,
  );
}

function styles(): string {
  return `
    :host { all: initial; color-scheme: light; }
    .panel {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 2147483647;
      width: 360px;
      max-height: min(720px, calc(100vh - 32px));
      overflow: auto;
      box-sizing: border-box;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #ffffff;
      color: #162033;
      box-shadow: 0 10px 40px rgba(15, 23, 42, 0.24);
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    header, footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px; border-bottom: 1px solid #e2e8f0; }
    footer { border-top: 1px solid #e2e8f0; border-bottom: 0; }
    strong { display: block; font-size: 15px; }
    header span, .muted, small { color: #64748b; }
    button, select, input, textarea { font: inherit; }
    button { border: 1px solid #0f766e; background: #0f766e; color: white; border-radius: 6px; padding: 6px 9px; cursor: pointer; }
    button.secondary, .link-button { background: white; color: #0f766e; }
    .link-button { border-color: transparent; text-decoration: underline; }
    details { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
    summary { cursor: pointer; font-weight: 650; }
    details.advanced { margin-top: 8px; padding: 8px 0 0; border: 0; }
    details.advanced summary { color: #64748b; font-size: 12px; font-weight: 600; }
    label { display: grid; gap: 4px; margin-top: 8px; color: #334155; }
    input, select, textarea { box-sizing: border-box; width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px; color: #162033; background: white; }
    textarea { min-height: 74px; resize: vertical; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .grid label:last-child { grid-column: 1 / -1; }
    .message { margin: 0; padding: 8px 12px; background: #ecfeff; color: #155e75; }
    .message.error { background: #fef2f2; color: #991b1b; }
    .summary { margin-bottom: 2px; }
    .links { display: grid; gap: 8px; margin-top: 10px; }
    .segment-links { display: grid; gap: 6px; margin-top: 10px; padding: 8px; border-radius: 6px; background: #f0fdfa; }
    .segment-links .earning { display: grid; gap: 2px; }
    .segment-links .notice { padding: 6px; border-radius: 6px; background: #fff7ed; color: #7c2d12; }
    .segment-links em { font-style: normal; color: #115e59; }
    .segment-links a { color: #0f766e; text-decoration: none; }
    .segment-links a:hover { text-decoration: underline; }
    .segment-links .inline-button { width: fit-content; margin-top: 4px; border-color: #fed7aa; background: #ffffff; color: #9a3412; padding: 4px 7px; }
    .provider { display: grid; gap: 2px; padding: 8px; border: 1px solid #cbd5e1; border-left-width: 4px; border-radius: 6px; color: inherit; text-decoration: none; }
    .provider.high { border-left-color: #059669; }
    .provider.medium { border-left-color: #d97706; }
    .provider.low { border-left-color: #dc2626; }
    .provider span { font-weight: 650; }
    .provider em { font-style: normal; color: #475569; }
    .provider .confidence { display: inline-flex; align-items: center; gap: 5px; font-weight: 650; }
    .provider .confidence i { width: 8px; height: 8px; border-radius: 999px; background: #64748b; }
    .provider.high .confidence { color: #047857; }
    .provider.high .confidence i { background: #059669; }
    .provider.medium .confidence { color: #b45309; }
    .provider.medium .confidence i { background: #d97706; }
    .provider.low .confidence { color: #b91c1c; }
    .provider.low .confidence i { background: #dc2626; }
    .airport-output { min-height: 42px; max-height: 88px; overflow: auto; margin: 10px 0; padding: 8px; border-radius: 6px; background: #f8fafc; color: #334155; word-break: break-word; }
    .actions { display: flex; gap: 8px; }
    .inline { display: flex; grid-template-columns: none; align-items: center; gap: 6px; margin: 0; }
    .inline input { width: auto; }
  `;
}
