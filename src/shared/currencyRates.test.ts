import { vi } from "vitest";

let stored: Record<string, unknown>;
let fetchMock: ReturnType<typeof vi.fn>;
const now = 200_000_000;
const stale = { base: "USD", fetchedAt: now - 25 * 60 * 60 * 1000, source: "cache", rates: { USD: 1, JPY: 150 } };

beforeEach(() => {
  vi.resetModules();
  stored = {};
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
        set: vi.fn(async (patch: Record<string, unknown>) => Object.assign(stored, patch)),
      },
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("uses a fresh local rate cache without a network request", async () => {
  stored.muTravelUsdCurrencyRates = { ...stale, fetchedAt: now };
  const { loadUsdCurrencyRates } = await import("./currencyRates");
  expect(await loadUsdCurrencyRates(now)).toMatchObject({ rates: { JPY: 150 } });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("persists a failed attempt so later page loads return stale rates during backoff", async () => {
  stored.muTravelUsdCurrencyRates = stale;
  fetchMock.mockRejectedValue(new Error("offline"));
  const first = await import("./currencyRates");
  expect(await first.loadUsdCurrencyRates(now)).toMatchObject({ fetchedAt: stale.fetchedAt });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(stored.muTravelUsdCurrencyRatesLastFailure).toBe(now);
  vi.resetModules();
  const nextPage = await import("./currencyRates");
  expect(await nextPage.loadUsdCurrencyRates(now + 60_000)).toMatchObject({ fetchedAt: stale.fetchedAt });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await nextPage.loadUsdCurrencyRates(now + 31 * 60_000);
  expect(fetchMock).toHaveBeenCalledTimes(4);
});

it("aborts each hanging source and falls back without blocking forever", async () => {
  vi.useFakeTimers();
  stored.muTravelUsdCurrencyRates = stale;
  fetchMock.mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
  );
  const { loadUsdCurrencyRates } = await import("./currencyRates");
  const pending = loadUsdCurrencyRates(now);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(await pending).toMatchObject({ fetchedAt: stale.fetchedAt });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls.every((call) => call[1].signal.aborted)).toBe(true);
});

it("shares concurrent work and caches a valid fallback response", async () => {
  fetchMock
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ rates: { jpy: 160 } }) });
  const { loadUsdCurrencyRates } = await import("./currencyRates");
  const [first, second] = await Promise.all([loadUsdCurrencyRates(now), loadUsdCurrencyRates(now)]);
  expect(first).toEqual(second);
  expect(first).toMatchObject({ rates: { JPY: 160 }, source: "fxratesapi" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(stored.muTravelUsdCurrencyRates).toMatchObject({ fetchedAt: now });
});

it("does not suppress a different tab while the first refresh is pending", async () => {
  let finishFirst!: (response: unknown) => void;
  fetchMock
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishFirst = resolve;
        }),
    )
    .mockResolvedValue({ ok: true, json: async () => ({ usd: { jpy: 160 } }) });
  const firstTab = await import("./currencyRates");
  const first = firstTab.loadUsdCurrencyRates(now);
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(stored.muTravelUsdCurrencyRatesLastFailure).toBeUndefined();
  vi.resetModules();
  const secondTab = await import("./currencyRates");
  expect(await secondTab.loadUsdCurrencyRates(now + 100)).toMatchObject({ rates: { JPY: 160 } });
  finishFirst({ ok: true, json: async () => ({ usd: { jpy: 160 } }) });
  expect(await first).toMatchObject({ rates: { JPY: 160 } });
});
