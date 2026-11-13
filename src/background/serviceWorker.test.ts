import { vi } from "vitest";
import { COMPARISON_TABS_KEY, workerTabUrls } from "./comparisonTabs";

vi.mock("./communityHistory", () => ({
  contributeHistory: vi.fn(async () => undefined),
  deleteSharedHistory: vi.fn(async () => undefined),
  estimateFare: vi.fn(async () => ({ status: "unknown", candidates: [] })),
  prioritizeCountries: vi.fn(async (_query, countries) => countries),
  prioritizeSearchCountries: vi.fn(async (_queries, countries) => countries),
  recordUsage: vi.fn(async () => undefined),
}));

type Listener = (...args: any[]) => unknown;
function event() {
  const listeners = new Set<Listener>();
  return {
    addListener: (listener: Listener) => listeners.add(listener),
    removeListener: (listener: Listener) => listeners.delete(listener),
    emit: (...args: any[]) => {
      for (const listener of listeners) listener(...args);
    },
    listeners,
  };
}
let messages: ReturnType<typeof event>;
let removed: ReturnType<typeof event>;
let local: Record<string, unknown>;
let session: Record<string, unknown>;
let tabs: Map<number, Partial<chrome.tabs.Tab>>;
let api: any;
let loaded: boolean;
let hangRenderer: boolean;
let nextTab: number;
const baseUrl = "https://www.google.com/travel/flights/booking?tfs=fixture&gl=US&curr=USD";

function storage(data: Record<string, unknown>) {
  return {
    get: vi.fn(async (key: string) => ({ [key]: structuredClone(data[key]) })),
    set: vi.fn(async (patch: Record<string, unknown>) => Object.assign(data, structuredClone(patch))),
    remove: vi.fn(async (key: string) => {
      delete data[key];
    }),
  };
}
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  messages = event();
  removed = event();
  local = {};
  session = {};
  tabs = new Map([[1, { id: 1, url: baseUrl }]]);
  loaded = false;
  hangRenderer = false;
  nextTab = 100;
  api = {
    runtime: { onMessage: messages, onInstalled: event(), lastError: undefined },
    storage: { local: storage(local), session: storage(session) },
    tabs: {
      onRemoved: removed,
      onUpdated: event(),
      create: vi.fn((options, callback) => {
        const tab = { id: nextTab++, url: options.url, status: "loading" as const };
        tabs.set(tab.id, tab);
        callback(tab);
      }),
      update: vi.fn((id, options, callback) => {
        const tab = { ...tabs.get(id), url: options.url, status: loaded ? "complete" : "loading" };
        tabs.set(id, tab as chrome.tabs.Tab);
        callback(tab);
      }),
      get: vi.fn((id, callback) => {
        api.runtime.lastError = tabs.has(id) ? undefined : { message: "No tab" };
        callback(tabs.get(id));
        api.runtime.lastError = undefined;
      }),
      remove: vi.fn((id, callback) => {
        tabs.delete(id);
        removed.emit(id);
        callback();
      }),
      sendMessage: vi.fn((_id, message, callback) => {
        if (message.command === "parseBookingOptions") {
          if (!hangRenderer)
            callback({
              country: "JP",
              url: baseUrl,
              status: "ready",
              options: [{ provider: "Example", price: 100, currency: "USD", priceText: "$100", isDirect: true }],
            });
        } else callback?.({});
      }),
    },
  };
  vi.stubGlobal("chrome", api);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function send(message: unknown, tabId = 1) {
  const response = vi.fn();
  const result = [...messages.listeners][0](message, { tab: { id: tabId, url: tabs.get(tabId)?.url } }, response);
  return { response, result };
}

it("acknowledges immediately and cancels queued country tabs when the source closes", async () => {
  await import("./serviceWorker");
  const request = send({
    command: "compareGoogleFlightsCountries",
    requestId: "run",
    countries: ["JP", "CA"],
    baseUrl,
  });
  expect(request.result).toBe(false);
  expect(request.response).toHaveBeenCalledExactlyOnceWith({ ok: true, accepted: true });
  await vi.advanceTimersByTimeAsync(0);
  expect(api.tabs.create).toHaveBeenCalledTimes(1);
  expect(api.tabs.create.mock.calls[0][0].url).toMatch(/^about:blank#mooFlightsComparisonWorker=/);
  const context = send({ command: "getComparisonWorkerContext" }, 100);
  await vi.advanceTimersByTimeAsync(0);
  expect(context.response).toHaveBeenCalledWith({ worker: true, sourceTabId: 1, requestId: "run" });
  removed.emit(1);
  await vi.advanceTimersByTimeAsync(2000);
  expect(api.tabs.create).toHaveBeenCalledTimes(1);
  expect(api.tabs.remove).toHaveBeenCalledWith(100, expect.any(Function));
  expect(session[COMPARISON_TABS_KEY]).toBeUndefined();
  expect(
    api.tabs.sendMessage.mock.calls.some(
      ([, message]: any[]) =>
        message.command === "googleFlightsCountryComparisonComplete" && message.cancelled === true,
    ),
  ).toBe(true);
});

it("bounds a hung renderer and closes its comparison tab", async () => {
  loaded = true;
  hangRenderer = true;
  await import("./serviceWorker");
  send({ command: "compareGoogleFlightsCountries", requestId: "run", countries: ["JP"], baseUrl });
  await vi.advanceTimersByTimeAsync(20000);
  expect(api.tabs.remove).toHaveBeenCalledWith(100, expect.any(Function));
  expect(session[COMPARISON_TABS_KEY]).toBeUndefined();
  expect(
    api.tabs.sendMessage.mock.calls.some(
      ([, message]: any[]) => message.command === "googleFlightsCountryComparisonComplete",
    ),
  ).toBe(true);
});

it("sweeps marked leftover tabs before accepting new work after a worker restart", async () => {
  const urls = workerTabUrls(baseUrl);
  session[COMPARISON_TABS_KEY] = { "44": { sourceTabId: 1, requestId: "old", ...urls } };
  tabs.set(44, { id: 44, url: urls.url });
  await import("./serviceWorker");
  await vi.advanceTimersByTimeAsync(0);
  expect(api.tabs.remove).toHaveBeenCalledWith(44, expect.any(Function));
  expect(session[COMPARISON_TABS_KEY]).toBeUndefined();
});

it("consumes an ITA auto-open ticket once and avoids no-op writes", async () => {
  local.muTravelMatrixAutoOpenTabs = { "1": Date.now() + 100000 };
  await import("./serviceWorker");
  const first = send({ command: "consumeMatrixAutoOpenForTab" });
  const second = send({ command: "consumeMatrixAutoOpenForTab" });
  await vi.advanceTimersByTimeAsync(0);
  expect(first.response).toHaveBeenCalledWith({ ok: true });
  expect(second.response).toHaveBeenCalledWith({ ok: false });
  expect(api.storage.local.set).toHaveBeenCalledTimes(1);
  send({ command: "consumeMatrixAutoOpenForTab" });
  await vi.advanceTimersByTimeAsync(0);
  expect(api.storage.local.set).toHaveBeenCalledTimes(1);
});
