import { airportDistanceMiles } from "../shared/airportCoordinates";
import {
  type AirportAreaOption,
  airportAreaFromSearchValue,
  airportAreaOptions,
  airportAreaSearchValue,
  airportCodes,
} from "../shared/airports";
import { fetchRemoteProviderMetadata } from "../shared/backendClient";
import { runtimeUrl, safeChromeCall, sendRuntimeMessage } from "../shared/chromeRuntime";
import { createContentTranslator } from "../shared/contentI18n";
import { loadUsdCurrencyRates, type UsdCurrencyRates } from "../shared/currencyRates";
import { flagEmoji } from "../shared/flags";
import { flattenSegments, parseItaBookingDetails, parseItineraryJson } from "../shared/itinerary";
import {
  type EarningsEstimate,
  estimateEarnings,
  estimateSegmentEarnings,
  inspectWhereToCreditSegments,
  localizedMileageProgramDisplay,
  mileageProgramTierOptions,
  uniqueMileagePrograms,
} from "../shared/mileageEarnings";
import { ALWAYS_SHOWN_PROVIDER_IDS, rankProviderLinks, summarizeItinerary } from "../shared/providers";
import { DEFAULT_SETTINGS, loadSettings, mergeSettings, SETTINGS_KEY, saveSettings } from "../shared/storage";
import type { ExtensionSettings, ItinerarySegment, NormalizedItinerary, RankedProviderLink } from "../shared/types";
import {
  mooFlightsPanelHeaderStyles,
  renderMooFlightsMinimizedButton,
  renderMooFlightsPanelHeader,
} from "./panelChrome";

type PanelEdge = "top" | "right" | "bottom" | "left";

type PanelPosition = {
  edge: PanelEdge;
  ratio: number;
};

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
  bookingDetailsSignature: string;
  locationKey: string;
  showAllMileagePrograms: boolean;
  mileageSortMode: MileageSortMode;
  groupPreferredMileage: boolean;
  panelMinimized: boolean;
  panelPosition: PanelPosition;
  panelCollapsePosition: PanelPosition | null;
  currencyRates: UsdCurrencyRates | null;
  airportAreaSearch: string;
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

type MileageSortMode = "miles" | "name";

const PANEL_ID = "mooflights-panel";
const BRIDGE_ID = "mooflights-page-bridge";
const MESSAGE_SOURCE = "mooflights";
const AUTO_CAPTURE_DEBOUNCE_MS = 150;
const AUTO_SEARCH_DEBOUNCE_MS = 250;
const AUTO_SEARCH_TIMEOUT_MS = 15_000;
const AUTO_OPEN_DEBOUNCE_MS = 300;
const AUTO_OPEN_TIMEOUT_MS = 15_000;
const AUTO_OPEN_REMEMBER_MS = 5 * 60 * 1000;
const TAB_AUTO_OPEN_CHECK_DEBOUNCE_MS = 250;
const TAB_AUTO_OPEN_CHECK_TIMEOUT_MS = 10_000;
const AUTO_OPEN_FLAG = "mooFlightsAutoOpen";
const AUTO_SEARCH_FLAG = "mooFlightsAutoSearch";
const LEGACY_AUTO_OPEN_FLAG = "muTravelAutoOpen";
const LEGACY_AUTO_SEARCH_FLAG = "muTravelAutoSearch";
const AUTO_OPEN_STORAGE_KEY = "muTravelMatrixAutoOpen";
const PANEL_SESSION_HIDE_STORAGE_KEY = "muTravelMatrixPanelHiddenForSession";
const FLIGHT_RESULT_ROW_SELECTOR = "tr[mat-row].mat-mdc-row:not(.detail-row), tr[mat-row]:not(.detail-row)";
const PANEL_UI_STORAGE_KEY = "muTravelPanelUi";
const DEFAULT_PANEL_POSITION: PanelPosition = { edge: "right", ratio: 1 };
const PANEL_EDGE_OFFSET_PX = 16;
const PANEL_CORNER_SNAP_PX = 96;
const PANEL_MINIMIZED_ICON_SIZE_PX = 64;
let mileageProgramsByLengthCache: string[] | undefined;
let autoCaptureCheckTimer: number | undefined;
let flightResultAnnotationTimer: number | undefined;
let autoSearchTimer: number | undefined;
let autoOpenTimer: number | undefined;
let tabAutoOpenCheckTimer: number | undefined;
let locationClearButtonInstallFrame: number | undefined;
let autoSearchStartedAt = 0;
let autoSearchDone = false;
let autoSearchLocationKey = "";
let autoOpenStartedAt = 0;
let autoOpenDone = false;
let autoOpenLocationKey = "";
let autoOpenClickedPrimaryResult = false;
let autoOpenPrimaryResultRow: HTMLElement | null = null;
let tabScopedAutoOpenUntil = 0;
let tabScopedAutoOpenCheckStartedAt = 0;
let tabScopedAutoOpenCheckLocationKey = "";
let suppressPanelRestoreClick = false;
const panelUi = loadPanelUiState();

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
  bookingDetailsSignature: "",
  locationKey: currentLocationKey(),
  showAllMileagePrograms: false,
  mileageSortMode: "miles",
  groupPreferredMileage: true,
  panelMinimized: panelUi.minimized,
  panelPosition: panelUi.position,
  panelCollapsePosition: panelUi.collapsePosition,
  currencyRates: null,
  airportAreaSearch: "",
};

void init();

async function init(): Promise<void> {
  injectPageBridge();
  installChipClearShortcut();
  window.addEventListener("message", onBridgeMessage);
  state.settings = await safeChromeCall(loadSettings, DEFAULT_SETTINGS);
  state.airportPreview = airportCodes(state.settings.airportHelper).slice(0, 120);
  installLocationClearButtons();
  chrome.storage?.onChanged?.addListener(onSettingsChanged);
  void loadUsdCurrencyRates().then((rates) => {
    state.currencyRates = rates;
    if (state.itinerary) render();
    annotateFlightResultsSoon();
  });
  render();
  installAutoCaptureObserver();
  installFlightResultObserver();
  installSearchAutoSubmitObserver();
  maybeAutoCapture();
  annotateFlightResultsSoon();
  scheduleAutoSubmitMatrixSearch();
  scheduleTabScopedAutoOpenAuthorizationCheck();
  scheduleAutoOpenMatrixResult();
}

function onSettingsChanged(changes: Record<string, chrome.storage.StorageChange>, areaName: string): void {
  if (areaName !== "local" || !changes[SETTINGS_KEY]) return;
  state.settings = mergeSettings(changes[SETTINGS_KEY].newValue);
  state.airportPreview = airportCodes(state.settings.airportHelper).slice(0, 120);
  state.airportAreaSearch = "";
  installLocationClearButtons();
  render();
  annotateFlightResultsSoon();
}

function t(): ReturnType<typeof createContentTranslator> {
  return createContentTranslator(state.settings?.language || DEFAULT_SETTINGS.language);
}

function panelChromeLabels(): {
  panelActions: string;
  hideForSession: string;
  minimize: string;
  settings: string;
  expandPanel: string;
} {
  const translate = t();
  return {
    panelActions: translate("panelActions"),
    hideForSession: translate("hideForSession"),
    minimize: translate("minimize"),
    settings: translate("settings"),
    expandPanel: translate("expandPanel"),
  };
}

function render(): void {
  if (shouldHidePanel()) {
    removePanel();
    return;
  }

  const shadow = getShadowRoot();
  if (!shadow) return;
  const settings = state.settings;
  if (!settings) return;

  shadow.innerHTML = `
    <style>${styles()}</style>
      <section class="panel ${state.panelMinimized ? "minimized" : ""}" style="${panelPositionStyle(state.panelPosition)}" aria-label="MooFlights">
        ${
          state.panelMinimized
            ? renderMooFlightsMinimizedButton(panelChromeLabels())
            : renderMooFlightsPanelHeader({ optionsAction: "options", labels: panelChromeLabels() })
        }

      ${state.panelMinimized ? "" : renderStatusMessage()}

      ${!state.panelMinimized && isItineraryPage() ? renderItineraryPanel() : ""}
      ${!state.panelMinimized && isItineraryPage() ? renderLinksPanel() : ""}
      ${!state.panelMinimized && isSearchPage() ? renderAirportHelper(settings) : ""}

    </section>
  `;

  bind(shadow);
}

function renderStatusMessage(): string {
  if (state.error) return `<p class="message error">${escapeHtml(state.error)}</p>`;
  if (isSearchPage() && state.status === "Ready") return "";
  if (
    isItineraryPage() &&
    state.itinerary &&
    (state.status === "Itinerary captured." || state.status === t()("itineraryCaptured"))
  )
    return "";
  return `<p class="message">${escapeHtml(state.status)}</p>`;
}

function renderItineraryPanel(): string {
  const translate = t();
  return `
    <details ${state.itinerary ? "open" : ""}>
      <summary>${escapeHtml(translate("itinerary"))}</summary>
      ${
        state.itinerary
          ? `<p class="summary">${escapeHtml(summarizeItinerary(state.itinerary))}</p>
             <p class="muted">${escapeHtml(state.itinerary.tripType)} · ${escapeHtml(translate("passengerCount", { count: state.itinerary.passengerCount || 1 }))} · ${escapeHtml(state.itinerary.currency || "")} ${state.itinerary.totalPrice ?? ""}</p>
             ${renderMileageCredit(state.itinerary)}`
          : `<p class="muted">${escapeHtml(translate("openItaResult"))}</p>`
      }
      <details class="advanced" ${state.error ? "open" : ""}>
        <summary>${escapeHtml(translate("advancedFallback"))}</summary>
        <textarea placeholder="${escapeHtml(translate("pasteItaJson"))}" data-role="json-input"></textarea>
        <div class="actions">
          <button type="button" class="secondary" data-action="capture">${escapeHtml(translate("retryCapture"))}</button>
          <button type="button" class="secondary" data-action="parse-paste">${escapeHtml(translate("parsePastedJson"))}</button>
        </div>
      </details>
    </details>
  `;
}

