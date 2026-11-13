import type { FareEstimate } from "../shared/communityHistory";
import { createContentTranslator } from "../shared/contentI18n";
import {
  buildFarePreview,
  type FareClassPreview,
  type FarePreviewContext,
  type FarePreviewModel,
  type FarePreviewSelection,
} from "../shared/farePreview";
import { localizedMileageProgramDisplay } from "../shared/mileageEarnings";
import type { AppLanguage, ExtensionSettings } from "../shared/types";

export const FARE_PREVIEW_PORTAL_SELECTOR = "[data-moo-flights-fare-preview]";

type PreviewState = {
  identity: string;
  context: FarePreviewContext;
  estimate: FareEstimate;
  settings: ExtensionSettings;
  language: AppLanguage;
  selection: FarePreviewSelection;
  model: FarePreviewModel;
  signature: string;
  portal?: HTMLElement;
  close?: (restoreFocus?: boolean) => void;
  verify: (url: string) => void;
};
const previews = new WeakMap<HTMLElement, PreviewState>();
const openedPreviews = new Map<HTMLElement, () => void>();

export function reconcileFarePreview(
  existing: Element | null,
  identity: string,
  context: FarePreviewContext,
  estimate: FareEstimate,
  settings: ExtensionSettings,
  language: AppLanguage,
  verify: (url: string) => void,
): HTMLElement {
  pruneFarePreviews();
  const host = existing instanceof HTMLElement ? existing : document.createElement("span");
  const signature = JSON.stringify([
    context,
    estimate,
    settings.preferredFrequentFlyerPrograms,
    settings.frequentFlyerProgramTiers,
    language,
  ]);
  let state = previews.get(host);
  if (state?.identity !== identity) {
    state?.close?.(false);
    state = {
      identity,
      context,
      estimate,
      settings,
      language,
      verify,
      selection: {},
      signature: "",
      model: buildFarePreview(context, estimate, settings),
    };
    previews.set(host, state);
  }
  if (state.signature === signature) return host;
  state.context = context;
  state.estimate = estimate;
  state.settings = settings;
  state.language = language;
  state.verify = verify;
  state.signature = signature;
  state.model = buildFarePreview(context, estimate, settings, state.selection);
  host.setAttribute("data-moo-flights-fare-estimate", "1");
  if (!host.shadowRoot) {
    host.attachShadow({ mode: "open" });
    for (const event of ["click", "dblclick", "pointerdown", "keydown"])
      host.addEventListener(event, (e) => e.stopPropagation());
  }
  renderSummary(host, state);
  if (state.portal) renderPanel(host, state);
  return host;
}

