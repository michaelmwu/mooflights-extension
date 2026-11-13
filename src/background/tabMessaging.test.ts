import { vi } from "vitest";
import { sendTabMessage } from "./tabMessaging";

let callback: (response: unknown) => void;
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("chrome", {
    runtime: {},
    tabs: {
      sendMessage: vi.fn((_id, _message, done) => {
        callback = done;
      }),
    },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("releases a hung renderer after five seconds and ignores its late response", async () => {
  const result = sendTabMessage(12, { command: "parseSearchResults" });
  const rejected = expect(result).rejects.toThrow("did not respond");
  await vi.advanceTimersByTimeAsync(5000);
  await rejected;
  callback({ results: [] });
  expect(vi.getTimerCount()).toBe(0);
});
it("cancels an outstanding message immediately when its run is aborted", async () => {
  const controller = new AbortController();
  const result = sendTabMessage(12, {}, controller.signal);
  const rejected = expect(result).rejects.toMatchObject({ name: "GoogleFlightsComparisonCancelled" });
  controller.abort();
  await rejected;
  expect(vi.getTimerCount()).toBe(0);
});
it("clears its deadline after a normal response", async () => {
  const result = sendTabMessage<{ status: string }>(12, {});
  callback({ status: "ready" });
  expect(await result).toEqual({ status: "ready" });
  expect(vi.getTimerCount()).toBe(0);
});
