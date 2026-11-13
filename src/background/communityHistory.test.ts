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
    permissions: { contains: vi.fn(async () => true) },
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
  settings.communityHistory = { enabled: true, consentVersion: "community-v2", baseUrl: "https://api.example.com" };
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

it("requires fresh unified consent before sending usage data", async () => {
  settings.communityHistory = { enabled: true, consentVersion: "history-v1", baseUrl: "https://api.example.com" };
  const { recordUsage } = await import("./communityHistory");
  await recordUsage({ eventName: "fare-preview.opened", surface: "google-flights-search" });
  expect(fetchMock).not.toHaveBeenCalled();
});
it("uses one stored contributor credential and synchronizes combined consent before analytics", async () => {
  settings.communityHistory = { enabled: true, consentVersion: "community-v2", baseUrl: "https://api.example.com" };
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
  settings.communityHistory = { enabled: true, consentVersion: "community-v2", baseUrl: "https://api.example.com" };
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
  });
  await recordUsage({ eventName: "fare-preview.opened", surface: "google-flights-search" });
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/usage-events"))).toHaveLength(1);
});
