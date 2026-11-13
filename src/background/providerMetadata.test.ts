import { vi } from "vitest";

let data: Record<string, unknown>;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  data = {};
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("chrome", {
    permissions: { contains: vi.fn(async () => true) },
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: structuredClone(data[key]) })),
        set: vi.fn(async (patch: Record<string, unknown>) => Object.assign(data, structuredClone(patch))),
      },
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("aborts a hung metadata fetch and backs off across a worker reload", async () => {
  fetchMock.mockImplementation(
    (_url, options) =>
      new Promise((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("aborted")))),
  );
  const { fetchProviderMetadataWithCache } = await import("./providerMetadata");
  const pending = fetchProviderMetadataWithCache("https://api.example.com");
  await vi.advanceTimersByTimeAsync(5000);
  expect(await pending).toEqual([]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  vi.resetModules();
  const fresh = await import("./providerMetadata");
  expect(await fresh.fetchProviderMetadataWithCache("https://api.example.com")).toEqual([]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ providers: [{ providerId: "kayak" }] }) });
  expect(await fresh.fetchProviderMetadataWithCache("https://api.example.com")).toEqual([{ providerId: "kayak" }]);
});
it("shares concurrent requests and returns a cached successful result", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ providers: [{ providerId: "kayak" }] }) });
  const { fetchProviderMetadataWithCache } = await import("./providerMetadata");
  const results = await Promise.all([
    fetchProviderMetadataWithCache("https://api.example.com"),
    fetchProviderMetadataWithCache("https://api.example.com"),
  ]);
  expect(results[0]).toEqual(results[1]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(await fetchProviderMetadataWithCache("https://api.example.com")).toEqual(results[0]);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
