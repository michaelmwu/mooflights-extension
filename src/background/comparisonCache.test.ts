import { vi } from "vitest";

let stored: Record<string, unknown>;
beforeEach(() => {
  vi.resetModules();
  stored = {};
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: structuredClone(stored[key]) })),
        set: vi.fn(async (patch: Record<string, unknown>) => {
          Object.assign(stored, patch);
        }),
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

it("serializes concurrent updates from different content tabs without losing entries", async () => {
  const { updateComparisonCache } = await import("./comparisonCache");
  await Promise.all([
    updateComparisonCache({ cacheKind: "booking", entryKey: "route-a", entry: { results: [], cachedAt: 1000 } }, 1000),
    updateComparisonCache({ cacheKind: "booking", entryKey: "route-b", entry: { results: [], cachedAt: 1001 } }, 1001),
  ]);
  expect(Object.keys(stored.muTravelGoogleFlightsCountryResults as object)).toEqual(["route-b", "route-a"]);
});

it("prunes expired entries while keeping the search and booking maps separate", async () => {
  const { updateComparisonCache } = await import("./comparisonCache");
  stored.muTravelGoogleFlightsCountryResults = { stale: { results: [], cachedAt: 1 } };
  await updateComparisonCache(
    { cacheKind: "booking", entryKey: "fresh", entry: { results: [], cachedAt: 900000 } },
    900000,
  );
  await updateComparisonCache(
    { cacheKind: "search", entryKey: "search", entry: { results: [], cachedAt: 900000 } },
    900000,
  );
  expect(stored.muTravelGoogleFlightsCountryResults).toEqual({ fresh: { results: [], cachedAt: 900000 } });
  expect(stored.mooFlightsGoogleFlightsSearchComparisonCache).toEqual({ search: { results: [], cachedAt: 900000 } });
});

it("rejects arbitrary storage keys and recovers after a failed write", async () => {
  const { updateComparisonCache } = await import("./comparisonCache");
  await expect(
    updateComparisonCache({ cacheKind: "muTravelSettings", entryKey: "bad", entry: { results: [], cachedAt: 1000 } }),
  ).rejects.toThrow();
  vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error("storage unavailable"));
  await expect(
    updateComparisonCache({ cacheKind: "booking", entryKey: "first", entry: { results: [], cachedAt: 1000 } }, 1000),
  ).rejects.toThrow();
  await updateComparisonCache(
    { cacheKind: "booking", entryKey: "second", entry: { results: [], cachedAt: 1000 } },
    1000,
  );
  expect(stored.muTravelGoogleFlightsCountryResults).toEqual({ second: { results: [], cachedAt: 1000 } });
});
