import { vi } from "vitest";
import { boundedDebounce } from "./boundedDebounce";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("runs after quiet time without keeping a second deadline callback", () => {
  const run = vi.fn();
  const schedule = boundedDebounce(run, 150, 1000);
  schedule();
  vi.advanceTimersByTime(100);
  schedule();
  vi.advanceTimersByTime(149);
  expect(run).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(run).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1000);
  expect(run).toHaveBeenCalledTimes(1);
});

it("makes progress during continuous mutations and starts a fresh deadline afterward", () => {
  const run = vi.fn();
  const schedule = boundedDebounce(run, 150, 1000);
  for (let i = 0; i < 20; i++) {
    schedule();
    vi.advanceTimersByTime(100);
  }
  expect(run).toHaveBeenCalledTimes(2);
  schedule();
  vi.advanceTimersByTime(150);
  expect(run).toHaveBeenCalledTimes(3);
});

it("cancels both pending timers", () => {
  const run = vi.fn();
  const schedule = boundedDebounce(run, 150, 1000);
  schedule();
  schedule.cancel();
  vi.advanceTimersByTime(2000);
  expect(run).not.toHaveBeenCalled();
});
