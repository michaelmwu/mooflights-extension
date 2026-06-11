// Runs in the page's MAIN world. Drives Google Flights' own airline filter UI on
// behalf of the isolated content script.
//
// Why a separate main-world script: synthetic pointer/mouse events dispatched from
// the isolated content-script world do not trigger Google's `jsaction` handlers
// (the popup never opens), whereas the same events dispatched from the page's own
// world do. So the isolated script computes *which* airlines to apply and asks this
// agent, over window.postMessage, to perform the clicks here.

const APPLY_CHANNEL = "mooflights:apply-airline-filter";
const RESULT_CHANNEL = "mooflights:airline-filter-result";
const INSTALLED_KEY = "__mooFlightsGoogleFlightsFilterAgentInstalled";

type AgentWindow = Window & { [INSTALLED_KEY]?: boolean };
type ApplyFilterRequest = {
  channel?: string;
  id?: string;
  names?: unknown;
  stopFilterValue?: unknown;
};

installAgent();

function installAgent(): void {
  const agentWindow = window as AgentWindow;
  if (agentWindow[INSTALLED_KEY]) return;
  agentWindow[INSTALLED_KEY] = true;

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data as ApplyFilterRequest | null;
    if (!data || data.channel !== APPLY_CHANNEL || typeof data.id !== "string") return;
    const names = Array.isArray(data.names)
      ? data.names.filter((name): name is string => typeof name === "string")
      : [];
    const stopFilterValue = typeof data.stopFilterValue === "number" ? data.stopFilterValue : null;
    const id = data.id;
    void applyFilters(names, stopFilterValue).then((applied) => {
      window.postMessage({ channel: RESULT_CHANNEL, id, applied }, "*");
    });
  });
}

async function applyFilters(names: string[], stopFilterValue: number | null): Promise<boolean> {
  const airlineApplied = names.length === 0 || (await applyAirlineFilter(names));
  const stopApplied = stopFilterValue === null || (await applyStopsFilter(stopFilterValue));
  return airlineApplied && stopApplied;
}

async function applyAirlineFilter(names: string[]): Promise<boolean> {
  if (names.length === 0) return false;
  const button = await waitForFilterButton("Airlines", 12000);
  if (!button) return false;

  return attemptApplyAirlineFilter(button, names);
}

async function attemptApplyAirlineFilter(button: HTMLElement, names: string[]): Promise<boolean> {
  if (!(await ensureFilterPopup(button, () => collectAirlineOptions().length > 0, 5000))) return false;

  const options = await waitForStableAirlineOptions(names, 8000);
  const targets = options && matchAllAirlines(names, options);
  if (!targets) {
    closeFilterPopup();
    return false;
  }

  const firstOnly = findOnlyButton(targets[0] || "");
  if (!firstOnly) {
    closeFilterPopup();
    return false;
  }

  // "Only" the first carrier (deselects every other airline in one click), then
  // re-add the rest. The popup re-renders after each toggle, so re-query by value.
  const hrefBefore = location.href;
  simulateClick(firstOnly);
  await delay(300);
  for (let index = 1; index < targets.length; index += 1) {
    clickAirlineCheckbox(targets[index] || "");
    await delay(180);
  }

  // Google applies the filter live and rewrites the URL while the popup is still
  // open. Wait for that commit BEFORE dismissing — closing the popup before the
  // commit lands reverts the selection (same as Escape). Clicking outside then
  // just dismisses the popup and keeps the committed filter.
  const committed = await waitForHrefChange(hrefBefore, 7000);
  closeFilterPopup();
  return committed;
}

async function applyStopsFilter(stopFilterValue: number): Promise<boolean> {
  const button = await waitForFilterButton("Stops", 12000);
  if (!button) return false;
  if (!(await ensureFilterPopup(button, () => collectStopOptions().length > 0, 5000))) return false;

  const option = await waitForStopOption(stopFilterValue, 5000);
  if (!option) {
    closeFilterPopup();
    return false;
  }
  if (option.checked) {
    closeFilterPopup();
    return true;
  }

  const hrefBefore = location.href;
  simulateClick(option.element);
  const committed = await waitForHrefChange(hrefBefore, 7000);
  closeFilterPopup();
  return committed;
}

async function waitForHrefChange(previousHref: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (location.href !== previousHref) return true;
    await delay(100);
  }
  return false;
}

interface AirlineOption {
  value: string;
  checkbox: HTMLInputElement;
  onlyButton: HTMLElement;
}

interface StopOption {
  value: number;
  checked: boolean;
  element: HTMLElement;
}

