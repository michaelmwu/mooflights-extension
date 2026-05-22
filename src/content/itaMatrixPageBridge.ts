type CaptureRequest = {
  source?: string;
  type?: string;
  requestId?: string;
};

type CaptureResponse = {
  source: string;
  type: string;
  requestId: string;
  ok: boolean;
  data?: string;
  error?: string;
};

const SOURCE = "mu-travel-flights";
const REQUEST_TYPE = "capture-ita-json";
const RESPONSE_TYPE = "capture-ita-json-result";

window.addEventListener("message", (event: MessageEvent<CaptureRequest>) => {
  if (event.source !== window || event.data?.source !== SOURCE || event.data.type !== REQUEST_TYPE) return;
  const requestId = event.data.requestId;
  if (!requestId) return;
  void captureJson(requestId);
});

async function captureJson(requestId: string): Promise<void> {
  const clipboard = navigator.clipboard;
  const button = findCopyJsonButton();
  if (!button) {
    postResult({ requestId, ok: false, error: "Copy itinerary as JSON button was not found." });
    return;
  }
  if (!clipboard?.writeText) {
    postResult({ requestId, ok: false, error: "Page clipboard API was not available." });
    return;
  }

  const originalWriteText = clipboard.writeText.bind(clipboard);
  let captured = false;
  const timeoutId = window.setTimeout(() => {
    restoreWriteText(clipboard, originalWriteText);
    if (!captured) postResult({ requestId, ok: false, error: "Timed out waiting for ITA Matrix JSON." });
  }, 3000);

  const interceptor = (data: string): Promise<void> => {
    captured = true;
    window.clearTimeout(timeoutId);
    restoreWriteText(clipboard, originalWriteText);
    postResult({ requestId, ok: true, data });
    return originalWriteText(data);
  };

  try {
    clipboard.writeText = interceptor;
  } catch {
    try {
      Object.defineProperty(clipboard, "writeText", {
        configurable: true,
        value: interceptor,
      });
    } catch {
      window.clearTimeout(timeoutId);
      postResult({ requestId, ok: false, error: "Could not intercept ITA Matrix clipboard write." });
      return;
    }
  }

  try {
    button.click();
  } catch (error) {
    window.clearTimeout(timeoutId);
    restoreWriteText(clipboard, originalWriteText);
    if (!captured) {
      postResult({
        requestId,
        ok: false,
        error: error instanceof Error ? error.message : "ITA Matrix JSON button click failed.",
      });
    }
  }
}

function restoreWriteText(clipboard: Clipboard, originalWriteText: Clipboard["writeText"]): void {
  try {
    clipboard.writeText = originalWriteText;
  } catch {
    try {
      Object.defineProperty(clipboard, "writeText", {
        configurable: true,
        value: originalWriteText,
      });
    } catch {
      // Leave the page alone if the browser refuses restoration. The request-scoped
      // interceptor resolves immediately, so the next page navigation resets it.
    }
  }
}

function findCopyJsonButton(): HTMLElement | null {
  const candidates = Array.from(document.querySelectorAll<HTMLElement>("button, [role='button']"));
  return (
    candidates.find((candidate) => normalize(candidate.textContent).includes("copy itinerary as json")) ||
    candidates.find((candidate) => /copy.*json/i.test(candidate.getAttribute("aria-label") || "")) ||
    null
  );
}

function normalize(value: string | null): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function postResult(result: Omit<CaptureResponse, "source" | "type">): void {
  window.postMessage(
    {
      source: SOURCE,
      type: RESPONSE_TYPE,
      ...result,
    },
    window.location.origin,
  );
}
