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
  settings.communityHistory = { enabled: true, baseUrl: "https://api.example.com" };
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
