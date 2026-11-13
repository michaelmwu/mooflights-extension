import { ANALYTICS_CONSENT_VERSION, type UsageEvent, type UsageSignal } from "../shared/analytics";
import {
  type FareObservation,
  type FareQuery,
  type MarketObservation,
  type MarketQuery,
  orderHistoricalCountries,
  validatedFareEstimate,
} from "../shared/communityHistory";
import { COMMUNITY_CONSENT_VERSION, historyBaseUrl, loadCommunitySettings } from "../shared/communitySettings";

const SESSION_KEY = "mooFlightsHistoryContributorSessions";
const controllers = new Set<AbortController>();
const sessionRequests = new Map<string, Promise<string>>();
const synchronizedConsents = new Map<string, string>();

// Consent changes cancel outstanding reads/writes; there is no upload outbox.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.muTravelSettings) return;
  for (const controller of controllers) controller.abort();
  synchronizedConsents.clear();
  void synchronizeStoredConsent().catch(() => undefined);
});

async function configuredUrl(purpose: "history" | "analytics" | "consent" = "history"): Promise<string> {
  const { communityHistory } = await loadCommunitySettings();
  if (purpose !== "consent" && !communityHistory.enabled) return "";
  const url = historyBaseUrl(communityHistory.baseUrl);
  if (!url || !(await chrome.permissions.contains({ origins: [`${url}/*`] }))) return "";
  return url;
}

