/** A renderer that stops responding must not occupy a comparison slot indefinitely. */
export function sendTabMessage<T>(tabId: number, message: unknown, signal?: AbortSignal, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, response?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancelled);
      if (error) reject(error);
      else resolve(response as T);
    };
    const cancelled = () => {
      const error = new Error("Google Flights comparison cancelled.");
      error.name = "GoogleFlightsComparisonCancelled";
      finish(error);
    };
    const timer = setTimeout(
      () => finish(new Error("Comparison tab did not respond in time.")),
      Math.max(1, timeoutMs),
    );
    if (signal?.aborted) {
      cancelled();
      return;
    }
    signal?.addEventListener("abort", cancelled, { once: true });
    try {
      chrome.tabs.sendMessage(tabId, message, (response: T) => {
        const error = chrome.runtime.lastError;
        finish(error ? new Error(error.message) : undefined, response);
      });
    } catch (error) {
      finish(error instanceof Error ? error : new Error("Could not contact comparison tab."));
    }
  });
}
