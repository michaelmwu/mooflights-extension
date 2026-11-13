import { validatedUsageSignal } from "./analytics";

const completed = {
  eventName: "comparison.completed",
  surface: "google-flights-booking",
  runId: "8a126f0a-f42d-40c2-a757-69da874fb9a3",
  requestedCountryCount: 3,
  completedCountryCount: 2,
  readyCountryCount: 1,
  durationMs: 1200,
  outcome: "cancelled",
};
it("accepts bounded completion metrics with a per-run identifier", () => {
  expect(validatedUsageSignal(completed)).toEqual(completed);
  for (const patch of [
    { durationMs: -1 },
    { readyCountryCount: 3 },
    { completedCountryCount: 4 },
    { outcome: "unknown" },
    { runId: "route-and-date" },
  ])
    expect(validatedUsageSignal({ ...completed, ...patch })).toBeNull();
});
it("keeps preview telemetry free of class choices, program names, routes and account IDs", () => {
  const signal = { eventName: "fare-preview.opened", surface: "google-flights-search" };
  expect(validatedUsageSignal(signal)).toEqual(signal);
  for (const extra of [
    { bookingClass: "V" },
    { program: "United MileagePlus" },
    { userId: "claimed" },
    { url: "https://example.com" },
    { runId: completed.runId },
  ])
    expect(validatedUsageSignal({ ...signal, ...extra })).toBeNull();
});