async function request(
  baseUrl: string,
  path: string,
  method: string,
  body?: unknown,
  token?: string,
): Promise<unknown> {
  const controller = new AbortController();
  controllers.add(controller);
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(`${baseUrl}/api/extension/v1/${path}`, {
      method,
      signal: controller.signal,
      credentials: "omit",
      redirect: "error",
      headers: { "Content-Type": "application/json", ...(token ? { "X-MooFlights-Contributor-Token": token } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error("History service unavailable.");
    return response.status === 204 ? null : await response.json();
  } finally {
    clearTimeout(timeout);
    controllers.delete(controller);
  }
}

async function consentPayload() {
  const { communityHistory } = await loadCommunitySettings();
  return {
    historyEnabled: communityHistory.enabled,
    analyticsEnabled: communityHistory.enabled,
    analyticsConsentVersion: communityHistory.enabled ? ANALYTICS_CONSENT_VERSION : null,
  };
}

async function synchronizeStoredConsent(): Promise<void> {
  const url = await configuredUrl("consent");
  if (!url) return;
  const stored = await chrome.storage.local.get(SESSION_KEY);
  const sessions = stored[SESSION_KEY] as Record<string, unknown> | undefined;
  if (typeof sessions?.[url] !== "string") return;
  await contributorToken(url, "consent");
}

async function contributorToken(
  url: string,
  purpose: "history" | "analytics" | "consent" = "history",
): Promise<string> {
  const pending = sessionRequests.get(url);
  if (pending) {
    await pending;
    return contributorToken(url, purpose);
  }
  const promise = (async () => {
    const stored = await chrome.storage.local.get(SESSION_KEY);
    const sessions = (stored[SESSION_KEY] || {}) as Record<string, string>;
    if ((await configuredUrl(purpose)) !== url) throw new Error("Sharing disabled.");
    const consent = await consentPayload();
    const signature = JSON.stringify(consent);
    if (typeof sessions[url] === "string") {
      if (synchronizedConsents.get(url) !== signature) {
        await request(url, "contributor-sessions/current", "PUT", consent, sessions[url]);
        synchronizedConsents.set(url, signature);
      }
      return sessions[url];
    }
    if (purpose === "consent") throw new Error("No contributor credential.");
    const result = await request(url, "contributor-sessions", "POST", {
      consentVersion: COMMUNITY_CONSENT_VERSION,
      ...consent,
    });
    const token = (result as { contributorToken?: unknown })?.contributorToken;
    if (typeof token !== "string" || token.length < 32 || token.length > 256)
      throw new Error("Invalid contributor response.");
    sessions[url] = token;
    await chrome.storage.local.set({ [SESSION_KEY]: sessions });
    synchronizedConsents.set(url, signature);
    return token;
  })();
  sessionRequests.set(url, promise);
  try {
    return await promise;
  } finally {
    sessionRequests.delete(url);
  }
}

export async function recordUsage(signal: UsageSignal): Promise<void> {
  const occurredAt = new Date().toISOString();
  try {
    const url = await configuredUrl("analytics");
    if (!url) return;
    const token = await contributorToken(url, "analytics");
    if ((await configuredUrl("analytics")) !== url) return;
    const manifest = chrome.runtime.getManifest();
    const event: UsageEvent = {
      ...signal,
      contractVersion: "v1",
      idempotencyKey: crypto.randomUUID(),
      extensionVersion: manifest.version,
      browser: manifest.manifest_version === 2 ? "firefox" : "chrome",
      occurredAt,
    };
    await request(url, "usage-events", "POST", event, token);
  } catch {
    /* Analytics is best-effort and has no persistent queue. */
  }
}

export async function contributeHistory(
  kind: "market" | "fare",
  observation: MarketObservation | FareObservation | null,
): Promise<void> {
  if (!observation) return;
  try {
    const url = await configuredUrl();
    if (!url) return;
    const token = await contributorToken(url);
    if ((await configuredUrl()) !== url) return;
    await request(url, `${kind}-observations`, "POST", observation, token);
  } catch {
    /* Sharing failure must not affect local features. */
  }
}

export async function prioritizeCountries(query: MarketQuery | null, countries: string[]): Promise<string[]> {
  if (!query) return countries;
  try {
    const url = await configuredUrl();
    if (!url) return countries;
    const response = await request(url, "market-recommendations", "POST", query);
    return orderHistoricalCountries(countries, response);
  } catch {
    return countries;
  }
}

export async function estimateFare(query: FareQuery): Promise<ReturnType<typeof validatedFareEstimate>> {
  try {
    const url = await configuredUrl();
    if (url) return validatedFareEstimate(await request(url, "fare-estimates", "POST", query));
  } catch {
    /* No estimate is a valid offline fallback. */
  }
  return { status: "unknown", candidates: [] };
}

export async function deleteSharedHistory(baseUrl: string): Promise<void> {
  const url = historyBaseUrl(baseUrl);
  if (!url) throw new Error("Invalid history API URL.");
  // Deletion is an explicit options action, allowed after sharing is disabled.
  for (const controller of controllers) controller.abort();
  const pending = sessionRequests.get(url);
  if (pending) await pending.catch(() => undefined);
  const stored = await chrome.storage.local.get(SESSION_KEY);
  const sessions = (stored[SESSION_KEY] || {}) as Record<string, string>;
  if (typeof sessions[url] !== "string") return;
  await request(url, "contributor-sessions/current", "DELETE", undefined, sessions[url]);
  delete sessions[url];
  synchronizedConsents.delete(url);
  await chrome.storage.local.set({ [SESSION_KEY]: sessions });
}

export async function prioritizeSearchCountries(queries: MarketQuery[], countries: string[]): Promise<string[]> {
  try {
    const url = await configuredUrl();
    if (!url || !queries.length) return countries;
    const responses = await Promise.all(
      queries.slice(0, 3).map(async (query) => {
        try {
          return await request(url, "market-recommendations", "POST", query);
        } catch {
          return null;
        }
      }),
    );
    const scores = new Map<string, { total: number; count: number }>();
    for (const response of responses) {
      const rows = (response as { recommendations?: unknown[] } | null)?.recommendations;
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        const item = row as { country?: unknown; relativePrice?: unknown; sampleCount?: unknown };
        if (
          !item ||
          typeof item.country !== "string" ||
          typeof item.relativePrice !== "number" ||
          !Number.isFinite(item.relativePrice) ||
          item.relativePrice < 1 ||
          typeof item.sampleCount !== "number" ||
          item.sampleCount < 3
        )
          continue;
        const current = scores.get(item.country) || { total: 0, count: 0 };
        scores.set(item.country, { total: current.total + item.relativePrice, count: current.count + 1 });
      }
    }
    return orderHistoricalCountries(countries, {
      recommendations: [...scores].map(([country, { total, count }]) => ({
        country,
        relativePrice: total / count,
        sampleCount: 3,
      })),
    });
  } catch {
    return countries;
  }
}
