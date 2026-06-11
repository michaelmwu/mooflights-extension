type CapturedSearchResponse = {
  url: string;
  pageUrl: string;
  payload: unknown;
  capturedAt: number;
  request?: CapturedSearchRequest;
};

type CapturedSearchRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
};

export {};

declare global {
  interface Window {
    __mooFlightsSkyscannerSearchCapture?: CapturedSearchResponse;
  }
}

const MESSAGE_SOURCE = "mooFlightsSkyscannerSearchHook";
const REQUEST_SOURCE = "mooFlightsSkyscannerContent";
const SEARCH_API_PATH = "/g/radar/api/v2/web-unified-search/";
const xhrRequests = new WeakMap<XMLHttpRequest, CapturedSearchRequest>();
const xhrLoadListeners = new WeakSet<XMLHttpRequest>();
const replaySearchApiUrls = new Set<string>();

installFetchHook();
installXhrHook();
installRequestListener();

function installFetchHook(): void {
  const originalFetch = window.fetch;
  if (typeof originalFetch !== "function") return;
  window.fetch = async function hookedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = captureFetchRequest(input, init);
    const response = await originalFetch.call(this, input, init);
    const url = requestUrl(input);
    if (isSearchApiUrl(url) && !isReplaySearchApiUrl(url)) {
      const responseClone = response.clone();
      void request.then((capturedRequest) => captureResponse(url, responseClone, capturedRequest));
    }
    return response;
  };
}

function installXhrHook(): void {
  const OriginalXhr = window.XMLHttpRequest;
  if (typeof OriginalXhr !== "function") return;
  const originalOpen = OriginalXhr.prototype.open;
  const originalSetRequestHeader = OriginalXhr.prototype.setRequestHeader;
  const originalSend = OriginalXhr.prototype.send;
  OriginalXhr.prototype.open = function hookedOpen(
    ...args: [method: string, url: string | URL, async?: boolean, username?: string | null, password?: string | null]
  ) {
    const [method, url] = args;
    const request = captureXhrRequest(method, String(url));
    xhrRequests.set(this, request);
    if (!xhrLoadListeners.has(this)) {
      xhrLoadListeners.add(this);
      this.addEventListener("load", () => {
        const responseUrl = this.responseURL || xhrRequests.get(this)?.url || "";
        if (!isSearchApiUrl(responseUrl) || typeof this.responseText !== "string") return;
        try {
          publishCapture(responseUrl, JSON.parse(this.responseText), xhrRequests.get(this));
        } catch {
          // Ignore non-JSON responses; the fetch hook covers the normal path.
        }
      });
    }
    return Reflect.apply(originalOpen, this, args);
  };
  OriginalXhr.prototype.setRequestHeader = function hookedSetRequestHeader(header: string, value: string): void {
    const request = xhrRequests.get(this);
    if (request) request.headers[header.toLowerCase()] = value;
    originalSetRequestHeader.call(this, header, value);
  };
  OriginalXhr.prototype.send = function hookedSend(body?: Document | XMLHttpRequestBodyInit | null): void {
    const request = xhrRequests.get(this);
    const serializedBody = requestBodyFromValue(body);
    if (request && serializedBody) request.body = serializedBody;
    originalSend.call(this, body);
  };
}

function installRequestListener(): void {
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data as { source?: unknown; type?: unknown };
    if (data?.source !== REQUEST_SOURCE) return;
    if (data.type === "request-latest") {
      const latest = window.__mooFlightsSkyscannerSearchCapture;
      if (latest && captureMatchesCurrentPage(latest)) postCapture(latest);
      return;
    }
    if (data.type === "compare-market") {
      void compareMarket(data as { requestId?: unknown; country?: unknown });
    }
  });
}

async function captureResponse(url: string, response: Response, request?: CapturedSearchRequest): Promise<void> {
  try {
    const payload = await response.json();
    publishCapture(url, payload, request);
  } catch {
    // Skyscanner may abort or replace requests while a user changes tabs.
  }
}

function publishCapture(url: string, payload: unknown, request?: CapturedSearchRequest): void {
  const capture = {
    url,
    pageUrl: window.location.href,
    payload,
    capturedAt: Date.now(),
    ...(request ? { request } : {}),
  };
  window.__mooFlightsSkyscannerSearchCapture = capture;
  postCapture(capture);
}

function postCapture(capture: CapturedSearchResponse): void {
  window.postMessage(
    {
      source: MESSAGE_SOURCE,
      type: "search-response",
      ...capture,
    },
    window.location.origin,
  );
}

