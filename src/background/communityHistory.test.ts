import { vi } from "vitest";
import type { MarketQuery } from "../shared/communityHistory";
import { DEFAULT_SETTINGS } from "../shared/storage";

const query: MarketQuery = {
  slices: [{ origin: "TPE", destination: "NRT" }],
  carriers: ["BR"],
  cabin: "COACH",
  tripType: "one-way",
  countries: ["US", "JP"],
};
let stored: Record<string, unknown>;
let settings: typeof DEFAULT_SETTINGS;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.resetModules();
  stored = {};
  settings = structuredClone(DEFAULT_SETTINGS);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("chrome", {
    runtime: { getManifest: () => ({ version: "0.0.10", manifest_version: 3 }) },
    permissions: { contains: vi.fn(async () => true), onRemoved: { addListener: vi.fn() } },
    storage: {
      onChanged: { addListener: vi.fn() },
      local: {
        get: vi.fn(async (key: string) => ({ [key]: key === "muTravelSettings" ? settings : stored[key] })),
        set: vi.fn(async (patch: Record<string, unknown>) => Object.assign(stored, patch)),
      },
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

it("makes no network requests when sharing is off", async () => {
  const { estimateFare, prioritizeCountries } = await import("./communityHistory");
  expect(await prioritizeCountries(query, query.countries)).toEqual(query.countries);
  expect(
    await estimateFare({
      origin: "TPE",
      destination: "NRT",
      carrier: "BR",
      cabin: "COACH",
      departureDate: "2027-01-01",
      currency: "USD",
      price: 200,
      tripType: "one-way",
      passengerCount: 1,
    }),
  ).toEqual({ status: "unknown", candidates: [] });
  expect(fetchMock).not.toHaveBeenCalled();
});
it("uses remote recommendations and falls back when the API fails", async () => {
  settings.communityHistory = { enabled: true, consentVersion: "community-v3", baseUrl: "https://api.example.com" };
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ recommendations: [{ country: "JP", relativePrice: 1, sampleCount: 3 }] }),
  });
  const { prioritizeCountries } = await import("./communityHistory");
  expect(await prioritizeCountries(query, query.countries)).toEqual(["JP", "US"]);
  fetchMock.mockRejectedValueOnce(new Error("offline"));
  expect(await prioritizeCountries(query, query.countries)).toEqual(query.countries);
  expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: "error", credentials: "omit" });
});
it("retains the deletion credential when revocation fails, then removes it after success", async () => {
  const url = "https://api.example.com";
  stored.mooFlightsHistoryContributorSessions = { [url]: "test-contributor-credential-for-unit-tests" };
  const { deleteSharedHistory } = await import("./communityHistory");
  fetchMock.mockRejectedValueOnce(new Error("offline"));
  await expect(deleteSharedHistory(url)).rejects.toThrow();
  expect(stored.mooFlightsHistoryContributorSessions).toHaveProperty(url);
  fetchMock.mockResolvedValueOnce({ ok: true, status: 204 });
  await deleteSharedHistory(url);
  expect(stored.mooFlightsHistoryContributorSessions).toEqual({});
});

it.each(["history-v1", "community-v2"])(
  "requires fresh unified consent after %s before sending usage data",
  async (consentVersion) => {
    settings.communityHistory = { enabled: true, consentVersion, baseUrl: "https://api.example.com" };
    const { recordUsage } = await import("./communityHistory");
    await recordUsage({ eventName: "fare-preview.opened", surface: "google-flights-search" });
    expect(fetchMock).not.toHaveBeenCalled();
  },
);
it("uses one stored contributor credential and synchronizes combined consent before analytics", async () => {
  settings.communityHistory = { enabled: true, consentVersion: "community-v3", baseUrl: "https://api.example.com" };
  stored.mooFlightsHistoryContributorSessions = {
    "https://api.example.com": "test-only-contributor-credential-1234567890",
  };
  fetchMock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  const { recordUsage } = await import("./communityHistory");
  await Promise.all([
    recordUsage({ eventName: "fare-preview.opened", surface: "google-flights-search" }),
    recordUsage({ eventName: "fare-preview.class-changed", surface: "google-flights-search" }),
  ]);
  const updates = fetchMock.mock.calls.filter(([, init]) => init.method === "PUT");
  expect(updates).toHaveLength(1);
  expect(JSON.parse(updates[0]?.[1].body)).toEqual({
    historyEnabled: true,
    analyticsEnabled: true,
    analyticsConsentVersion: "analytics-v1",
    retentionConsentVersion: "aggregate-v1",
  });
  const events = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/usage-events"));
  expect(events).toHaveLength(2);
  expect(JSON.parse(events[0]?.[1].body)).toMatchObject({
    contractVersion: "v1",
    extensionVersion: "0.0.10",
    browser: "chrome",
  });
  for (const [, init] of events) expect(JSON.parse(init.body)).not.toHaveProperty("contributorId");
});
it("turning off the one control stops events and disables both server-side purposes", async () => {
  settings.communityHistory = { enabled: true, consentVersion: "community-v3", baseUrl: "https://api.example.com" };
  stored.mooFlightsHistoryContributorSessions = {
    "https://api.example.com": "test-only-contributor-credential-1234567890",
  };
  fetchMock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({}) }));
  const { recordUsage } = await import("./communityHistory");
  await recordUsage({ eventName: "fare-preview.opened", surface: "google-flights-search" });
  settings.communityHistory.enabled = false;
  const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0]?.[0];
  listener?.({ muTravelSettings: { newValue: settings } }, "local");
  await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init.method === "PUT")).toHaveLength(2));
  const updates = fetchMock.mock.calls.filter(([, init]) => init.method === "PUT");
  expect(JSON.parse(updates.at(-1)?.[1].body)).toEqual({
    historyEnabled: false,
    analyticsEnabled: false,
    analyticsConsentVersion: null,
    retentionConsentVersion: null,
  });
  await recordUsage({ eventName: "fare-preview.opened", surface: "google-flights-search" });
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/usage-events"))).toHaveLength(1);
});