function collectAirlineOptions(): AirlineOption[] {
  const options: AirlineOption[] = [];
  const checkboxes = Array.from(document.querySelectorAll<HTMLInputElement>("input[type='checkbox']"));
  for (const onlyButton of Array.from(document.querySelectorAll<HTMLElement>("[aria-label$=' only']"))) {
    const value = (onlyButton.getAttribute("aria-label") || "").replace(/ only$/, "");
    if (!value) continue;
    const checkbox = checkboxes.find((input) => input.getAttribute("value") === value);
    if (checkbox) options.push({ value, checkbox, onlyButton });
  }
  return options;
}

function collectStopOptions(): StopOption[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-value], input[type='radio'][value]"))
    .map((element) => {
      const rawValue = element.getAttribute("data-value") || element.getAttribute("value") || "";
      if (!/^\d+$/.test(rawValue)) return null;
      const target =
        element.closest<HTMLElement>("[role='radio'], label, div[role='presentation']") ||
        (element instanceof HTMLElement ? element : null);
      if (!target) return null;
      return {
        value: Number(rawValue),
        checked: isCheckedFilterOption(element, target),
        element: target,
      };
    })
    .filter((option): option is StopOption => Boolean(option));
}

// Waits until the popup has rendered all requested airlines AND the option count
// has stopped growing (the list renders incrementally), so clicks land on a fully
// initialized popup.
async function waitForStableAirlineOptions(names: string[], timeoutMs: number): Promise<AirlineOption[] | null> {
  const deadline = Date.now() + timeoutMs;
  let previousCount = -1;
  while (Date.now() < deadline) {
    const options = collectAirlineOptions();
    const matchedAll = names.every((name) => matchAirlineOption(name, options));
    if (matchedAll && options.length === previousCount && options.length > 0) return options;
    previousCount = options.length;
    await delay(150);
  }
  const options = collectAirlineOptions();
  return names.every((name) => matchAirlineOption(name, options)) ? options : null;
}

function matchAllAirlines(names: string[], options: AirlineOption[]): string[] | null {
  const matched = names.map((name) => matchAirlineOption(name, options));
  if (!matched.every((value): value is string => Boolean(value))) return null;
  return Array.from(new Set(matched as string[]));
}

function matchAirlineOption(name: string, options: AirlineOption[]): string | null {
  const target = normalizeAirlineName(name);
  if (!target) return null;
  const exact = options.find((option) => normalizeAirlineName(option.value) === target);
  if (exact) return exact.value;
  const fuzzy = options.find((option) => {
    const value = normalizeAirlineName(option.value);
    return value.length >= 3 && (value.includes(target) || target.includes(value));
  });
  return fuzzy ? fuzzy.value : null;
}

function findOnlyButton(value: string): HTMLElement | null {
  return collectAirlineOptions().find((option) => option.value === value)?.onlyButton || null;
}

function clickAirlineCheckbox(value: string): void {
  const option = collectAirlineOptions().find((entry) => entry.value === value);
  if (option && !option.checkbox.checked) simulateClick(option.checkbox);
}

function findFilterButton(name: string): HTMLElement | null {
  const buttons = Array.from(document.querySelectorAll<HTMLElement>("button[aria-label], [role='button'][aria-label]"));
  return (
    buttons.find((button) => {
      const label = button.getAttribute("aria-label") || "";
      return label === name || label.startsWith(`${name},`) || label.startsWith(`${name} `);
    }) || null
  );
}

async function waitForFilterButton(name: string, timeoutMs: number): Promise<HTMLElement | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const button = findFilterButton(name);
    if (button) return button;
    await delay(150);
  }
  return null;
}

async function ensureFilterPopup(button: HTMLElement, hasOptions: () => boolean, timeoutMs: number): Promise<boolean> {
  if (!hasOptions()) simulateClick(button);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (hasOptions()) return true;
    await delay(150);
  }
  return false;
}

async function waitForStopOption(stopFilterValue: number, timeoutMs: number): Promise<StopOption | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const option = collectStopOptions().find((entry) => entry.value === stopFilterValue);
    if (option) return option;
    await delay(150);
  }
  return null;
}

function isCheckedFilterOption(element: HTMLElement, target: HTMLElement): boolean {
  if (element instanceof HTMLInputElement) return element.checked;
  return element.getAttribute("aria-checked") === "true" || target.getAttribute("aria-checked") === "true";
}

function closeFilterPopup(): void {
  simulateClick(document.body);
}

function simulateClick(element: Element): void {
  const init: PointerEventInit = { bubbles: true, cancelable: true, view: window, button: 0 };
  element.dispatchEvent(new PointerEvent("pointerdown", init));
  element.dispatchEvent(new MouseEvent("mousedown", init));
  element.dispatchEvent(new PointerEvent("pointerup", init));
  element.dispatchEvent(new MouseEvent("mouseup", init));
  if (element instanceof HTMLElement) element.click();
}

function normalizeAirlineName(value: string): string {
  return (value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
