export const ANALYTICS_CONSENT_VERSION = "analytics-v1";
export type ComparisonSurface =
  | "google-flights-search"
  | "google-flights-booking"
  | "skyscanner-search"
  | "skyscanner-booking";
export type PreviewEvent =
  | "fare-preview.opened"
  | "fare-preview.class-changed"
  | "fare-preview.program-changed"
  | "fare-preview.verify-clicked";
export type UsageSignal =
  | { eventName: PreviewEvent; surface: "google-flights-search" }
  | { eventName: "comparison.started"; surface: ComparisonSurface; runId: string; requestedCountryCount: number }
  | {
      eventName: "comparison.completed";
      surface: ComparisonSurface;
      runId: string;
      requestedCountryCount: number;
      completedCountryCount: number;
      readyCountryCount: number;
      durationMs: number;
      outcome: "completed" | "cancelled" | "error";
    };
export type UsageEvent = UsageSignal & {
  contractVersion: "v1";
  idempotencyKey: string;
  extensionVersion: string;
  browser: "chrome" | "firefox";
  occurredAt: string;
};
const PREVIEW_EVENTS = new Set([
  "fare-preview.opened",
  "fare-preview.class-changed",
  "fare-preview.program-changed",
  "fare-preview.verify-clicked",
]);
const SURFACES = new Set([
  "google-flights-search",
  "google-flights-booking",
  "skyscanner-search",
  "skyscanner-booking",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Runtime allowlist: arbitrary properties, account IDs, URLs and flight data are rejected. */
export function validatedUsageSignal(value: unknown): UsageSignal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const signal = value as Record<string, unknown>;
  if (typeof signal.eventName !== "string" || typeof signal.surface !== "string" || !SURFACES.has(signal.surface))
    return null;
  const keys = ["eventName", "surface"];
  if (PREVIEW_EVENTS.has(signal.eventName)) {
    if (signal.surface !== "google-flights-search") return null;
  } else {
    if (signal.eventName !== "comparison.started" && signal.eventName !== "comparison.completed") return null;
    keys.push("runId", "requestedCountryCount");
    if (typeof signal.runId !== "string" || !UUID.test(signal.runId) || !count(signal.requestedCountryCount, 250))
      return null;
    if (signal.eventName === "comparison.completed") {
      keys.push("completedCountryCount", "readyCountryCount", "durationMs", "outcome");
      if (
        !count(signal.completedCountryCount, signal.requestedCountryCount as number) ||
        !count(signal.readyCountryCount, signal.completedCountryCount as number) ||
        !count(signal.durationMs, 86400000) ||
        !["completed", "cancelled", "error"].includes(String(signal.outcome))
      )
        return null;
    }
  }
  if (Object.keys(signal).some((key) => !keys.includes(key))) return null;
  return { ...signal } as UsageSignal;
}
function count(value: unknown, maximum: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= maximum;
}