it.each(["fare", "countries", "search", "usage"] as const)(
  "does not start %s requests when consent changes during the permission check",
  async (operation) => {
    settings.communityHistory = { enabled: true, consentVersion: "community-v3", baseUrl: "https://api.example.com" };
    let finishPermission!: (allowed: boolean) => void;
    vi.mocked(chrome.permissions.contains).mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishPermission = resolve;
        }),
    );
    const client = await import("./communityHistory");
    const work =
      operation === "fare"
        ? client.estimateFare({
            origin: "TPE",
            destination: "NRT",
            carrier: "BR",
            cabin: "COACH",
            departureDate: "2027-01-01",
            currency: "USD",
            price: 200,
            tripType: "one-way",
            passengerCount: 1,
          })
        : operation === "countries"
          ? client.prioritizeCountries(query, query.countries)
          : operation === "search"
            ? client.prioritizeSearchCountries([query], query.countries)
            : client.recordUsage({ eventName: "fare-preview.opened", surface: "google-flights-search" });
    await vi.waitFor(() => expect(finishPermission).toBeTypeOf("function"));
    settings.communityHistory.enabled = false;
    const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0]?.[0];
    listener?.({ muTravelSettings: { newValue: settings } }, "local");
    finishPermission(true);
    await work;
    expect(fetchMock).not.toHaveBeenCalled();
  },
);

it("retries consent synchronization with current settings after an in-flight update is aborted", async () => {
  settings.communityHistory = { enabled: true, consentVersion: "community-v3", baseUrl: "https://api.example.com" };
  stored.mooFlightsHistoryContributorSessions = {
    "https://api.example.com": "test-only-contributor-credential-1234567890",
  };
  fetchMock.mockImplementationOnce(
    (_url, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
  );
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  const { recordUsage } = await import("./communityHistory");
  const usage = recordUsage({ eventName: "fare-preview.opened", surface: "google-flights-search" });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  settings.communityHistory.enabled = false;
  const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0]?.[0];
  listener?.({ muTravelSettings: { newValue: settings } }, "local");
  await usage;
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  const [url, init] = fetchMock.mock.calls[1] ?? [];
  expect(url).toBe("https://api.example.com/api/extension/v1/contributor-sessions/current");
  expect(init.method).toBe("PUT");
  expect(JSON.parse(init.body)).toEqual({
    historyEnabled: false,
    analyticsEnabled: false,
    analyticsConsentVersion: null,
    retentionConsentVersion: null,
  });
  expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/usage-events"))).toBe(false);
});