function textEscape(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] || character,
  );
}
function earningsText(row: FareClassPreview, language: AppLanguage): string {
  const t = createContentTranslator(language);
  const miles = row.earning?.estimatedMiles;
  if (typeof miles === "number" && Number.isFinite(miles))
    return t("farePreviewMiles", { miles: new Intl.NumberFormat(language).format(miles) });
  return t(row.earning?.requiresEligibleFare ? "farePreviewEligibleFare" : "farePreviewUnavailable");
}
function summaryText(state: PreviewState): string {
  const { model, language, selection } = state;
  const t = createContentTranslator(language);
  if (selection.bookingClass)
    return t("farePreviewSelected", {
      class: model.selected.bookingClass,
      earnings: earningsText(model.selected, language),
    });
  if (model.range) {
    const format = new Intl.NumberFormat(language);
    const miles =
      model.range.min === model.range.max
        ? format.format(model.range.min)
        : `${format.format(model.range.min)}–${format.format(model.range.max)}`;
    return t("farePreviewMiles", { miles });
  }
  if (model.classes.length && model.classes.every((row) => row.earning?.requiresEligibleFare))
    return t("farePreviewEligibleFare");
  return t(
    model.classes.some((row) => row.earning?.estimatedMiles !== undefined)
      ? "farePreviewIncomplete"
      : "farePreviewUnavailable",
  );
}
function renderSummary(host: HTMLElement, state: PreviewState): void {
  const root = host.shadowRoot;
  if (!root) return;
  const t = createContentTranslator(state.language);
  root.innerHTML = `<style>${summaryStyles}</style>
    <span class="estimate">${textEscape(t("estimatedFareClasses", { classes: state.model.classes.map((row) => row.bookingClass).join(" / ") }))}</span>
    <span class="earnings">${textEscape(localizedMileageProgramDisplay(state.model.program, state.language))}${state.model.program ? ": " : ""}${textEscape(summaryText(state))}</span>
    <button type="button" aria-haspopup="dialog" aria-expanded="${!!state.portal}">${textEscape(t("compareFareClasses"))}</button>`;
  root.querySelector("button")?.addEventListener("click", () => {
    if (state.portal) state.close?.();
    else openPanel(host, state);
  });
}
function updateSelection(host: HTMLElement, state: PreviewState, selection: FarePreviewSelection): void {
  state.selection = { ...state.selection, ...selection };
  state.model = buildFarePreview(state.context, state.estimate, state.settings, state.selection);
  renderSummary(host, state);
  renderPanel(host, state);
}
function renderPanel(host: HTMLElement, state: PreviewState): void {
  const root = state.portal?.shadowRoot;
  if (!root) return;
  const t = createContentTranslator(state.language);
  const { model } = state;
  root.innerHTML = `<style>${panelStyles}</style>
    <section role="dialog" aria-label="${textEscape(t("farePreviewDialog"))}">
      <header><strong>${textEscape(t("farePreviewDialog"))}</strong><button type="button" class="close" aria-label="${textEscape(t("farePreviewClose"))}">×</button></header>
      <label>${textEscape(t("farePreviewProgram"))}<select data-program ${model.programs.length ? "" : "disabled"}>${model.programs.length ? "" : `<option>${textEscape(t("farePreviewUnavailable"))}</option>`}${model.programs.map((program) => `<option value="${textEscape(program)}" ${program === model.program ? "selected" : ""}>${textEscape(localizedMileageProgramDisplay(program, state.language))}</option>`).join("")}</select></label>
      <table><thead><tr><th>${textEscape(t("farePreviewTableClass"))}</th><th>${textEscape(t("farePreviewTableEarnings"))}</th></tr></thead><tbody>${model.classes.map((row) => `<tr><td><button type="button" data-class="${row.bookingClass}" aria-pressed="${row.bookingClass === model.selected.bookingClass}">${row.bookingClass}${row.bookingClass === model.mostLikelyClass ? ` · ${textEscape(t("farePreviewMostLikely"))}` : ""}</button></td><td>${textEscape(earningsText(row, state.language))}</td></tr>`).join("")}</tbody></table>
      <label>${textEscape(t("farePreviewClass"))}<select data-class-picker>${Array.from({ length: 26 }, (_, index) =>
        String.fromCharCode(65 + index),
      )
        .map((code) => `<option ${code === model.selected.bookingClass ? "selected" : ""}>${code}</option>`)
        .join("")}</select></label>
      <p class="selected" aria-live="polite">${textEscape(t("farePreviewSelected", { class: model.selected.bookingClass, earnings: earningsText(model.selected, state.language) }))}</p>
      <p class="note">${textEscape(t("farePreviewNote"))}</p>
      <p class="note">${textEscape(t("farePreviewLocal"))}</p>
      <a href="${textEscape(model.matrixUrl)}" target="_blank" rel="noopener noreferrer">${textEscape(t("farePreviewCheck"))}</a>
    </section>`;
  root.querySelector(".close")?.addEventListener("click", () => state.close?.());
  root.querySelector<HTMLSelectElement>("[data-program]")?.addEventListener("change", (event) => {
    updateSelection(host, state, { program: (event.currentTarget as HTMLSelectElement).value });
    root.querySelector<HTMLSelectElement>("[data-program]")?.focus();
  });
  root.querySelector<HTMLSelectElement>("[data-class-picker]")?.addEventListener("change", (event) => {
    updateSelection(host, state, { bookingClass: (event.currentTarget as HTMLSelectElement).value });
    root.querySelector<HTMLSelectElement>("[data-class-picker]")?.focus();
  });
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-class]"))
    button.addEventListener("click", () => {
      const code = button.dataset.class;
      updateSelection(host, state, { bookingClass: code });
      root.querySelector<HTMLButtonElement>(`[data-class="${code}"]`)?.focus();
    });
  root.querySelector("a")?.addEventListener("click", (event) => {
    if (
      !(event instanceof MouseEvent) ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    state.verify(model.matrixUrl);
  });
}
function openPanel(host: HTMLElement, state: PreviewState): void {
  // A body-level portal avoids clipping the preview inside Google's price containers.
  for (const other of document.querySelectorAll<HTMLElement>("[data-moo-flights-fare-estimate]"))
    if (other !== host) previews.get(other)?.close?.(false);
  const portal = document.createElement("div");
  portal.setAttribute("data-moo-flights-fare-preview", "1");
  portal.attachShadow({ mode: "open" });
  document.body.append(portal);
  state.portal = portal;
  for (const event of ["click", "dblclick", "pointerdown", "keydown"])
    portal.addEventListener(event, (e) => e.stopPropagation());
  state.close = (restoreFocus = true) => {
    portal.remove();
    state.portal = undefined;
    state.close = undefined;
    openedPreviews.delete(host);
    document.removeEventListener("pointerdown", outside, true);
    document.removeEventListener("keydown", onEscape, true);
    window.removeEventListener("scroll", scrolled, true);
    window.removeEventListener("resize", scrolled);
    renderSummary(host, state);
    if (restoreFocus && host.isConnected) host.shadowRoot?.querySelector("button")?.focus();
  };
  openedPreviews.set(host, () => state.close?.(false));
  const outside = (event: Event) => {
    const path = event.composedPath();
    if (!path.includes(host) && !path.includes(portal)) state.close?.(false);
  };
  const onEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      state.close?.();
    }
  };
  const scrolled = (event: Event) => {
    if (event.composedPath().includes(portal)) return;
    state.close?.(false);
  };
  document.addEventListener("pointerdown", outside, true);
  document.addEventListener("keydown", onEscape, true);
  window.addEventListener("scroll", scrolled, true);
  window.addEventListener("resize", scrolled);
  renderSummary(host, state);
  renderPanel(host, state);
  const rect = host.getBoundingClientRect();
  const width = Math.min(340, window.innerWidth - 24);
  portal.style.cssText = `position:fixed;z-index:2147483647;width:${width}px;left:${Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width))}px;top:12px;`;
  const height = portal.getBoundingClientRect().height;
  const top =
    rect.bottom + 6 + height < window.innerHeight - 12 ? rect.bottom + 6 : Math.max(12, rect.top - height - 6);
  portal.style.top = `${top}px`;
  portal.shadowRoot?.querySelector<HTMLSelectElement>("select:not(:disabled)")?.focus({ preventScroll: true });
}

