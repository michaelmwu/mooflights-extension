import { readFileSync } from "node:fs";
import type { BrowserContext, Page, Worker } from "@playwright/test";

export const MOOFLIGHTS_SETTINGS_STORAGE_KEY = storageKeyFromSource("src/shared/storage.ts", "SETTINGS_KEY");
export const MOOFLIGHTS_GOOGLE_FLIGHTS_RESULTS_STORAGE_KEY = storageKeyFromSource(
  "src/content/googleFlightsContent.ts",
  "RESULT_CACHE_STORAGE_KEY",
);

export async function setGoogleFlightsCountries(extensionServiceWorker: Worker, countryCodes: string[]): Promise<void> {
  await extensionServiceWorker.evaluate(
    async ({ countryCodes: codes, settingsStorageKey }) => {
      await chrome.storage.local.set({
        [settingsStorageKey]: {
          googleFlights: {
            countryCodes: codes,
          },
        },
      });
    },
    { countryCodes, settingsStorageKey: MOOFLIGHTS_SETTINGS_STORAGE_KEY },
  );
}

export async function waitForComparisonTab(context: BrowserContext, country: string, timeout = 15_000): Promise<Page> {
  return context.waitForEvent("page", {
    predicate: (comparisonPage) => new URL(comparisonPage.url()).searchParams.get("gl") === country,
    timeout,
  });
}

function storageKeyFromSource(path: string, constantName: string): string {
  const source = readFileSync(path, "utf8");
  const escapedConstantName = constantName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`const\\s+${escapedConstantName}\\s*=\\s*"([^"]+)"`));
  if (!match) throw new Error(`Could not find ${constantName} in ${path}`);
  return match[1];
}
