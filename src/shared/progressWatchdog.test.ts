import { vi } from "vitest";
import { createProgressWatchdog } from "./progressWatchdog";

afterEach(() => vi.useRealTimers());
it("expires an idle run while allowing a long run that continues reporting progress", () => {
  vi.useFakeTimers();
  const idle = vi.fn();
  const watchdog = createProgressWatchdog(120000, idle);
  watchdog.touch("run");
  for (let index = 0; index < 5; index += 1) {
    vi.advanceTimersByTime(100000);
    watchdog.touch("run");
  }
  expect(idle).not.toHaveBeenCalled();
  vi.advanceTimersByTime(120000);
  expect(idle).toHaveBeenCalledExactlyOnceWith("run");
});
it("never expires a completed run or an earlier replaced request", () => {
  vi.useFakeTimers();
  const idle = vi.fn();
  const watchdog = createProgressWatchdog(120000, idle);
  watchdog.touch("old");
  vi.advanceTimersByTime(100000);
  watchdog.touch("new");
  vi.advanceTimersByTime(20000);
  expect(idle).not.toHaveBeenCalled();
  watchdog.clear();
  vi.advanceTimersByTime(120000);
  expect(idle).not.toHaveBeenCalled();
});
it("checks elapsed idle time on foreground ticks when timers were throttled", () => {
  vi.useFakeTimers();
  let now = 0;
  const idle = vi.fn();
  const watchdog = createProgressWatchdog(120000, idle, () => now);
  watchdog.touch("run");
  now = 120001;
  watchdog.check();
  expect(idle).toHaveBeenCalledExactlyOnceWith("run");
  vi.advanceTimersByTime(120000);
  expect(idle).toHaveBeenCalledTimes(1);
});