async function compareMarket(message: { requestId?: unknown; country?: unknown }): Promise<void> {
  const requestId = typeof message.requestId === "string" ? message.requestId : "";
  const country = typeof message.country === "string" ? message.country : "";
  const latest = window.__mooFlightsSkyscannerSearchCapture;
  const latestRequest = latest?.request;
  if (!requestId || !country || !latestRequest || !captureMatchesCurrentPage(latest)) {
    postMarketResponse(requestId, country, undefined, "No Skyscanner search request captured yet.");
    return;
  }

  try {
    const market = skyscannerMarketCode(country);
    const headers = { ...latestRequest.headers };
    headers["x-skyscanner-market"] = market;
    const requestUrl = new URL(latestRequest.url, window.location.href);
    requestUrl.searchParams.set("market", market);
    const body = replayRequestBody(latestRequest, market);
    const replayUrl = requestUrl.toString();
    replaySearchApiUrls.add(replayUrl);
    let response: Response;
    try {
      response = await fetch(replayUrl, {
        method: latestRequest.method,
        headers,
        body,
        credentials: "include",
      });
    } finally {
      replaySearchApiUrls.delete(replayUrl);
    }
    const payload = await response.json();
    postMarketResponse(requestId, country, payload);
  } catch (error) {
    postMarketResponse(requestId, country, undefined, error instanceof Error ? error.message : "Market search failed.");
  }
}

function postMarketResponse(requestId: string, country: string, payload?: unknown, error?: string): void {
  window.postMessage(
    {
      source: MESSAGE_SOURCE,
      type: "market-response",
      requestId,
      country,
      ...(payload !== undefined ? { payload } : {}),
      ...(error ? { error } : {}),
    },
    window.location.origin,
  );
}

async function captureFetchRequest(input: RequestInfo | URL, init?: RequestInit): Promise<CapturedSearchRequest> {
  const request = input instanceof Request ? input : null;
  const headers = {
    ...(request ? headersRecord(request.headers) : {}),
    ...headersRecord(init?.headers),
  };
  return {
    url: requestUrl(input),
    method: (init?.method || request?.method || "GET").toUpperCase(),
    headers,
    ...(await requestBody(input, init)),
  };
}

function captureXhrRequest(method: string, url: string): CapturedSearchRequest {
  return {
    url: new URL(url, window.location.href).toString(),
    method: method.toUpperCase(),
    headers: {},
  };
}

async function requestBody(input: RequestInfo | URL, init?: RequestInit): Promise<{ body?: string }> {
  if (typeof init?.body === "string") return { body: init.body };
  const serializedInitBody = requestBodyFromValue(init?.body);
  if (serializedInitBody) return { body: serializedInitBody };
  if (input instanceof Request) {
    try {
      return { body: await input.clone().text() };
    } catch {
      return {};
    }
  }
  return {};
}

function requestBodyFromValue(body: BodyInit | Document | null | undefined): string {
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  return "";
}

function replayRequestBody(request: CapturedSearchRequest, market: string): string | undefined {
  if (request.method === "GET" || request.method === "HEAD" || !request.body) return undefined;
  return rewriteJsonMarketBody(request.body, market) || request.body;
}

function rewriteJsonMarketBody(body: string, market: string): string {
  try {
    return JSON.stringify(rewriteMarketFields(JSON.parse(body), market));
  } catch {
    return "";
  }
}

function rewriteMarketFields(value: unknown, market: string): unknown {
  if (Array.isArray(value)) return value.map((item) => rewriteMarketFields(item, market));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, child]) => {
      if (isMarketField(key) && typeof child === "string") return [key, market];
      return [key, rewriteMarketFields(child, market)];
    }),
  );
}

function isMarketField(key: string): boolean {
  return /^(market|marketCode|localeMarket|userMarket)$/i.test(key);
}

function headersRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(Array.from(headers.entries()));
  if (Array.isArray(headers)) return Object.fromEntries(headers.map(([key, value]) => [key.toLowerCase(), value]));
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), String(value)]));
}

function skyscannerMarketCode(country: string): string {
  const normalized = country.trim().toUpperCase();
  return normalized === "GB" ? "UK" : normalized;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url || "";
}

function isSearchApiUrl(url: string): boolean {
  if (!url) return false;
  try {
    return new URL(url, window.location.href).pathname === SEARCH_API_PATH;
  } catch {
    return url.includes(SEARCH_API_PATH);
  }
}

function isReplaySearchApiUrl(url: string): boolean {
  try {
    return replaySearchApiUrls.has(new URL(url, window.location.href).toString());
  } catch {
    return replaySearchApiUrls.has(url);
  }
}

function captureMatchesCurrentPage(capture: CapturedSearchResponse | undefined): boolean {
  return Boolean(
    capture?.pageUrl && skyscannerSearchPageKey(capture.pageUrl) === skyscannerSearchPageKey(window.location.href),
  );
}

function skyscannerSearchPageKey(url: string): string {
  try {
    const parsedUrl = new URL(url, window.location.href);
    const params = new URLSearchParams(parsedUrl.searchParams);
    params.delete("market");
    params.delete("userSessionDataId");
    params.delete("_gl");
    const query = params.toString();
    return query ? `${parsedUrl.pathname}?${query}` : parsedUrl.pathname;
  } catch {
    return "";
  }
}
