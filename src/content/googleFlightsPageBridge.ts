import {
  googleFlightsPreserveMulticityFiltersUrl,
  googleFlightsSearchSliceCount,
  parseGoogleFlightsMatrixSearch,
} from "../shared/googleFlightsBooking";

const MULTICITY_FILTER_PRESERVATION_SESSION_KEY = "mooFlightsGoogleFlightsPreserveMulticityFilters";
const MAIN_WORLD_REWRITE_SESSION_KEY = "mooFlightsGoogleFlightsMainWorldPreservedHref";
const INSTALLED_KEY = "__mooFlightsGoogleFlightsHistoryBridgeInstalled";

type WindowWithBridgeFlag = Window & {
  [INSTALLED_KEY]?: boolean;
};

installGoogleFlightsHistoryBridge();

function installGoogleFlightsHistoryBridge(): void {
  const bridgeWindow = window as WindowWithBridgeFlag;
  if (bridgeWindow[INSTALLED_KEY]) return;
  bridgeWindow[INSTALLED_KEY] = true;

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function pushState(state: unknown, title: string, url?: string | URL | null): void {
    const preservedUrl = preservedHistoryUrl(url);
    if (preservedUrl) {
      navigateToPreservedUrl(preservedUrl);
      return;
    }
    originalPushState.call(this, state, title, url);
  };

  history.replaceState = function replaceState(state: unknown, title: string, url?: string | URL | null): void {
    const preservedUrl = preservedHistoryUrl(url);
    if (preservedUrl) {
      navigateToPreservedUrl(preservedUrl);
      return;
    }
    originalReplaceState.call(this, state, title, url);
  };
}

function preservedHistoryUrl(url: string | URL | null | undefined): string {
  if (url == null || !isPreservationEnabled()) return "";
  const absoluteUrl = absoluteHistoryUrl(url);
  if (!absoluteUrl || !isPartialSelectedMulticitySearchUrl(absoluteUrl)) return "";
  const preservedUrl = googleFlightsPreserveMulticityFiltersUrl(absoluteUrl);
  return preservedUrl === absoluteUrl ? "" : preservedUrl;
}

function navigateToPreservedUrl(url: string): void {
  writeMainWorldRewriteHref(url);
  window.location.replace(url);
}

function absoluteHistoryUrl(url: string | URL): string {
  try {
    return new URL(url.toString(), window.location.href).toString();
  } catch {
    return "";
  }
}

function isPartialSelectedMulticitySearchUrl(url: string): boolean {
  try {
    if (new URL(url).pathname !== "/travel/flights/search") return false;
  } catch {
    return false;
  }
  const searchSliceCount = googleFlightsSearchSliceCount(url);
  if (searchSliceCount < 2) return false;
  const matrixSearch = parseGoogleFlightsMatrixSearch(url, currentCurrencyCode());
  return Boolean(matrixSearch && matrixSearch.slices.length > 0 && matrixSearch.slices.length < searchSliceCount);
}

function currentCurrencyCode(): string {
  try {
    return new URL(window.location.href).searchParams.get("curr") || "USD";
  } catch {
    return "USD";
  }
}

function isPreservationEnabled(): boolean {
  try {
    return sessionStorage.getItem(MULTICITY_FILTER_PRESERVATION_SESSION_KEY) !== "0";
  } catch {
    return true;
  }
}

function writeMainWorldRewriteHref(href: string): void {
  try {
    sessionStorage.setItem(MAIN_WORLD_REWRITE_SESSION_KEY, href);
  } catch {
    // The history rewrite itself still works without the marker.
  }
}
