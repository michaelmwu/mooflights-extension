import type { BrowserContext, Page, Worker } from "@playwright/test";

export async function setGoogleFlightsCountries(extensionServiceWorker: Worker, countryCodes: string[]): Promise<void> {
  await extensionServiceWorker.evaluate(async (codes) => {
    await chrome.storage.local.set({
      muTravelSettings: {
        googleFlights: {
          countryCodes: codes,
        },
      },
    });
  }, countryCodes);
}

export async function waitForComparisonTab(context: BrowserContext, country: string, timeout = 15_000): Promise<Page> {
  return context.waitForEvent("page", {
    predicate: (comparisonPage) => new URL(comparisonPage.url()).searchParams.get("gl") === country,
    timeout,
  });
}