function renderLinksPanel(): string {
  return `
    <details ${state.itinerary ? "open" : ""}>
      <summary>${escapeHtml(t()("links"))}</summary>
      <div class="links">${renderLinks(state.links)}</div>
    </details>
  `;
}

function bind(root: ShadowRoot): void {
  root.querySelector('[data-action="minimize-panel"]')?.addEventListener("click", () => {
    minimizePanel(root);
  });
  root.querySelector('[data-action="hide-panel-session"]')?.addEventListener("click", hidePanelForSession);
  root.querySelectorAll<HTMLElement>(".panel-menu .menu-item").forEach((item) => {
    item.addEventListener("click", closePanelMenu);
  });
  root.querySelector('[data-action="restore-panel"]')?.addEventListener("click", () => {
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
  root.querySelector<HTMLElement>('[data-action="restore-panel"]')?.addEventListener("pointerdown", onPanelDragStart);
  root.querySelector<HTMLElement>('[data-role="panel-header"]')?.addEventListener("pointerdown", onPanelDragStart);
  root.querySelector('[data-action="capture"]')?.addEventListener("click", () => {
    void captureItinerary(false);
  });
  root.querySelector('[data-action="parse-paste"]')?.addEventListener("click", () => {
    const input = root.querySelector<HTMLTextAreaElement>('[data-role="json-input"]');
    if (input?.value) void parseAndSetItinerary(input.value);
  });
  root.querySelector('[data-action="copy-airports"]')?.addEventListener("click", () => {
    void copyAirportPreview(t()("copiedAirportCodes"));
  });
  root.querySelector('[data-action="options"]')?.addEventListener("click", () => {
    sendRuntimeMessage({ command: "openOptionsPage" });
  });
  root.querySelector('[data-action="show-all-mileage"]')?.addEventListener("click", () => {
    state.showAllMileagePrograms = true;
    render();
  });
  root.querySelectorAll<HTMLButtonElement>('[data-action="mileage-sort"]').forEach((button) => {
    button.addEventListener("click", () => {
      state.mileageSortMode = button.dataset.sort === "name" ? "name" : "miles";
      render();
    });
  });
  root
    .querySelector<HTMLInputElement>('[data-action="toggle-preferred-mileage-group"]')
    ?.addEventListener("change", (event) => {
      state.groupPreferredMileage = event.currentTarget instanceof HTMLInputElement && event.currentTarget.checked;
      render();
    });

  root.querySelectorAll<HTMLInputElement>('input[data-setting="area"]').forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.value.trim()) return;
      void updateAirportSetting("area", input.value);
    });
    input.addEventListener("input", () => {
      state.airportAreaSearch = input.value;
      renderAirportAreaDropdown(root.querySelector<HTMLElement>('[data-role="airport-area-dropdown"]'));
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        state.airportAreaSearch = "";
        input.value = "";
        renderAirportAreaDropdown(root.querySelector<HTMLElement>('[data-role="airport-area-dropdown"]'));
        return;
      }
      if (event.key !== "Enter") return;
      event.preventDefault();
      const firstOption = airportAreaDropdownOptions()[0];
      void updateAirportSetting("area", firstOption?.searchValue || input.value);
    });
  });
  bindAirportAreaDropdown(root);
  root.querySelectorAll<HTMLButtonElement>('[data-action="remove-airport-code"]').forEach((button) => {
    button.addEventListener("click", () => {
      void removeAirportCode(button.dataset.code || "");
    });
  });
}

function closePanelMenu(event: Event): void {
  const item = event.currentTarget;
  if (!(item instanceof HTMLElement)) return;
  const menu = item.closest<HTMLDetailsElement>(".panel-menu");
  if (menu) menu.open = false;
}

function minimizePanel(root: ShadowRoot): void {
  const panel = root.querySelector<HTMLElement>(".panel");
  state.panelPosition =
    state.panelCollapsePosition || (panel ? minimizedPanelPositionFromPanel(panel) : state.panelPosition);
  state.panelCollapsePosition = null;
  state.panelMinimized = true;
  savePanelUiState();
  render();
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
  const distances: Array<{ edge: PanelEdge; distance: number }> = [
    { edge: "left", distance: clientX },
    { edge: "right", distance: width - clientX },
    { edge: "top", distance: clientY },
    { edge: "bottom", distance: height - clientY },
  ];
  distances.sort((a, b) => a.distance - b.distance);

  const edge = distances[0]?.edge || DEFAULT_PANEL_POSITION.edge;
  const axisLength = edge === "top" || edge === "bottom" ? width : height;
  const axisPoint = edge === "top" || edge === "bottom" ? clientX : clientY;
  let ratio = clamp(axisPoint / axisLength, 0, 1);

  if (axisPoint <= PANEL_CORNER_SNAP_PX) ratio = 0;
  if (axisLength - axisPoint <= PANEL_CORNER_SNAP_PX) ratio = 1;

  return { edge, ratio };
}

