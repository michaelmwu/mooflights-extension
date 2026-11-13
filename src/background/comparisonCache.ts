import { createSerialQueue } from "./serialQueue";

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_KEYS = {
  booking: "muTravelGoogleFlightsCountryResults",
  search: "mooFlightsGoogleFlightsSearchComparisonCache",
} as const;
const serialize = createSerialQueue();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

/** All content tabs update the shared cache through its single runtime owner. */
export function updateComparisonCache(payload: unknown, now = Date.now()): Promise<void> {
  if (
    !isRecord(payload) ||
    (payload.cacheKind !== "booking" && payload.cacheKind !== "search") ||
    typeof payload.entryKey !== "string" ||
    !payload.entryKey ||
    payload.entryKey.length > 100_000 ||
    !isRecord(payload.entry) ||
    !Array.isArray(payload.entry.results) ||
    typeof payload.entry.cachedAt !== "number" ||
    !Number.isFinite(payload.entry.cachedAt)
  ) {
    return Promise.reject(new Error("Invalid comparison cache entry."));
  }
  const storageKey = CACHE_KEYS[payload.cacheKind];
  const entryKey = payload.entryKey;
  const entry = payload.entry;
  return serialize(async () => {
    const stored = await chrome.storage.local.get(storageKey);
    const previous = isRecord(stored[storageKey]) ? stored[storageKey] : {};
    const entries = Object.entries({ ...previous, [entryKey]: entry })
      .filter(
        ([, value]) =>
          isRecord(value) &&
          typeof value.cachedAt === "number" &&
          Number.isFinite(value.cachedAt) &&
          now - value.cachedAt <= CACHE_TTL_MS,
      )
      .sort(
        ([, left], [, right]) =>
          Number((right as Record<string, unknown>).cachedAt) - Number((left as Record<string, unknown>).cachedAt),
      )
      .slice(0, 100);
    await chrome.storage.local.set({ [storageKey]: Object.fromEntries(entries) });
  });
}