it("native data-consent revocation disables server purposes while retaining host access", async () => {
  settings.communityHistory = { enabled: true, consentVersion: "community-v3", baseUrl: "https://api.example.com" };
  stored.mooFlightsHistoryContributorSessions = {
    "https://api.example.com": "test-only-contributor-credential-1234567890",
  };
  let nativeGranted = true;
  vi.stubGlobal("browser", { permissions: { getAll: async () => ({ data_collection: [] }) } });
  vi.mocked(chrome.permissions.contains).mockImplementation(async (permissions) => {
    const data = (permissions as chrome.permissions.Permissions & { data_collection?: string[] }).data_collection;
    return !data || nativeGranted;
  });
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
  const { recordUsage } = await import("./communityHistory");
  await recordUsage({ eventName: "fare-preview.opened", surface: "google-flights-search" });
  nativeGranted = false;
  const listener = vi.mocked(chrome.permissions.onRemoved.addListener).mock.calls[0]?.[0];
  listener?.({});
  await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init.method === "PUT")).toHaveLength(2));
  const updates = fetchMock.mock.calls.filter(([, init]) => init.method === "PUT");
  expect(JSON.parse(updates.at(-1)?.[1].body)).toEqual({
    historyEnabled: false,
    analyticsEnabled: false,
    analyticsConsentVersion: null,
    retentionConsentVersion: null,
  });
  await recordUsage({ eventName: "fare-preview.opened", surface: "google-flights-search" });
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/usage-events"))).toHaveLength(1);
});

it("prepares only an authenticated deletion reference and keeps its credential private", async () => {
  const url = "https://api.example.com";
  const token = "test-only-contributor-credential-1234567890";
  settings.communityHistory = { enabled: false, consentVersion: "community-v3", baseUrl: url };
  stored.mooFlightsHistoryContributorSessions = { [url]: token };
  const reference = {
    status: "pending",
    requestId: "4b126830-53c8-4017-8bb9-42ef5ac39c92",
    requestedAt: "2026-11-14T01:00:00Z",
  };
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ...reference, contributorToken: token }) });
  const { prepareHistoryDeletionRequest } = await import("./communityHistory");
  expect(await prepareHistoryDeletionRequest(url)).toEqual(reference);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [target, init] = fetchMock.mock.calls[0] ?? [];
  expect(target).toBe(`${url}/api/extension/v1/contributor-sessions/current/deletion-request`);
  expect(init).toMatchObject({ method: "POST", headers: { "X-MooFlights-Contributor-Token": token } });
  expect(target).not.toContain(token);
  expect(init.body).toBeUndefined();
  expect(stored.mooFlightsHistoryContributorSessions).toEqual({ [url]: token });
});

it("does not create a session or contact the API to prepare a request without a credential", async () => {
  settings.communityHistory = { enabled: false, consentVersion: "community-v3", baseUrl: "https://api.example.com" };
  const { prepareHistoryDeletionRequest } = await import("./communityHistory");
  expect(await prepareHistoryDeletionRequest("https://api.example.com")).toEqual({ status: "no-contributions" });
  expect(await prepareHistoryDeletionRequest("")).toEqual({ status: "no-contributions" });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(chrome.permissions.contains).not.toHaveBeenCalled();
});

it("uses host permission for deletion requests even after native data consent is revoked", async () => {
  const url = "https://api.example.com";
  settings.communityHistory = { enabled: false, consentVersion: "community-v3", baseUrl: url };
  stored.mooFlightsHistoryContributorSessions = { [url]: "test-only-contributor-credential-1234567890" };
  vi.stubGlobal("browser", { permissions: { getAll: async () => ({ data_collection: [] }) } });
  vi.mocked(chrome.permissions.contains).mockImplementation(async (permissions) => !("data_collection" in permissions));
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      status: "pending",
      requestId: "4b126830-53c8-4017-8bb9-42ef5ac39c92",
      requestedAt: "2026-11-14T01:00:00Z",
    }),
  });
  const { prepareHistoryDeletionRequest } = await import("./communityHistory");
  expect((await prepareHistoryDeletionRequest(url)).status).toBe("pending");
  expect(chrome.permissions.contains).toHaveBeenCalledWith({ origins: [`${url}/*`] });
});

it("prepares deletion after aborting a pending session-consent update without creating another session", async () => {
  const url = "https://api.example.com";
  settings.communityHistory = { enabled: true, consentVersion: "community-v3", baseUrl: url };
  stored.mooFlightsHistoryContributorSessions = { [url]: "test-only-contributor-credential-1234567890" };
  fetchMock.mockImplementationOnce(
    (_url, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
  );
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      status: "pending",
      requestId: "4b126830-53c8-4017-8bb9-42ef5ac39c92",
      requestedAt: "2026-11-14T01:00:00Z",
    }),
  });
  const { recordUsage, prepareHistoryDeletionRequest } = await import("./communityHistory");
  const usage = recordUsage({ eventName: "fare-preview.opened", surface: "google-flights-search" });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  settings.communityHistory.enabled = false;
  expect((await prepareHistoryDeletionRequest(url)).status).toBe("pending");
  await usage;
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1]?.[0]).toBe(`${url}/api/extension/v1/contributor-sessions/current/deletion-request`);
});