function minimizedPanelPositionFromPanel(panel: HTMLElement): PanelPosition {
  const rect = panel.getBoundingClientRect();
  const width = Math.max(window.innerWidth, 1);
  const height = Math.max(window.innerHeight, 1);
  const viewportCorners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
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
  const width = Math.max(window.innerWidth, 1);
  const height = Math.max(window.innerHeight, 1);
  const corners: Array<{ position: PanelPosition; x: number; y: number }> = [
    { position: { edge: "top", ratio: 0 }, x: 0, y: 0 },
    { position: { edge: "top", ratio: 1 }, x: width, y: 0 },
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
  if (position.edge === "top") return { x: width * position.ratio, y: 0 };
  if (position.edge === "bottom") return { x: width * position.ratio, y: height };
  return {
    x: position.edge === "left" ? 0 : width,
    y: height * position.ratio,
  };
}

function panelPositionStyle(position: PanelPosition): string {
  const percent = `${Math.round(position.ratio * 1000) / 10}%`;
  const offset = `${PANEL_EDGE_OFFSET_PX}px`;
  if (position.edge === "top" && position.ratio === 0) return `top: ${offset}; left: ${offset};`;
  if (position.edge === "top" && position.ratio === 1) return `top: ${offset}; right: ${offset};`;
  if (position.edge === "bottom" && position.ratio === 0) return `bottom: ${offset}; left: ${offset};`;
  if (position.edge === "bottom" && position.ratio === 1) return `right: ${offset}; bottom: ${offset};`;
  if (position.edge === "left" && position.ratio === 0) return `top: ${offset}; left: ${offset};`;
  if (position.edge === "left" && position.ratio === 1) return `bottom: ${offset}; left: ${offset};`;
  if (position.edge === "right" && position.ratio === 0) return `top: ${offset}; right: ${offset};`;
  if (position.edge === "right" && position.ratio === 1) return `right: ${offset}; bottom: ${offset};`;
  if (position.edge === "top") return `top: ${offset}; left: ${percent}; transform: translateX(-${percent});`;
  if (position.edge === "bottom") return `bottom: ${offset}; left: ${percent}; transform: translateX(-${percent});`;
  if (position.edge === "left") return `left: ${offset}; top: ${percent}; transform: translateY(-${percent});`;
  return `right: ${offset}; top: ${percent}; transform: translateY(-${percent});`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

async function captureItinerary(isAutomatic: boolean): Promise<void> {
  if (state.captureInFlight) return;
  const captureId = crypto.randomUUID();
  state.captureInFlight = true;
  state.activeCaptureId = captureId;
  state.error = "";
  const captureLocationKey = state.locationKey;
  setStatus(isAutomatic ? t()("loadingItaItinerary") : t()("lookingForItaJson"));

  try {
    const text = await captureViaPageBridge();
    if (captureLocationKey !== state.locationKey) return;
    await parseAndSetItinerary(text, captureLocationKey);
  } catch (error) {
    if (!isActiveCapture(captureId, captureLocationKey)) return;
    if (isAutomatic) {
      state.status = t()("autoLoadDidNotFindJson");
      render();
      return;
    }
    setError(t()("captureFailed", { message: error instanceof Error ? error.message : "" }).trim());
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
    await setCapturedItinerary(itinerary, expectedLocationKey);
  } catch (error) {
    if (expectedLocationKey !== state.locationKey) return;
    state.itinerary = null;
    state.links = [];
    setError(t()("parseJsonFailed", { message: error instanceof Error ? error.message : String(error) }));
  }
}

async function parseAndSetBookingDetails(value: unknown, expectedLocationKey = state.locationKey): Promise<void> {
  try {
    const signature = bookingDetailsSignature(value);
    if (signature && signature === state.bookingDetailsSignature) return;
    const itinerary = parseItaBookingDetails(value);
    await setCapturedItinerary(itinerary, expectedLocationKey, signature);
  } catch {
    // Ignore non-itinerary Alkali payloads.
  }
}

async function setCapturedItinerary(
  itinerary: NormalizedItinerary,
  expectedLocationKey = state.locationKey,
  bookingSignature = "",
): Promise<void> {
  const settings = state.settings || (await safeChromeCall(loadSettings, DEFAULT_SETTINGS));
  if (expectedLocationKey !== state.locationKey) return;
  state.settings = settings;
  const remoteMetadata = await fetchRemoteProviderMetadata(settings);
  if (expectedLocationKey !== state.locationKey) return;
  state.itinerary = itinerary;
  state.links = applyPageLinkOverrides(rankProviderLinks(itinerary, settings, remoteMetadata));
  state.error = "";
  state.autoCaptureAttempted = true;
  if (bookingSignature) state.bookingDetailsSignature = bookingSignature;
  setStatus(t()("itineraryCaptured"));
}

function bookingDetailsSignature(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const data = value as {
    id?: unknown;
    displayTotal?: unknown;
    itinerary?: { slices?: unknown };
    tickets?: unknown;
  };
  return JSON.stringify({
    id: typeof data.id === "string" ? data.id : "",
    displayTotal: typeof data.displayTotal === "string" ? data.displayTotal : "",
    slices: data.itinerary?.slices || null,
    tickets: data.tickets || null,
  });
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
    forgetAutoOpenRequest();
    return false;
  }
}

async function updateAirportSetting(key: string, value: string): Promise<void> {
  if (!state.settings) return;
  const area = key === "area" ? airportAreaFromSearchValue(value, state.settings.language) : null;
  if (key === "area" && value.trim() && area && !hasAirportArea(area)) {
    state.airportAreaSearch = "";
    render();
    return;
  }
  const areaChanged = area ? airportAreaChanged(state.settings.airportHelper, area) : false;
  const next: ExtensionSettings = {
    ...state.settings,
    airportHelper: {
      ...state.settings.airportHelper,
      ...(area ? { ...area, exclusions: areaChanged ? [] : state.settings.airportHelper.exclusions } : {}),
    },
  };
  state.settings = next;
  state.airportAreaSearch = "";
  state.airportPreview = airportCodes(next.airportHelper).slice(0, 120);
  await safeChromeCall(() => saveSettings(next), undefined);
  render();
}

function hasAirportArea(area: Pick<ExtensionSettings["airportHelper"], "region" | "continent" | "countries">): boolean {
  return Boolean(area.region || area.continent || area.countries.length > 0);
}

function airportAreaChanged(
  current: ExtensionSettings["airportHelper"],
  nextArea: Pick<ExtensionSettings["airportHelper"], "region" | "continent" | "countries">,
): boolean {
  const language = state.settings?.language || DEFAULT_SETTINGS.language;
  return airportAreaSearchValue(current, language) !== airportAreaSearchValue({ ...current, ...nextArea }, language);
}

async function removeAirportCode(code: string): Promise<void> {
  if (!state.settings || !/^[A-Z0-9]{3}$/.test(code)) return;
  const exclusions = Array.from(new Set([...state.settings.airportHelper.exclusions, code])).sort();
  const next: ExtensionSettings = {
    ...state.settings,
    airportHelper: {
      ...state.settings.airportHelper,
      exclusions,
    },
  };
  state.settings = next;
  state.airportPreview = airportCodes(next.airportHelper).slice(0, 120);
  await safeChromeCall(() => saveSettings(next), undefined);
  render();
}

function injectPageBridge(): void {
  if (document.getElementById(BRIDGE_ID)) return;
  const bridgeUrl = runtimeUrl("content/itaMatrixPageBridge.js");
  if (!bridgeUrl) return;
  const script = document.createElement("script");
  script.id = BRIDGE_ID;
  script.src = bridgeUrl;
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
    if (isItineraryPage()) {
      void parseAndSetBookingDetails(event.data.data);
    }
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
    if (!isFlightsPage()) return;
    scheduleTabScopedAutoOpenAuthorizationCheck();
    annotateFlightResultsSoon();
    scheduleAutoOpenMatrixResult();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", scheduleFlightResultsWork);
  window.addEventListener("hashchange", scheduleFlightResultsWork);
}

function installSearchAutoSubmitObserver(): void {
  const observer = new MutationObserver(() => {
    if (!isSearchPage()) return;
    scheduleAutoSubmitMatrixSearch();
    scheduleLocationClearButtonInstall();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", scheduleSearchPageWork);
  window.addEventListener("hashchange", scheduleSearchPageWork);
}

function scheduleSearchPageWork(): void {
  if (!isSearchPage()) return;
  scheduleAutoSubmitMatrixSearch();
  scheduleLocationClearButtonInstall();
}

function scheduleAutoCaptureCheck(): void {
  if (autoCaptureCheckTimer) window.clearTimeout(autoCaptureCheckTimer);
  autoCaptureCheckTimer = window.setTimeout(() => {
    autoCaptureCheckTimer = undefined;
    resetForLocationChange();
    maybeAutoCapture(false);
  }, AUTO_CAPTURE_DEBOUNCE_MS);
}

function scheduleAutoSubmitMatrixSearch(): void {
  if (autoSearchTimer) window.clearTimeout(autoSearchTimer);
  autoSearchTimer = window.setTimeout(() => {
    autoSearchTimer = undefined;
    maybeAutoSubmitMatrixSearch();
  }, AUTO_SEARCH_DEBOUNCE_MS);
}

function scheduleAutoOpenMatrixResult(): void {
  if (autoOpenTimer) window.clearTimeout(autoOpenTimer);
  autoOpenTimer = window.setTimeout(() => {
    autoOpenTimer = undefined;
    maybeAutoOpenMatrixResult();
  }, AUTO_OPEN_DEBOUNCE_MS);
}

function scheduleFlightResultsWork(): void {
  scheduleTabScopedAutoOpenAuthorizationCheck();
  annotateFlightResultsSoon();
  scheduleAutoOpenMatrixResult();
}

function scheduleTabScopedAutoOpenAuthorizationCheck(): void {
  if (!isFlightsPage() || tabScopedAutoOpenRequest()) return;
  const locationKey = currentLocationKey();
  if (tabScopedAutoOpenCheckLocationKey !== locationKey) {
    tabScopedAutoOpenCheckLocationKey = locationKey;
    tabScopedAutoOpenCheckStartedAt = 0;
  }
  if (!tabScopedAutoOpenCheckStartedAt) tabScopedAutoOpenCheckStartedAt = Date.now();
  if (Date.now() - tabScopedAutoOpenCheckStartedAt > TAB_AUTO_OPEN_CHECK_TIMEOUT_MS) return;
  if (tabAutoOpenCheckTimer) window.clearTimeout(tabAutoOpenCheckTimer);
  tabAutoOpenCheckTimer = window.setTimeout(() => {
    tabAutoOpenCheckTimer = undefined;
    void refreshTabScopedAutoOpenAuthorization();
  }, TAB_AUTO_OPEN_CHECK_DEBOUNCE_MS);
}

async function refreshTabScopedAutoOpenAuthorization(): Promise<void> {
  if (!isFlightsPage() || tabScopedAutoOpenRequest()) return;
  const authorized = await safeChromeCall(async () => {
    const response = await chrome.runtime.sendMessage({ command: "consumeMatrixAutoOpenForTab" });
    return Boolean(response?.ok);
  }, false);
  if (authorized) {
    tabScopedAutoOpenUntil = Date.now() + AUTO_OPEN_REMEMBER_MS;
    scheduleAutoOpenMatrixResult();
    return;
  }
  scheduleTabScopedAutoOpenAuthorizationCheck();
}

function maybeAutoSubmitMatrixSearch(): void {
  if (!shouldAutoSubmitMatrixSearch()) {
    autoSearchStartedAt = 0;
    autoSearchDone = false;
    autoSearchLocationKey = "";
    return;
  }

  const locationKey = currentLocationKey();
  if (autoSearchLocationKey !== locationKey) {
    autoSearchLocationKey = locationKey;
    autoSearchStartedAt = Date.now();
    autoSearchDone = false;
  }
  if (autoSearchDone) return;

  const button = matrixSearchButton();
  if (button && !isDisabledButton(button)) {
    autoSearchDone = true;
    if (shouldAutoOpenMatrixResultAfterSearch()) rememberAutoOpenRequest();
    setStatus(t()("searchingPrefilledMatrixForm"));
    button.click();
    return;
  }

  if (Date.now() - autoSearchStartedAt < AUTO_SEARCH_TIMEOUT_MS) scheduleAutoSubmitMatrixSearch();
}

function shouldAutoSubmitMatrixSearch(): boolean {
  if (!isSearchPage()) return false;
  const url = new URL(window.location.href);
  return (
    Boolean(url.searchParams.get("search")) &&
    (urlFlag(url, AUTO_SEARCH_FLAG, LEGACY_AUTO_SEARCH_FLAG) ||
      matrixSearchPayloadFlag(AUTO_SEARCH_FLAG, LEGACY_AUTO_SEARCH_FLAG))
  );
}

function maybeAutoOpenMatrixResult(): void {
  if (isItineraryPage()) {
    resetAutoOpenState();
    forgetAutoOpenRequest();
    return;
  }
  if (!isFlightsPage()) {
    if (!isSearchPage()) {
      resetAutoOpenState();
      forgetAutoOpenRequest();
    }
    return;
  }
  if (!shouldAutoOpenMatrixResult()) {
    resetAutoOpenState();
    return;
  }

  const locationKey = currentLocationKey();
  if (autoOpenLocationKey !== locationKey) {
    autoOpenLocationKey = locationKey;
    autoOpenStartedAt = Date.now();
    autoOpenDone = false;
    autoOpenClickedPrimaryResult = false;
  }
  if (autoOpenDone) return;

  const target = matrixResultOpenTarget();
  if (target) {
    const primaryRow = primaryResultRowFor(target);
    const clickedExpandedControl = autoOpenClickedPrimaryResult;
    target.dataset.mooFlightsAutoOpenClicked = "true";
    if (primaryRow) {
      primaryRow.dataset.mooFlightsAutoOpenClicked = "true";
      autoOpenClickedPrimaryResult = true;
      autoOpenPrimaryResultRow = primaryRow;
    }
    setStatus(t()("openingFirstMatrixResult"));
    if (clickedExpandedControl) {
      autoOpenDone = true;
      forgetAutoOpenRequest();
      target.click();
      return;
    }
    target.click();
    if (primaryRow && !shouldContinueAutoOpenAfterPrimaryClick(target, primaryRow)) {
      autoOpenDone = true;
      forgetAutoOpenRequest();
      return;
    }
    if (Date.now() - autoOpenStartedAt < AUTO_OPEN_TIMEOUT_MS) scheduleAutoOpenMatrixResult();
    return;
  }

  if (Date.now() - autoOpenStartedAt < AUTO_OPEN_TIMEOUT_MS) {
    scheduleAutoOpenMatrixResult();
    return;
  }

  autoOpenDone = true;
  forgetAutoOpenRequest();
}

function shouldAutoOpenMatrixResultAfterSearch(): boolean {
  const url = new URL(window.location.href);
  return (
    urlFlag(url, AUTO_OPEN_FLAG, LEGACY_AUTO_OPEN_FLAG) ||
    matrixSearchPayloadFlag(AUTO_OPEN_FLAG, LEGACY_AUTO_OPEN_FLAG)
  );
}

function shouldAutoOpenMatrixResult(): boolean {
  const url = new URL(window.location.href);
  return (
    urlFlag(url, AUTO_OPEN_FLAG, LEGACY_AUTO_OPEN_FLAG) ||
    matrixSearchPayloadFlag(AUTO_OPEN_FLAG, LEGACY_AUTO_OPEN_FLAG) ||
    rememberedAutoOpenRequest() ||
    tabScopedAutoOpenRequest()
  );
}

function matrixResultOpenTarget(): HTMLElement | null {
  const expandedControl = autoOpenClickedPrimaryResult ? firstExpandedResultOpenControl() : null;
  if (expandedControl) return expandedControl;
  if (autoOpenClickedPrimaryResult) return null;

  const alreadyExpandedControl = firstExpandedResultOpenControl();
  if (alreadyExpandedControl) return alreadyExpandedControl;

  const row = firstVisibleFlightResultRow();
  if (!row || row.dataset.mooFlightsAutoOpenClicked === "true") return null;
  const rowControl = firstItineraryPriceLink(row) || firstResultOpenControl(row);
  return rowControl || row;
}

function firstVisibleFlightResultRow(): HTMLElement | null {
  return (
    Array.from(document.querySelectorAll<HTMLElement>(FLIGHT_RESULT_ROW_SELECTOR)).find(
      (row) => isVisibleElement(row) && !row.closest(`#${PANEL_ID}`) && normalize(row.textContent || ""),
    ) || null
  );
}

function firstExpandedResultOpenControl(): HTMLElement | null {
  const scopes = expandedResultScopesFor(autoOpenPrimaryResultRow);
  for (const scope of scopes) {
    const control = firstResultOpenControl(scope);
    if (control) return control;
  }
  return null;
}

function firstResultOpenControl(scope: ParentNode): HTMLElement | null {
  return (
    Array.from(scope.querySelectorAll<HTMLElement>("button, a[href], [role='button']")).find(
      (control) =>
        !control.closest(`#${PANEL_ID}`) &&
        control.dataset.mooFlightsAutoOpenClicked !== "true" &&
        primaryResultRowFor(control)?.dataset.mooFlightsAutoOpenClicked !== "true" &&
        isVisibleElement(control) &&
        !isDisabledControl(control) &&
        isResultOpenControl(control),
    ) || null
  );
}

function firstItineraryPriceLink(scope: ParentNode): HTMLAnchorElement | null {
  return (
    Array.from(scope.querySelectorAll<HTMLAnchorElement>("a[href]")).find((anchor) => {
      if (!isVisibleElement(anchor) || isDisabledControl(anchor) || !/\d/.test(anchor.textContent || "")) return false;
      try {
        return new URL(anchor.getAttribute("href") || anchor.href, window.location.href).pathname.startsWith(
          "/itinerary",
        );
      } catch {
        return false;
      }
    }) || null
  );
}

function isResultOpenControl(control: HTMLElement): boolean {
  const label = controlSearchLabel(control);
  return (
    /\b(select|choose|continue|details|view|open|itinerary)\b/.test(label) ||
    /\b(usd|eur|gbp|jpy|cad|aud|hkd|twd|sgd)\s*[\d,.]+/.test(label) ||
    /[$€£¥]\s*[\d,.]+/.test(label)
  );
}

function shouldContinueAutoOpenAfterPrimaryClick(target: HTMLElement, primaryRow: HTMLElement): boolean {
  if (target === primaryRow) return true;
  const label = controlSearchLabel(target);
  return /\b(details|view|open|itinerary)\b/.test(label) && !/\b(select|choose|continue)\b/.test(label);
}

function controlSearchLabel(control: HTMLElement): string {
  return normalize(
    [
      control.getAttribute("aria-label"),
      control.getAttribute("title"),
      control.textContent,
      control instanceof HTMLAnchorElement ? control.href : "",
    ]
      .filter(Boolean)
      .join(" "),
  ).toLowerCase();
}

function matrixSearchButton(): HTMLButtonElement | null {
  return (
    document.querySelector<HTMLButtonElement>("button[type='submit'].search-button") ||
    document.querySelector<HTMLButtonElement>("button[type='submit']")
  );
}

function isDisabledControl(control: HTMLElement): boolean {
  if (control instanceof HTMLButtonElement && isDisabledButton(control)) return true;
  return control.getAttribute("aria-disabled") === "true" || control.classList.contains("mat-mdc-button-disabled");
}

function isDisabledButton(button: HTMLButtonElement): boolean {
  return (
    button.disabled ||
    button.getAttribute("aria-disabled") === "true" ||
    button.classList.contains("mat-mdc-button-disabled") ||
    button.classList.contains("mdc-button--disabled")
  );
}

function isVisibleElement(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden";
}

function primaryResultRowFor(element: HTMLElement): HTMLElement | null {
  return element.closest<HTMLElement>(FLIGHT_RESULT_ROW_SELECTOR);
}

function expandedResultScopesFor(row: HTMLElement | null): HTMLElement[] {
  const scopes: HTMLElement[] = [];
  if (row?.isConnected) {
    const nextRow = row.nextElementSibling;
    if (nextRow instanceof HTMLElement && nextRow.matches("tr.detail-row") && isVisibleElement(nextRow)) {
      scopes.push(nextRow);
      scopes.push(
        ...Array.from(nextRow.querySelectorAll<HTMLElement>("matrix-itinerary-grid")).filter(isVisibleElement),
      );
    }
  }
  if (scopes.length === 0) {
    scopes.push(
      ...Array.from(document.querySelectorAll<HTMLElement>("tr.detail-row, matrix-itinerary-grid")).filter(
        isVisibleElement,
      ),
    );
  }
  return scopes;
}

function rememberAutoOpenRequest(): void {
  const token = autoOpenSearchToken();
  try {
    sessionStorage.setItem(
      AUTO_OPEN_STORAGE_KEY,
      JSON.stringify({
        token,
        expiresAt: Date.now() + AUTO_OPEN_REMEMBER_MS,
      }),
    );
  } catch {
    // Session storage is optional; URL flags still drive same-page behavior.
  }
}

function rememberedAutoOpenRequest(): boolean {
  try {
    const raw = sessionStorage.getItem(AUTO_OPEN_STORAGE_KEY);
    if (!raw) return false;
    const request = JSON.parse(raw) as { token?: unknown; expiresAt?: unknown };
    if (typeof request.expiresAt !== "number" || request.expiresAt < Date.now()) {
      forgetAutoOpenRequest();
      return false;
    }
    const currentToken = autoOpenSearchToken();
    if (!currentToken || typeof request.token !== "string") return true;
    return autoOpenSearchTokensMatch(request.token, currentToken);
  } catch {
    return false;
  }
}

function forgetAutoOpenRequest(): void {
  try {
    sessionStorage.removeItem(AUTO_OPEN_STORAGE_KEY);
  } catch {
    // Session storage is optional.
  }
  tabScopedAutoOpenUntil = 0;
  tabScopedAutoOpenCheckStartedAt = 0;
  tabScopedAutoOpenCheckLocationKey = "";
  if (tabAutoOpenCheckTimer) {
    window.clearTimeout(tabAutoOpenCheckTimer);
    tabAutoOpenCheckTimer = undefined;
  }
}

function resetAutoOpenState(): void {
  autoOpenStartedAt = 0;
  autoOpenDone = false;
  autoOpenLocationKey = "";
  autoOpenClickedPrimaryResult = false;
  autoOpenPrimaryResultRow = null;
}

function autoOpenSearchToken(): string {
  const url = new URL(window.location.href);
  return url.searchParams.get("search") || "";
}

function tabScopedAutoOpenRequest(now = Date.now()): boolean {
  if (tabScopedAutoOpenUntil < now) {
    tabScopedAutoOpenUntil = 0;
    return false;
  }
  return tabScopedAutoOpenUntil > 0;
}

function autoOpenSearchTokensMatch(left: string, right: string): boolean {
  if (left === right) return true;
  const normalizedLeft = normalizeAutoOpenSearchToken(left);
  const normalizedRight = normalizeAutoOpenSearchToken(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function normalizeAutoOpenSearchToken(value: string): string {
  try {
    const payload = JSON.parse(decodeBase64SearchParam(value));
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
    const normalizedPayload = payload as {
      mooFlightsAutoOpen?: unknown;
      mooFlightsAutoSearch?: unknown;
      muTravelAutoOpen?: unknown;
      muTravelAutoSearch?: unknown;
      solution?: unknown;
    };
    delete normalizedPayload.mooFlightsAutoOpen;
    delete normalizedPayload.mooFlightsAutoSearch;
    delete normalizedPayload.muTravelAutoOpen;
    delete normalizedPayload.muTravelAutoSearch;
    delete normalizedPayload.solution;
    return JSON.stringify(canonicalJsonValue(normalizedPayload));
  } catch {
    return "";
  }
}

function canonicalJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalJsonValue(entry)]),
  );
}

function matrixSearchPayloadFlag(key: string, legacyKey: string): boolean {
  const url = new URL(window.location.href);
  const search = url.searchParams.get("search");
  if (!search) return false;
  try {
    const payload = JSON.parse(decodeBase64SearchParam(search)) as Record<string, unknown>;
    return payload?.[key] === "1" || payload?.[legacyKey] === "1";
  } catch {
    return false;
  }
}

function urlFlag(url: URL, key: string, legacyKey: string): boolean {
  return url.searchParams.get(key) === "1" || url.searchParams.get(legacyKey) === "1";
}

function decodeBase64SearchParam(value: string): string {
  return atob(
    value
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(value.length / 4) * 4, "="),
  );
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
      const estimate = estimateSegmentEarnings(segment, itinerary, segments, index, {}, state.currencyRates);
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
      header.textContent = t()("milesEarning");
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
        cell.innerHTML = `<span class="mu-mileage-placeholder">${escapeHtml(t()("expandFare"))}</span>`;
        row.appendChild(cell);
      }
    }

    const detailCells = Array.from(table.querySelectorAll<HTMLTableCellElement>("tr.detail-row > td[colspan]"));
    for (const cell of detailCells) {
      if (cell.dataset.mooFlightsColspanAdjusted === "true") continue;
      const colspan = Number(cell.getAttribute("colspan") || 0);
      if (Number.isFinite(colspan) && colspan > 0) cell.setAttribute("colspan", String(colspan + 1));
      cell.dataset.mooFlightsColspanAdjusted = "true";
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
  const translate = t();
  const language = state.settings?.language || DEFAULT_SETTINGS.language;
  const preferredPrograms = state.settings?.preferredFrequentFlyerPrograms || [];
  const estimates = estimateEarnings(
    itinerary,
    preferredPrograms,
    state.settings?.frequentFlyerProgramTiers || {},
    state.currencyRates,
  );
  const preferredProgramRanks = new Map(preferredPrograms.map((program, index) => [program, index]));
  const byProgram = new Map<string, { miles: number; formulas: MileageFormula[] }>();
  for (const estimate of estimates) {
    if (typeof estimate.estimatedMiles !== "number" || estimate.estimatedMiles < 0) continue;
    const program = estimate.program || translate("bestAvailableProgram");
    const current = byProgram.get(program) || { miles: 0, formulas: [] };
    current.miles += estimate.estimatedMiles;
    current.formulas.push({
      direction: segmentDirectionLabel(itinerary, estimate.segment),
      segment: `${estimate.segment.origin}-${estimate.segment.destination}`,
      formula: estimate.formula,
    });
    byProgram.set(program, current);
  }

  const programs = sortResultMileagePrograms(
    Array.from(byProgram.entries()).map(([program, value]) => {
      const preferenceRank = mileageProgramPreferenceRank(program, preferredProgramRanks);
      return {
        program,
        miles: value.miles,
        formulas: value.formulas,
        preferenceRank,
        preferred: preferenceRank !== Number.POSITIVE_INFINITY,
      };
    }),
  );

  const hasPreferredPrograms = preferredProgramRanks.size > 0;
  const visiblePrograms = hasPreferredPrograms ? programs.filter((program) => program.preferred) : programs;

  if (programs.length > 0 && visiblePrograms.length === 0) {
    const best = programs[0];
    return {
      entries: [
        {
          value: translate("noPreferredMatch"),
          program: best
            ? translate("bestLocalRow", { program: localizedMileageProgramDisplay(best.program, language) })
            : translate("localEarningData"),
        },
      ],
      title: translate("noPreferredRowsTooltip"),
      status: "fallback",
    };
  }

  if (visiblePrograms.length > 0) {
    const visible = hasPreferredPrograms ? visiblePrograms : visiblePrograms.slice(0, 2);
    const remaining = hasPreferredPrograms ? 0 : visiblePrograms.length - visible.length;
    const entries: ResultMileageEntry[] = visible.map((program) => ({
      value: `~${program.miles.toLocaleString()}`,
      program: localizedMileageProgramDisplay(program.program, language),
      calculation: compactMileageCalculation(program.formulas),
      preferred: program.preferred,
    }));
    if (remaining > 0) {
      entries.push({
        value: `+${remaining}`,
        program: translate("morePrograms"),
      });
    }
    return {
      entries,
      title: visiblePrograms
        .map(
          (program) =>
            `${localizedMileageProgramDisplay(program.program, language)}: ~${program.miles.toLocaleString()} ${translate("milesUnit")} (${program.formulas
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
          program: translate("flownMiles"),
        },
      ],
      title: translate("noEarningDataMatched"),
      status: "fallback",
    };
  }

  return {
    entries: [
      {
        value: translate("noData"),
        program: translate("expandFare"),
      },
    ],
    title: translate("noMileageEstimate"),
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
          <span>${escapeHtml(entry.program)}${entry.preferred ? `<em>${escapeHtml(t()("preferred"))}</em>` : ""}</span>
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
        ? `~${estimate.estimatedMiles.toLocaleString()} ${t()("milesUnit")}`
        : estimate.formula;
    line.textContent = `${t()("milesCredit")}: ${miles} · ${localizedMileageProgramDisplay(estimate.program, state.settings?.language || DEFAULT_SETTINGS.language)}`;
    line.title = estimate.formula;
    return line;
  }

  const distance = airportDistanceMiles(segment.origin, segment.destination);
  const distanceText = distance
    ? `~${Math.round(distance).toLocaleString()} ${t()("flownMiles")}`
    : t()("noDistanceEstimate");
  line.textContent = `${t()("milesCredit")}: ${distanceText} · ${t()("noEarningDataFor", {
    carrier: segment.carrier,
    bookingClass: segment.bookingClass || "",
  })}`;
  return line;
}

function installFlightResultStyles(): void {
  if (document.getElementById("mooflights-flight-result-styles")) return;
  const style = document.createElement("style");
  style.id = "mooflights-flight-result-styles";
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
  appendToDocumentHead(style);
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
  state.autoCaptureAttempted = true;
  setStatus(t()("waitingForItaData"));
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
  state.bookingDetailsSignature = "";
  render();
}

function currentLocationKey(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
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

function shouldHidePanel(): boolean {
  return isFlightsPage() || isPanelHiddenForSession();
}

function isPanelHiddenForSession(): boolean {
  try {
    return sessionStorage.getItem(PANEL_SESSION_HIDE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function airportAreaDropdownOptions(): AirportAreaOption[] {
  const query = normalizeAirportAreaSearch(state.airportAreaSearch);
  if (!query) return [];
  return currentAirportAreaOptions()
    .map((option) => ({
      option,
      score: airportAreaOptionScore(option, query),
    }))
    .filter((match) => match.score >= 0)
    .sort((left, right) => left.score - right.score || left.option.label.localeCompare(right.option.label))
    .map((match) => match.option)
    .slice(0, 8);
}

function airportAreaOptionScore(option: AirportAreaOption, query: string): number {
  const label = normalizeAirportAreaSearch(option.label);
  const value = normalizeAirportAreaSearch(option.value);
  const searchValue = normalizeAirportAreaSearch(option.searchValue);
  const aliases = option.aliases.map(normalizeAirportAreaSearch);
  if (option.type === "country" && value === query) return 0;
  if (label === query) return 1;
  if (label.startsWith(query)) return 2;
  if (searchValue.startsWith(query)) return 3;
  if (aliases.some((alias) => alias === query)) return 4;
  if (aliases.some((alias) => alias.startsWith(query))) return 5;
  if (label.includes(query)) return 6;
  if (searchValue.includes(query)) return 7;
  if (aliases.some((alias) => alias.includes(query))) return 8;
  if (value.includes(query)) return 6;
  return -1;
}

function renderAirportAreaDropdownRows(options: AirportAreaOption[]): string {
  const translate = t();
  return options
    .map((option, index) => {
      const typeLabel =
        option.type === "country"
          ? ""
          : option.type === "continent"
            ? translate("airportAreaTypeContinent")
            : translate("airportAreaTypeRegion");
      return `
        <li role="presentation">
          <button type="button" class="${index === 0 ? "active" : ""}" data-action="select-airport-area" data-value="${escapeHtml(option.searchValue)}" role="option">
            ${option.type === "country" ? `<span class="flag" aria-hidden="true">${escapeHtml(flagEmoji(option.value))}</span>` : ""}
            <span>${escapeHtml(option.label)}</span>
            ${typeLabel ? `<small>${escapeHtml(typeLabel)}</small>` : ""}
          </button>
        </li>
      `;
    })
    .join("");
}

function renderAirportAreaDropdown(dropdown: HTMLElement | null): void {
  if (!dropdown) return;
  const options = airportAreaDropdownOptions();
  dropdown.hidden = options.length === 0;
  dropdown.innerHTML = renderAirportAreaDropdownRows(options);
  const input =
    dropdown.getRootNode() instanceof ShadowRoot
      ? (dropdown.getRootNode() as ShadowRoot).querySelector<HTMLInputElement>('input[data-setting="area"]')
      : null;
  input?.setAttribute("aria-expanded", options.length > 0 ? "true" : "false");
  bindAirportAreaDropdown(dropdown);
}

function bindAirportAreaDropdown(root: ParentNode): void {
  root.querySelectorAll<HTMLButtonElement>('[data-action="select-airport-area"]').forEach((button) => {
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => {
      const value = button.dataset.value || "";
      if (!value) return;
      void updateAirportSetting("area", value);
    });
  });
}

function normalizeAirportAreaSearch(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function activeAirportAreaOption(filters: ExtensionSettings["airportHelper"]): AirportAreaOption | null {
  const options = currentAirportAreaOptions();
  if (filters.region)
    return options.find((option) => option.type === "region" && option.value === filters.region) || null;
  if (filters.continent)
    return options.find((option) => option.type === "continent" && option.value === filters.continent) || null;
  if (filters.countries[0])
    return options.find((option) => option.type === "country" && option.value === filters.countries[0]) || null;
  return null;
}

function renderAirportAreaSelection(settings: ExtensionSettings): string {
  const option = activeAirportAreaOption(settings.airportHelper);
  const translate = t();
  if (!option) return `<p class="airport-note">${escapeHtml(translate("chooseAreaToBuildAirports"))}</p>`;
  const typeLabel =
    option.type === "country"
      ? translate("airportAreaTypeCountry")
      : option.type === "continent"
        ? translate("airportAreaTypeContinent")
        : translate("airportAreaTypeRegion");
  return `
    <p class="airport-area-selection">
      <span>${escapeHtml(translate("selected"))}</span>
      <strong>
        ${option.type === "country" ? `<span class="flag" aria-hidden="true">${escapeHtml(flagEmoji(option.value))}</span>` : ""}
        ${escapeHtml(option.label)}
      </strong>
      <small>${escapeHtml(typeLabel)}</small>
    </p>
  `;
}

function renderAirportHelper(settings: ExtensionSettings): string {
  const translate = t();
  const areaInputId = "mooflights-airport-area";
  const areaDropdownId = "mooflights-airport-area-dropdown";
  const areaInputValue = state.airportAreaSearch;
  const areaDropdownOptions = airportAreaDropdownOptions();
  return `
    <details open>
      <summary>${escapeHtml(translate("airportHelper"))}</summary>
      <div class="airport-area-field">
        <label for="${areaInputId}">${escapeHtml(translate("area"))}</label>
        <div class="airport-area-combo">
          <input id="${areaInputId}" type="search" data-setting="area" value="${escapeHtml(areaInputValue)}" placeholder="${escapeHtml(translate("airportAreaPlaceholder"))}" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="${areaDropdownOptions.length > 0 ? "true" : "false"}" aria-controls="${areaDropdownId}">
          <ul id="${areaDropdownId}" class="airport-area-dropdown" data-role="airport-area-dropdown" role="listbox" ${areaDropdownOptions.length === 0 ? "hidden" : ""}>
            ${renderAirportAreaDropdownRows(areaDropdownOptions)}
          </ul>
        </div>
      </div>
      ${renderAirportAreaSelection(settings)}
      <div class="airport-output-row">
        <div class="airport-chip-list">
          ${
            state.airportPreview.length > 0
              ? state.airportPreview
                  .map(
                    (code) => `
                      <button type="button" class="airport-chip" data-action="remove-airport-code" data-code="${escapeHtml(code)}" aria-label="${escapeHtml(translate("removeAirportCode", { code }))}">
                        ${escapeHtml(code)}<span aria-hidden="true">x</span>
                      </button>
                    `,
                  )
                  .join("")
              : `<span class="muted">${escapeHtml(translate("noAirportsSelected"))}</span>`
          }
        </div>
        <button type="button" class="copy-button" data-action="copy-airports" aria-label="${escapeHtml(translate("copyAirportCodes"))}" title="${escapeHtml(translate("copyAirportCodes"))}" ${state.airportPreview.length === 0 ? "disabled" : ""}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <rect x="8" y="8" width="10" height="12" rx="2"></rect>
            <path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </button>
      </div>
    </details>
  `;
}

function currentAirportAreaOptions(): AirportAreaOption[] {
  return airportAreaOptions(state.settings?.language || DEFAULT_SETTINGS.language);
}

function installChipClearShortcut(): void {
  document.addEventListener("keydown", (event) => {
    if (event.key !== "F8") return;
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.classList.contains("mat-mdc-chip-input")) return;
    void clearLocationChipGrid(active.closest("mat-chip-grid"));
  });
}

function installLocationClearButtons(): void {
  installLocationClearButtonStyles();
  scheduleLocationClearButtonInstall();
}

function scheduleLocationClearButtonInstall(): void {
  if (locationClearButtonInstallFrame !== undefined) return;
  locationClearButtonInstallFrame = window.requestAnimationFrame(() => {
    locationClearButtonInstallFrame = undefined;
    addLocationClearButtons();
  });
}

function addLocationClearButtons(): void {
  if (!isSearchPage()) return;
  document
    .querySelectorAll<HTMLButtonElement>('button.add-airport, button[aria-label="add location"]')
    .forEach((nearbyAirportButton) => {
      const suffix = nearbyAirportButton.closest(".mat-mdc-form-field-icon-suffix");
      const existingClearButton = suffix?.querySelector<HTMLButtonElement>(".mooflights-location-clear");
      if (existingClearButton) {
        localizeLocationClearButton(existingClearButton);
        syncLocationClearButton(existingClearButton, nearbyAirportButton);
        return;
      }
      if (!suffix) return;
      const clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.className = "mooflights-location-clear";
      localizeLocationClearButton(clearButton);
      clearButton.tabIndex = -1;
      clearButton.innerHTML = '<span class="material-icons" aria-hidden="true">close</span>';
      clearButton.addEventListener("mousedown", (event) => event.preventDefault());
      clearButton.addEventListener("click", (event) => {
        event.preventDefault();
        void clearLocationField(nearbyAirportButton);
      });
      suffix.insertBefore(clearButton, nearbyAirportButton);
      syncLocationClearButton(clearButton, nearbyAirportButton);
      const formField = nearbyAirportButton.closest("mat-form-field");
      formField?.addEventListener("input", () => syncLocationClearButton(clearButton, nearbyAirportButton));
      formField?.addEventListener("change", () => syncLocationClearButton(clearButton, nearbyAirportButton));
    });
}

function localizeLocationClearButton(clearButton: HTMLButtonElement): void {
  clearButton.setAttribute("aria-label", t()("clearSelectedAirports"));
  clearButton.setAttribute("title", t()("clearSelectedAirports"));
}

function syncLocationClearButton(clearButton: HTMLButtonElement, anchor: HTMLElement): void {
  clearButton.hidden = !locationFieldHasValue(anchor.closest("mat-form-field"));
}

function locationFieldHasValue(formField: Element | null): boolean {
  const input = formField?.querySelector<HTMLInputElement>(".mat-mdc-chip-input");
  if (input?.value.trim()) return true;
  const chipGrid = formField?.querySelector("mat-chip-grid");
  return Boolean(
    chipGrid &&
      Array.from(chipGrid.querySelectorAll("mat-chip-row, mat-chip, .mat-mdc-chip")).some((chip) =>
        Boolean(chip.textContent?.trim()),
      ),
  );
}

async function clearLocationField(anchor: HTMLElement): Promise<void> {
  const formField = anchor.closest("mat-form-field");
  await clearLocationChipGrid(formField?.querySelector("mat-chip-grid") || null);
  const input = formField?.querySelector<HTMLInputElement>(".mat-mdc-chip-input");
  if (input) {
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();
  }
  const clearButton = formField?.querySelector<HTMLButtonElement>(".mooflights-location-clear");
  if (clearButton) syncLocationClearButton(clearButton, anchor);
}

async function clearLocationChipGrid(chipGrid: Element | null): Promise<void> {
  const selector = "mat-icon[matchipremove], mat-icon[matChipRemove], [matchipremove], [matChipRemove]";
  for (;;) {
    const removeControl = chipGrid?.querySelector<HTMLElement>(selector);
    if (!removeControl) return;
    removeControl.click();
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
  }
}

function installLocationClearButtonStyles(): void {
  if (document.getElementById("mooflights-location-clear-styles")) return;
  const style = document.createElement("style");
  style.id = "mooflights-location-clear-styles";
  style.textContent = `
    .mooflights-location-clear {
      align-items: center;
      background: #ffffff;
      border: 0;
      border-radius: 999px;
      box-shadow: none;
      box-sizing: border-box;
      color: rgba(0, 0, 0, 0.72);
      cursor: pointer;
      display: inline-flex;
      flex: 0 0 22px;
      height: 22px;
      justify-content: center;
      margin: 0 -9px 0 0;
      max-width: 22px;
      min-width: 22px;
      padding: 0;
      pointer-events: auto;
      position: relative;
      vertical-align: middle;
      width: 22px;
      z-index: 2;
    }
    .mooflights-location-clear[hidden] {
      display: none;
    }
    .mooflights-location-clear:hover,
    .mooflights-location-clear:focus-visible {
      background: #f8fafc;
      color: rgba(0, 0, 0, 0.86);
      outline: none;
    }
    .mooflights-location-clear .material-icons {
      font-size: 16px;
      line-height: 1;
    }
  `;
  appendToDocumentHead(style);
}

function appendToDocumentHead(element: HTMLElement): void {
  (document.head || document.documentElement).appendChild(element);
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

function hidePanelForSession(): void {
  try {
    sessionStorage.setItem(PANEL_SESSION_HIDE_STORAGE_KEY, "1");
  } catch {
    // Session storage is an enhancement; removing the current panel still honors the click.
  }
  removePanel();
}

function renderLinks(links: RankedProviderLink[]): string {
  if (!state.itinerary) return `<p class="muted">${escapeHtml(t()("captureItineraryToRankLinks"))}</p>`;
  return links
    .map((link) => {
      const confidence = providerConfidenceCopy(link);
      const confidenceBadge = confidence
        ? `<em class="confidence"><i aria-hidden="true"></i>${escapeHtml(confidence.label)}</em>`
        : "";
      const issue = link.provider.knownIssues ? `<small>${escapeHtml(link.provider.knownIssues)}</small>` : "";
      return `
        <a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" class="provider ${link.confidence}">
          <span>${escapeHtml(link.provider.label)}</span>
          ${confidenceBadge}
          ${issue}
        </a>
      `;
    })
    .join("");
}

function providerConfidenceCopy(link: RankedProviderLink): { label: string } | null {
  if (ALWAYS_SHOWN_PROVIDER_IDS.includes(link.provider.id as (typeof ALWAYS_SHOWN_PROVIDER_IDS)[number])) return null;
  const translate = t();
  if (link.confidence === "high") {
    return {
      label: translate("reliable"),
    };
  }
  if (link.confidence === "medium") {
    return {
      label: translate("checkDetails"),
    };
  }
  return {
    label: translate("unreliable"),
  };
}

function renderMileageCredit(itinerary: NormalizedItinerary): string {
  const translate = t();
  const preferredProgramList = state.settings?.preferredFrequentFlyerPrograms || [];
  const estimates = estimateEarnings(
    itinerary,
    preferredProgramList,
    state.settings?.frequentFlyerProgramTiers || {},
    state.currencyRates,
  );
  const preferredPrograms = new Set(preferredProgramList);
  const visibleEstimates =
    preferredPrograms.size > 0 && !state.showAllMileagePrograms
      ? estimates.filter((estimate) => matchesPreferredMileageProgram(estimate.program, preferredPrograms))
      : estimates;
  const sortedVisibleEstimates = sortMileageEstimates(visibleEstimates, preferredProgramList);
  const hiddenEstimateCount = estimates.length - visibleEstimates.length;
  const insights = inspectWhereToCreditSegments(itinerary);
  const estimatedKeys = new Set(estimates.map((estimate) => creditSegmentKey(estimate.segment, estimate.bookingClass)));
  const notices = insights.filter(
    (insight) => insight.status !== "earning-data" && !estimatedKeys.has(creditSegmentKey(insight.segment)),
  );
  if (insights.length === 0 && estimates.length === 0) return "";
  return `
    <div class="segment-links">
      <strong>${escapeHtml(translate("milesCredit"))}</strong>
      ${visibleEstimates.length > 1 ? renderMileageSortControls(preferredPrograms.size > 0) : ""}
      ${sortedVisibleEstimates.length ? renderMileageEstimateEntries(sortedVisibleEstimates, preferredProgramList) : ""}
      ${
        hiddenEstimateCount > 0 && visibleEstimates.length === 0
          ? `<div class="earning notice">
              <span>${escapeHtml(translate("noPreferredProgramMatch"))}</span>
              <small>${escapeHtml(translate("noPreferredProgramMatchDetail"))}</small>
              <button type="button" class="inline-button" data-action="show-all-mileage">${escapeHtml(translate("showAll"))}</button>
            </div>`
          : ""
      }
      ${
        hiddenEstimateCount > 0 && visibleEstimates.length > 0
          ? `<div class="earning more-earnings">
              <small>${escapeHtml(translate("moreRowsHidden", { count: hiddenEstimateCount.toLocaleString() }))}</small>
              <button type="button" class="inline-button" data-action="show-all-mileage">${escapeHtml(translate("showAll"))}</button>
            </div>`
          : ""
      }
      ${notices
        .map(
          (insight) => `
            <div class="earning notice">
              <span>${escapeHtml(insight.label)}</span>
              ${insight.url ? `<a href="${escapeHtml(insight.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(translate("openAirlinePage"))}</a>` : ""}
              <small>${escapeHtml(insight.message)}</small>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderMileageSortControls(hasPreferredPrograms: boolean): string {
  const translate = t();
  const milesSelected = state.mileageSortMode === "miles";
  const nameSelected = state.mileageSortMode === "name";
  return `
    <div class="mileage-sort-controls">
      <div class="segmented-control" role="group" aria-label="${escapeHtml(translate("sortMileageRows"))}">
        <button type="button" data-action="mileage-sort" data-sort="miles" aria-pressed="${milesSelected}" aria-label="${escapeHtml(translate("sortByMilesDescending"))}">${escapeHtml(translate("miles"))} <span aria-hidden="true">↓</span></button>
        <button type="button" data-action="mileage-sort" data-sort="name" aria-pressed="${nameSelected}" aria-label="${escapeHtml(translate("sortByProgramNameAscending"))}">${escapeHtml(translate("name"))} <span aria-hidden="true">↑</span></button>
      </div>
      ${
        hasPreferredPrograms
          ? `<label><input type="checkbox" data-action="toggle-preferred-mileage-group" ${state.groupPreferredMileage ? "checked" : ""}> ${escapeHtml(translate("preferredFirst"))}</label>`
          : ""
      }
    </div>
  `;
}

function sortMileageEstimates(estimates: EarningsEstimate[], preferredProgramList: string[]): EarningsEstimate[] {
  const preferredProgramRanks = new Map(preferredProgramList.map((program, index) => [program, index]));
  return [...estimates].sort((left, right) => {
    const leftRank = mileageProgramPreferenceRank(left.program, preferredProgramRanks);
    const rightRank = mileageProgramPreferenceRank(right.program, preferredProgramRanks);
    const leftPreferred = leftRank !== Number.POSITIVE_INFINITY;
    const rightPreferred = rightRank !== Number.POSITIVE_INFINITY;
    if (state.groupPreferredMileage && leftPreferred !== rightPreferred) return leftPreferred ? -1 : 1;
    const sorted = compareMileageEstimateByMode(left, right);
    if (sorted !== 0) return sorted;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return creditSegmentKey(left.segment, left.bookingClass).localeCompare(
      creditSegmentKey(right.segment, right.bookingClass),
    );
  });
}

function compareMileageEstimateByMode(left: EarningsEstimate, right: EarningsEstimate): number {
  if (state.mileageSortMode === "name") {
    return (
      left.program.localeCompare(right.program) ||
      mileageEstimateValue(right) - mileageEstimateValue(left) ||
      creditSegmentKey(left.segment, left.bookingClass).localeCompare(
        creditSegmentKey(right.segment, right.bookingClass),
      )
    );
  }
  return (
    mileageEstimateValue(right) - mileageEstimateValue(left) ||
    left.program.localeCompare(right.program) ||
    creditSegmentKey(left.segment, left.bookingClass).localeCompare(creditSegmentKey(right.segment, right.bookingClass))
  );
}

function sortResultMileagePrograms<
  T extends { program: string; miles: number; preferred: boolean; preferenceRank: number },
>(programs: T[]): T[] {
  return [...programs].sort((left, right) => {
    if (state.groupPreferredMileage && left.preferred !== right.preferred) return left.preferred ? -1 : 1;
    if (state.mileageSortMode === "name") {
      return (
        left.program.localeCompare(right.program) ||
        right.miles - left.miles ||
        left.preferenceRank - right.preferenceRank
      );
    }
    return (
      right.miles - left.miles ||
      left.program.localeCompare(right.program) ||
      left.preferenceRank - right.preferenceRank
    );
  });
}

function mileageEstimateValue(estimate: EarningsEstimate): number {
  return estimate.estimatedMiles ?? -1;
}

function renderMileageEstimateEntries(estimates: EarningsEstimate[], preferredProgramList: string[]): string {
  const bySegment = new Map<string, EarningsEstimate[]>();
  for (const estimate of estimates) {
    const key = creditSegmentKey(estimate.segment, estimate.bookingClass);
    bySegment.set(key, [...(bySegment.get(key) || []), estimate]);
  }

  if (bySegment.size <= 1) return renderMileageEstimateSegmentEntries(estimates, preferredProgramList, false);
  return Array.from(bySegment.values())
    .map((segmentEstimates) => {
      const firstEstimate = segmentEstimates[0];
      return `
        <div class="earning segment-group">
          ${firstEstimate ? `<span>${escapeHtml(mileageSegmentLabel(firstEstimate))}</span>` : ""}
          ${renderMileageEstimateSegmentEntries(segmentEstimates, preferredProgramList, false)}
        </div>
      `;
    })
    .join("");
}

function renderMileageEstimateSegmentEntries(
  estimates: EarningsEstimate[],
  preferredProgramList: string[],
  showSegmentLabel: boolean,
): string {
  const tierGroups = mileageTierGroups(estimates, preferredProgramList);
  const renderedGroups = new Set<string>();
  const preferredPrograms = new Set(preferredProgramList);
  return estimates
    .map((estimate) => {
      const groupKey = mileageTierGroupKey(estimate, preferredProgramList);
      if (!groupKey) return renderMileageEstimateEntry(estimate, showSegmentLabel, preferredPrograms);
      const group = tierGroups.get(groupKey);
      if (!group || group.estimates.length <= 1) {
        return renderMileageEstimateEntry(estimate, showSegmentLabel, preferredPrograms);
      }
      if (renderedGroups.has(groupKey)) return "";
      renderedGroups.add(groupKey);
      return renderMileageTierGroup(group, showSegmentLabel, preferredPrograms);
    })
    .join("");
}

function renderMileageEstimateEntry(
  estimate: EarningsEstimate,
  showSegmentLabel: boolean,
  preferredPrograms: Set<string>,
): string {
  const preferenceClass = mileagePreferenceClass(estimate.program, preferredPrograms);
  return `
    <a href="${escapeHtml(estimate.url)}" target="_blank" rel="noopener noreferrer" class="earning ${preferenceClass}">
      ${showSegmentLabel ? `<span>${escapeHtml(mileageSegmentLabel(estimate))}</span>` : ""}
      <em>${escapeHtml(localizedMileageProgramDisplay(estimate.program, state.settings?.language || DEFAULT_SETTINGS.language))}</em>
      <small>${typeof estimate.estimatedMiles === "number" ? `${estimate.estimatedMiles.toLocaleString()} ${t()("milesUnit")} · ` : ""}${escapeHtml(estimate.formula)}</small>
    </a>
  `;
}

function renderMileageTierGroup(
  group: {
    parentProgram: string;
    segmentLabel: string;
    url: string;
    estimates: EarningsEstimate[];
  },
  showSegmentLabel: boolean,
  preferredPrograms: Set<string>,
): string {
  const estimates = sortTierEstimates(group.parentProgram, group.estimates);
  const parsedFormulas = estimates.map((estimate) => parseRevenueMileageFormula(estimate.formula));
  const baseFare = commonValue(estimates.map((estimate) => estimate.displayFare || ""));
  const isApproximate = estimates.some((estimate) => estimate.approximate);
  const preferenceClass = mileagePreferenceClass(group.parentProgram, preferredPrograms);
  return `
    <div class="earning tier-group ${preferenceClass}">
      ${showSegmentLabel ? `<span>${escapeHtml(group.segmentLabel)}</span>` : ""}
      <a href="${escapeHtml(group.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(localizedMileageProgramDisplay(group.parentProgram, state.settings?.language || DEFAULT_SETTINGS.language))}</a>
      ${baseFare ? `<small>${escapeHtml(t()("baseFare", { fare: baseFare }))}</small>` : ""}
      ${isApproximate ? `<small>${escapeHtml(t()("fxApproximate"))}</small>` : ""}
      <table>
        <tbody>
          ${estimates
            .map((estimate, index) => {
              const parsedFormula = parsedFormulas[index];
              return `
                <tr title="${escapeHtml(estimate.formula)}">
                  <th>${escapeHtml(compactTierName(group.parentProgram, estimate.program, state.settings?.language || DEFAULT_SETTINGS.language))}</th>
                  <td>${escapeHtml(typeof estimate.estimatedMiles === "number" ? estimate.estimatedMiles.toLocaleString() : "")}</td>
                  <td>${escapeHtml(parsedFormula?.rate || estimate.formula)}</td>
                </tr>
              `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function sortTierEstimates(parentProgram: string, estimates: EarningsEstimate[]): EarningsEstimate[] {
  return [...estimates].sort((left, right) => {
    const leftRank = mileageTierDisplayRank(parentProgram, left.program);
    const rightRank = mileageTierDisplayRank(parentProgram, right.program);
    if (leftRank !== rightRank) return leftRank - rightRank;
    return compactTierName(parentProgram, left.program).localeCompare(compactTierName(parentProgram, right.program));
  });
}

function mileageTierDisplayRank(parentProgram: string, program: string): number {
  const label = compactTierName(parentProgram, program);
  const ranks = new Map([
    ["Member", 0],
    ["Silver", 1],
    ["Gold", 2],
    ["Platinum", 3],
    ["Titanium", 4],
    ["1K", 5],
  ]);
  return ranks.get(label) ?? 100;
}

function parseRevenueMileageFormula(formula: string): { baseFare: string; rate: string } | null {
  const match = formula.match(/^(.+\s[A-Z]{3})\s+x\s+([\d.]+\s+miles\/[A-Z]{3})(?:\s+\(.+\))?$/);
  if (!match) return null;
  return {
    baseFare: match[1]?.trim() || "",
    rate: match[2]?.trim() || "",
  };
}

function commonValue(values: string[]): string {
  const nonEmptyValues = values.filter(Boolean);
  if (nonEmptyValues.length === 0) return "";
  return nonEmptyValues.every((value) => value === nonEmptyValues[0]) ? nonEmptyValues[0] : "";
}

function mileageTierGroups(
  estimates: EarningsEstimate[],
  preferredProgramList: string[],
): Map<string, { parentProgram: string; segmentLabel: string; url: string; estimates: EarningsEstimate[] }> {
  const groups = new Map<
    string,
    { parentProgram: string; segmentLabel: string; url: string; estimates: EarningsEstimate[] }
  >();
  for (const estimate of estimates) {
    const groupKey = mileageTierGroupKey(estimate, preferredProgramList);
    if (!groupKey) continue;
    const parentProgram = mileageTierParentProgram(estimate.program, preferredProgramList) || estimate.program;
    const current = groups.get(groupKey) || {
      parentProgram,
      segmentLabel: mileageSegmentLabel(estimate),
      url: estimate.url,
      estimates: [],
    };
    current.estimates.push(estimate);
    groups.set(groupKey, current);
  }
  return groups;
}

function mileageTierGroupKey(estimate: EarningsEstimate, preferredProgramList: string[]): string {
  const parentProgram = mileageTierParentProgram(estimate.program, preferredProgramList);
  if (!parentProgram) return "";
  return `${parentProgram}:${creditSegmentKey(estimate.segment, estimate.bookingClass)}`;
}

function mileageTierParentProgram(program: string, preferredProgramList: string[]): string {
  for (const preferredProgram of preferredProgramList) {
    if (program !== preferredProgram && program.startsWith(`${preferredProgram} `)) return preferredProgram;
  }
  for (const parentProgram of mileageProgramsByLength()) {
    if (program === parentProgram || !program.startsWith(`${parentProgram} `)) continue;
    if (mileageProgramTierOptions(parentProgram).some((tier) => tier.program === program)) return parentProgram;
  }
  return "";
}

function mileageProgramsByLength(): string[] {
  if (!mileageProgramsByLengthCache) {
    mileageProgramsByLengthCache = uniqueMileagePrograms().sort((left, right) => right.length - left.length);
  }
  return mileageProgramsByLengthCache;
}

function mileageSegmentLabel(estimate: EarningsEstimate): string {
  return `${estimate.segment.origin}-${estimate.segment.destination} ${estimate.segment.fareCarrier || estimate.segment.carrier} ${estimate.bookingClass}`;
}

function compactTierName(
  parentProgram: string,
  program: string,
  language: ExtensionSettings["language"] = DEFAULT_SETTINGS.language,
): string {
  const optionLabel = mileageProgramTierOptions(parentProgram, language).find(
    (tier) => tier.program === program,
  )?.label;
  if (optionLabel) return optionLabel;
  return program
    .slice(parentProgram.length)
    .trim()
    .replace(/^Premier\s+/i, "")
    .replace(/^Status\s+/i, "")
    .trim();
}

function matchesPreferredMileageProgram(program: string, preferredPrograms: Set<string>): boolean {
  if (preferredPrograms.size === 0) return false;
  if (preferredPrograms.has(program)) return true;
  for (const preferredProgram of preferredPrograms) {
    if (program.startsWith(`${preferredProgram} `)) return true;
  }
  return false;
}

function mileagePreferenceClass(program: string, preferredPrograms: Set<string>): string {
  if (preferredPrograms.size === 0) return "";
  return matchesPreferredMileageProgram(program, preferredPrograms) ? "preferred" : "non-preferred";
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
    await navigator.clipboard.writeText(state.airportPreview.join(" "));
    setStatus(successMessage);
  } catch (error) {
    setError(t()("couldNotCopyAirportCodes", { message: error instanceof Error ? error.message : String(error) }));
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
    .panel.minimized {
      width: auto;
      max-height: none;
      overflow: visible;
      border: 0;
      border-radius: 999px;
      background: transparent;
      box-shadow: none;
    }
    ${mooFlightsPanelHeaderStyles()}
    strong { display: block; font-size: 15px; }
    .brand strong { font-size: 18px; }
    header span, .muted, small { color: #64748b; }
    button, select, input, textarea { font: inherit; }
    button { border: 1px solid #0f766e; background: #0f766e; color: white; border-radius: 6px; padding: 6px 9px; cursor: pointer; }
    button.secondary, .link-button { background: white; color: #0f766e; }
    .link-button { border-color: transparent; text-decoration: underline; }
    .panel-icon {
      display: inline-grid;
      place-items: center;
      width: 64px;
      height: 64px;
      padding: 0;
      border: 0;
      overflow: visible;
      border-radius: 999px;
      background: transparent;
      color: #172033;
      box-shadow: none;
      font-weight: 750;
      letter-spacing: 0;
    }
    .panel-icon img {
      width: 64px;
      height: 64px;
      border-radius: 10px;
      transform: translate(-3px, -5px);
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
    .mileage-sort-controls {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-top: -2px;
    }
    .mileage-sort-controls label {
      display: flex;
      align-items: center;
      gap: 5px;
      margin: 0;
      color: #475569;
      font-size: 12px;
      white-space: nowrap;
    }
    .mileage-sort-controls input {
      width: auto;
      padding: 0;
    }
    .segmented-control {
      display: inline-flex;
      overflow: hidden;
      border: 1px solid #99f6e4;
      border-radius: 6px;
      background: #ffffff;
    }
    .segmented-control button {
      border: 0;
      border-radius: 0;
      background: transparent;
      color: #0f766e;
      padding: 3px 7px;
      font-size: 12px;
    }
    .segmented-control button[aria-pressed="true"] {
      background: #0f766e;
      color: #ffffff;
    }
    .segment-links .earning { display: grid; gap: 2px; }
    .segment-links .earning.non-preferred {
      margin-left: 6px;
      padding-left: 8px;
      border-left: 2px solid #cbd5e1;
      opacity: 0.78;
    }
    .segment-links .tier-group { gap: 5px; }
    .segment-links .segment-group { gap: 5px; padding-top: 4px; border-top: 1px solid #ccfbf1; }
    .segment-links .segment-group:first-of-type { padding-top: 0; border-top: 0; }
    .segment-links .notice { padding: 6px; border-radius: 6px; background: #fff7ed; color: #7c2d12; }
    .segment-links .more-earnings { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-top: 4px; border-top: 1px solid #ccfbf1; }
    .segment-links .more-earnings small { min-width: 0; }
    .segment-links em { font-style: normal; color: #115e59; }
    .segment-links a { color: #0f766e; text-decoration: none; }
    .segment-links .non-preferred em,
    .segment-links .non-preferred a { color: #475569; }
    .segment-links a:hover { text-decoration: underline; }
    .segment-links table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .segment-links th, .segment-links td { padding: 2px 4px 2px 0; text-align: left; vertical-align: top; }
    .segment-links th { width: 62px; color: #115e59; font-weight: 650; }
    .segment-links .non-preferred th { color: #475569; }
    .segment-links td:nth-child(2) { width: 64px; color: #162033; font-weight: 650; text-align: right; }
    .segment-links td:nth-child(3) { color: #64748b; }
    .segment-links .inline-button { width: fit-content; margin-top: 4px; border-color: #fed7aa; background: #ffffff; color: #9a3412; padding: 4px 7px; white-space: nowrap; }
    .segment-links .more-earnings .inline-button { flex: 0 0 auto; margin-top: 0; }
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
    .airport-output-row {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: start;
      gap: 8px;
      margin: 10px 0;
    }
    .airport-area-field {
      display: grid;
      gap: 4px;
      margin-top: 8px;
      color: #334155;
    }
    .airport-area-combo {
      position: relative;
    }
    .airport-area-dropdown {
      position: absolute;
      z-index: 2;
      left: 0;
      right: 0;
      top: calc(100% + 2px);
      max-height: 198px;
      overflow: auto;
      margin: 0;
      padding: 4px;
      list-style: none;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      background: #ffffff;
      box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
    }
    .airport-area-dropdown[hidden] {
      display: none;
    }
    .airport-area-dropdown button {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 7px;
      width: 100%;
      border: 0;
      border-radius: 5px;
      background: transparent;
      color: #162033;
      padding: 6px 7px;
      text-align: left;
      font-weight: 550;
    }
    .airport-area-dropdown button:hover,
    .airport-area-dropdown button.active {
      background: #f1f5f9;
    }
    .airport-area-dropdown small {
      color: #94a3b8;
      font-size: 11px;
      font-weight: 650;
    }
    .airport-area-dropdown .flag {
      font-weight: 400;
    }
    .airport-area-selection {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 7px 0 0;
      color: #64748b;
      font-size: 12px;
    }
    .airport-area-selection strong {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
      color: #162033;
      font-size: 12px;
      font-weight: 650;
    }
    .airport-area-selection small {
      color: #94a3b8;
      font-size: 11px;
      font-weight: 650;
    }
    .airport-note {
      margin: 8px 0 0;
      color: #64748b;
      font-size: 12px;
    }
    .airport-chip-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      min-height: 42px;
      max-height: 112px;
      overflow: auto;
      padding: 8px;
      border-radius: 10px;
      background: #f8fafc;
      color: #334155;
    }
    .airport-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 24px;
      padding: 0 6px;
      border-color: #cbd5e1;
      background: #ffffff;
      color: #334155;
      font-size: 12px;
      line-height: 1;
    }
    .airport-chip span {
      color: #64748b;
      font-size: 13px;
      line-height: 1;
    }
    .copy-button {
      display: inline-grid;
      place-items: center;
      width: 34px;
      height: 34px;
      padding: 0;
      border-color: #cbd5e1;
      background: #ffffff;
      color: #0f766e;
    }
    .copy-button svg {
      width: 18px;
      height: 18px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .actions { display: flex; gap: 8px; }
    .inline { display: flex; grid-template-columns: none; align-items: center; gap: 6px; margin: 0; }
    .inline input { width: auto; }
  `;
}