export function pruneFarePreviews(): void {
  for (const [host, close] of openedPreviews) if (!host.isConnected) close();
}

export function removeFarePreviews(): void {
  for (const close of openedPreviews.values()) close();
  for (const host of document.querySelectorAll<HTMLElement>("[data-moo-flights-fare-estimate]"))
    previews.get(host)?.close?.(false);
  for (const portal of document.querySelectorAll(FARE_PREVIEW_PORTAL_SELECTOR)) portal.remove();
}

const summaryStyles = `
  :host { display:block; position:relative; max-width:260px; margin-top:6px; text-align:left; white-space:normal; color:#475569; font:11px/1.4 system-ui,sans-serif; }
  span { display:block; } .estimate { font-weight:650; color:#334155; } .earnings { margin:2px 0; }
  button { border:0; padding:2px 0; background:none; color:#087f8c; font:600 11px/1.4 system-ui,sans-serif; text-decoration:underline; cursor:pointer; }
  button:focus-visible { outline:2px solid #087f8c; outline-offset:2px; }
`;
const panelStyles = `
  :host { display:block; color:#172033; font:12px/1.45 system-ui,sans-serif; text-align:left; }
  * { box-sizing:border-box; } section { padding:14px; border:1px solid #cbd5e1; border-radius:10px; background:#fff; box-shadow:0 10px 32px #17203330; max-height:calc(100vh - 24px); overflow:auto; }
  header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:10px; }
  button,select { font:inherit; } button { cursor:pointer; } .close { background:transparent; border:0; font-size:20px; padding:0 4px; }
  label { display:block; font-weight:600; margin:10px 0; } select { display:block; margin-top:4px; width:100%; padding:6px; border:1px solid #cbd5e1; border-radius:5px; color:#172033; background:#fff; }
  table { width:100%; border-collapse:collapse; } th,td { text-align:left; padding:6px 3px; border-bottom:1px solid #e2e8f0; } th { color:#64748b; font-weight:500; }
  td button { border:1px solid transparent; padding:4px 6px; border-radius:5px; background:transparent; color:#172033; } button[aria-pressed=true] { border-color:#087f8c; background:#e8f7f6; }
  .selected { background:#f1f5f9; padding:8px; border-radius:5px; font-weight:600; } .note { color:#64748b; font-size:11px; } a { color:#087f8c; font-weight:600; }
  button:focus-visible,select:focus-visible,a:focus-visible { outline:2px solid #087f8c; outline-offset:2px; }
`;
