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
const XHR_REQUEST_URLS = new WeakMap<XMLHttpRequest, string>();

installAlkaliBatchInterceptor();

window.addEventListener("message", (event: MessageEvent<CaptureRequest>) => {
  if (event.source !== window || event.data?.source !== SOURCE || event.data.type !== REQUEST_TYPE) return;
  const requestId = event.data.requestId;
  if (!requestId) return;
  void captureJson(requestId);
});

function installAlkaliBatchInterceptor(): void {
  interceptFetch();
  interceptXhr();
}

function interceptFetch(): void {
  const originalFetch = window.fetch?.bind(window);
  if (!originalFetch) return;

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    const url = fetchUrl(args[0]);
    if (isAlkaliBatchUrl(url)) {
      void response
        .clone()
        .text()
        .then((text) => postBookingDetailsFromBatch(text))
        .catch(() => undefined);
    }
    return response;
  };
}

function interceptXhr(): void {
  const originalOpen = XMLHttpRequest.prototype.open as (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async: boolean,
    username?: string | null,
    password?: string | null,
  ) => void;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function open(
    method: string,
    url: string | URL,
    async: boolean = true,
    username?: string | null,
    password?: string | null,
  ): void {
    XHR_REQUEST_URLS.set(this, typeof url === "string" ? url : url.toString());
    originalOpen.call(this, method, url, async, username, password);
  };

  XMLHttpRequest.prototype.send = function send(body?: Document | XMLHttpRequestBodyInit | null): void {
    this.addEventListener("loadend", () => {
      if (!isAlkaliBatchUrl(XHR_REQUEST_URLS.get(this) || "")) return;
      if (typeof this.responseText !== "string") return;
      postBookingDetailsFromBatch(this.responseText);
    });
    originalSend.call(this, body);
  };
}

function fetchUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isAlkaliBatchUrl(value: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value, window.location.href);
    return url.hostname === "content-alkalimatrix-pa.googleapis.com" && url.pathname === "/batch";
  } catch {
    return false;
  }
}

function postBookingDetailsFromBatch(text: string): void {
  for (const json of extractJsonObjects(text)) {
    const bookingDetails = json.bookingDetails;
    if (!bookingDetails || typeof bookingDetails !== "object") continue;
    window.postMessage(
      {
        source: SOURCE,
        type: "alkali-booking-details",
        data: bookingDetails,
      },
      window.location.origin,
    );
  }
}

function extractJsonObjects(text: string): Array<Record<string, unknown>> {
  const objects: Array<Record<string, unknown>> = [];
  let start = -1;
  let depth = 0;
  let quoted = false;
  let escaped = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        quoted = false;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth++;
      continue;
    }
    if (char !== "}") continue;
    if (depth === 0) {
      start = -1;
      continue;
    }

    depth--;
    if (depth !== 0 || start < 0) continue;
    try {
      const parsed = JSON.parse(text.slice(start, index + 1));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) objects.push(parsed);
    } catch {
      // Ignore non-JSON multipart fragments.
    }
    start = -1;
  }

  return objects;
}

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
    try {
      return originalWriteText(data).then(() => {
        dismissCopyConfirmationSoon();
      });
    } catch (error) {
      return Promise.reject(error);
    }
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

function dismissCopyConfirmationSoon(): void {
  window.setTimeout(dismissCopyConfirmation, 0);
  window.setTimeout(dismissCopyConfirmation, 100);
  window.setTimeout(dismissCopyConfirmation, 300);
}

function dismissCopyConfirmation(): void {
  const button = document.querySelector<HTMLButtonElement>(
    [
      "mat-snack-bar-container button",
      ".mat-mdc-snack-bar-container button",
      "simple-snack-bar button",
      ".mat-mdc-snack-bar-action button",
    ].join(", "),
  );
  if (!button || !/^ok$/i.test(normalize(button.textContent))) return;
  button.click();
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
