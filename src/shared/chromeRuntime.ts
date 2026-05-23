export async function safeChromeCall<T>(operation: () => T | Promise<T>, fallback: T): Promise<T> {
  try {
    return await operation();
  } catch {
    return fallback;
  }
}

export function runtimeUrl(path: string): string | null {
  try {
    return chrome.runtime.getURL(path);
  } catch {
    return null;
  }
}

export function sendRuntimeMessage(message: unknown): void {
  try {
    const response = chrome.runtime.sendMessage(message);
    if (isPromiseLike(response)) void response.catch(() => undefined);
  } catch {
    // Content scripts can outlive their extension context after reload/update.
  }
}

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return Boolean(value && typeof value === "object" && "catch" in value && typeof value.catch === "function");
}
