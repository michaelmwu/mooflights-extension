import { historyBaseUrl } from "../shared/communitySettings";
import type { RemoteProviderMetadata } from "../shared/types";
import { createSerialQueue } from "./serialQueue";

const METADATA_CACHE_KEY = "mooFlightsProviderMetadataCache";
const RETRY_INTERVAL_MS = 5 * 60 * 1000;
const serialize = createSerialQueue();
const pending = new Map<string, Promise<RemoteProviderMetadata[]>>();
type CacheEntry = { attemptedAt: number; providers: RemoteProviderMetadata[] };

function cacheEntries(value: unknown): Record<string, CacheEntry> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, item]) =>
        item && typeof item === "object" && Number.isFinite(item.attemptedAt) && Array.isArray(item.providers),
    ),
  );
}

/** Cache attempts as well as successes, so worker restarts do not cause a retry storm. */
export async function fetchProviderMetadataWithCache(baseUrl: string): Promise<RemoteProviderMetadata[]> {
  const origin = historyBaseUrl(baseUrl);
  if (!origin || !chrome.permissions?.contains || !(await chrome.permissions.contains({ origins: [`${origin}/*`] })))
    return [];
  const existing = pending.get(origin);
  if (existing) return existing;
  const operation = (async () => {
    const cached = await serialize(async () => {
      const stored = await chrome.storage.local.get(METADATA_CACHE_KEY);
      const entries = cacheEntries(stored[METADATA_CACHE_KEY]);
      const previous = entries[origin];
      const now = Date.now();
      if (previous && now >= previous.attemptedAt && now - previous.attemptedAt < RETRY_INTERVAL_MS)
        return previous.providers;
      entries[origin] = { attemptedAt: now, providers: [] };
      const bounded = Object.fromEntries(
        Object.entries(entries)
          .sort((a, b) => b[1].attemptedAt - a[1].attemptedAt)
          .slice(0, 8),
      );
      await chrome.storage.local.set({ [METADATA_CACHE_KEY]: bounded });
      return null;
    });
    if (cached) return cached;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(`${origin}/api/extension/v1/providers`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) return [];
      const body = (await response.json()) as { providers?: unknown };
      const providers = Array.isArray(body.providers)
        ? body.providers
            .filter(
              (item): item is RemoteProviderMetadata =>
                !!item && typeof item === "object" && typeof item.providerId === "string",
            )
            .slice(0, 1000)
        : [];
      await serialize(async () => {
        const stored = await chrome.storage.local.get(METADATA_CACHE_KEY);
        const entries = cacheEntries(stored[METADATA_CACHE_KEY]);
        entries[origin] = { attemptedAt: Date.now(), providers };
        await chrome.storage.local.set({ [METADATA_CACHE_KEY]: entries });
      });
      return providers;
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  })();
  pending.set(origin, operation);
  try {
    return await operation;
  } finally {
    pending.delete(origin);
  }
}
