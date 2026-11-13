import { vi } from "vitest";
import {
  COMPARISON_TABS_KEY,
  ComparisonTabRegistry,
  type ComparisonWorkerRecord,
  workerTabUrls,
} from "./comparisonTabs";

function fixture(initial: Record<string, unknown> = {}) {
  const data = structuredClone(initial);
  const storage = {
    get: vi.fn(async (key: string) => ({ [key]: structuredClone(data[key]) })),
    set: vi.fn(async (patch: Record<string, unknown>) => Object.assign(data, structuredClone(patch))),
    remove: vi.fn(async (key: string) => {
      delete data[key];
    }),
  };
  const tabs = new Map<number, { url: string }>();
  const get = vi.fn(async (id: number) => tabs.get(id) || null);
  const remove = vi.fn(async (id: number) => {
    tabs.delete(id);
  });
  return {
    data,
    storage,
    tabs,
    get,
    remove,
    registry: () => new ComparisonTabRegistry(storage as unknown as chrome.storage.StorageArea, get, remove),
  };
}
function record(sourceTabId = 1): ComparisonWorkerRecord {
  return { sourceTabId, requestId: "request", ...workerTabUrls("https://www.google.com/travel/flights/booking?gl=JP") };
}

it("sweeps owned leftover tabs on worker startup but leaves reused tab IDs alone", async () => {
  const owned = record();
  const reused = record();
  const setup = fixture({ [COMPARISON_TABS_KEY]: { "12": owned, "13": reused } });
  setup.tabs.set(12, { url: owned.url });
  setup.tabs.set(13, { url: "https://www.google.com/travel/flights/booking?gl=JP" });
  await setup.registry().ready;
  expect(setup.remove.mock.calls).toEqual([[12]]);
  expect(setup.tabs.has(13)).toBe(true);
  expect(setup.data[COMPARISON_TABS_KEY]).toBeUndefined();
});

it("persists ownership before parsing context and serializes concurrent registrations", async () => {
  const setup = fixture();
  const registry = setup.registry();
  const first = record();
  const second = record();
  await Promise.all([registry.remember(12, first), registry.remember(13, second)]);
  expect(Object.keys(setup.data[COMPARISON_TABS_KEY] as object)).toEqual(["12", "13"]);
  expect(await registry.context(12, first.url)).toEqual(first);
  expect(await registry.context(12, "https://example.com")).toBeNull();
  const writes = setup.storage.set.mock.calls.length;
  await registry.forget(99);
  expect(setup.storage.set).toHaveBeenCalledTimes(writes);
  await registry.forget(12);
  expect(Object.keys(setup.data[COMPARISON_TABS_KEY] as object)).toEqual(["13"]);
});

it("also cleans up a crash between tab creation and navigation", async () => {
  const owned = record();
  const setup = fixture({ [COMPARISON_TABS_KEY]: { "12": owned } });
  setup.tabs.set(12, { url: owned.stagingUrl });
  await setup.registry().ready;
  expect(setup.remove).toHaveBeenCalledWith(12);
});