it("rejects malformed deletion references and never re-registers an invalid credential during preparation", async () => {
  const url = "https://api.example.com";
  settings.communityHistory = { enabled: false, consentVersion: "community-v3", baseUrl: url };
  stored.mooFlightsHistoryContributorSessions = { [url]: "test-only-contributor-credential-1234567890" };
  const { prepareHistoryDeletionRequest } = await import("./communityHistory");
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ status: "pending", requestId: "not-a-reference", requestedAt: "bad-date" }),
  });
  await expect(prepareHistoryDeletionRequest(url)).rejects.toThrow("Invalid deletion request response");
  fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });
  await expect(prepareHistoryDeletionRequest(url)).resolves.toEqual({ status: "no-contributions" });
  expect(stored.mooFlightsHistoryContributorSessions).toEqual({});
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls.every(([target]) => String(target).endsWith("/deletion-request"))).toBe(true);
});

it("rejoins once on a fresh opt-in contribution when an administrator revoked the old credential", async () => {
  const url = "https://api.example.com";
  const oldToken = "test-only-revoked-contributor-credential-1234567890";
  const newToken = "test-only-new-contributor-credential-1234567890";
  settings.communityHistory = { enabled: true, consentVersion: "community-v3", baseUrl: url };
  stored.mooFlightsHistoryContributorSessions = { [url]: oldToken };
  fetchMock.mockResolvedValueOnce({ ok: false, status: 401 });
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ contributorToken: newToken }) });
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
  const { recordUsage } = await import("./communityHistory");
  await recordUsage({ eventName: "fare-preview.opened", surface: "google-flights-search" });
  expect(fetchMock.mock.calls.map(([target, init]) => [target, init.method])).toEqual([
    [`${url}/api/extension/v1/contributor-sessions/current`, "PUT"],
    [`${url}/api/extension/v1/contributor-sessions`, "POST"],
    [`${url}/api/extension/v1/usage-events`, "POST"],
  ]);
  expect(fetchMock.mock.calls[2]?.[1].headers["X-MooFlights-Contributor-Token"]).toBe(newToken);
  expect(stored.mooFlightsHistoryContributorSessions).toEqual({ [url]: newToken });
});

it("does not prepare a request after permission state changes during its host check", async () => {
  const url = "https://api.example.com";
  settings.communityHistory = { enabled: false, consentVersion: "community-v3", baseUrl: url };
  stored.mooFlightsHistoryContributorSessions = { [url]: "test-only-contributor-credential-1234567890" };
  let finishPermission!: (allowed: boolean) => void;
  vi.mocked(chrome.permissions.contains)
    .mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          finishPermission = resolve;
        }),
    )
    .mockImplementation(async () => false);
  const { prepareHistoryDeletionRequest } = await import("./communityHistory");
  const preparing = prepareHistoryDeletionRequest(url);
  const rejected = expect(preparing).rejects.toThrow("History API permission required");
  await vi.waitFor(() => expect(finishPermission).toBeTypeOf("function"));
  const listener = vi.mocked(chrome.permissions.onRemoved.addListener).mock.calls[0]?.[0];
  listener?.({ origins: [`${url}/*`] });
  finishPermission(true);
  await rejected;
  expect(fetchMock).not.toHaveBeenCalled();
});

it("keeps community-v2 contributions paused until explicit community-v3 acceptance includes retention consent", async () => {
  settings.communityHistory = { enabled: true, consentVersion: "community-v2", baseUrl: "https://api.example.com" };
  stored.mooFlightsHistoryContributorSessions = {
    "https://api.example.com": "test-only-contributor-credential-1234567890",
  };
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
  const { recordUsage } = await import("./communityHistory");
  await recordUsage({ eventName: "fare-preview.opened", surface: "google-flights-search" });
  expect(fetchMock).not.toHaveBeenCalled();
  settings.communityHistory.consentVersion = "community-v3";
  const listener = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0]?.[0];
  listener?.({ muTravelSettings: { newValue: settings } }, "local");
  await recordUsage({ eventName: "fare-preview.opened", surface: "google-flights-search" });
  const updates = fetchMock.mock.calls.filter(([, init]) => init.method === "PUT");
  expect(updates).toHaveLength(1);
  expect(JSON.parse(updates[0]?.[1].body)).toEqual({
    historyEnabled: true,
    analyticsEnabled: true,
    analyticsConsentVersion: "analytics-v1",
    retentionConsentVersion: "aggregate-v1",
  });
  expect(fetchMock.mock.calls.filter(([target]) => String(target).endsWith("/usage-events"))).toHaveLength(1);
});
