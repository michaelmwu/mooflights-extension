import { isSkyscannerFlightsPageUrl } from "../shared/skyscannerBooking";
import type { ToolbarPanelCommand, ToolbarPanelStatus } from "../shared/toolbarPanel";

export const FLIGHT_SITES = [
  { name: "Google Flights", url: "https://www.google.com/travel/flights" },
  { name: "Skyscanner", url: "https://www.skyscanner.net/" },
  { name: "ITA Matrix", url: "https://matrix.itasoftware.com/" },
] as const;

type Site = (typeof FLIGHT_SITES)[number]["name"];
export type SupportedTab = { id: number; site: Site; status: ToolbarPanelStatus | "unavailable" };

export async function readActiveFlightTab(): Promise<SupportedTab | null> {
  const tab = await new Promise<chrome.tabs.Tab | undefined>((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      resolve(chrome.runtime.lastError ? undefined : tab);
    });
  });
  if (typeof tab?.id !== "number" || !tab.url) return null;
  const site = flightSite(tab.url);
  if (!site) return null;
  return { id: tab.id, site, status: await requestPanelStatus(tab.id, "getToolbarPanelStatus") };
}

function flightSite(value: string): Site | undefined {
  const url = new URL(value);
  if (url.protocol !== "https:") return;
  if (url.hostname === "matrix.itasoftware.com") return "ITA Matrix";
  if (["www.google.com", "google.com"].includes(url.hostname) && /^\/travel\/flights(?:\/|$)/.test(url.pathname)) {
    return "Google Flights";
  }
  if (isSkyscannerFlightsPageUrl(value)) return "Skyscanner";
}

export function requestPanelStatus(tabId: number, command: ToolbarPanelCommand): Promise<SupportedTab["status"]> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { command }, { frameId: 0 }, (status: unknown) => {
      const error = chrome.runtime.lastError;
      resolve(!error && (status === "active" || status === "hidden" || status === "waiting") ? status : "unavailable");
    });
  });
}
