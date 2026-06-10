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
  const deadline = Date.now() + timeout;

  return new Promise<Page>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => fail(new Error(`Timed out waiting for ${country} comparison tab.`)), timeout);

    function resolveOnce(page: Page): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      context.off("page", onPage);
      resolve(page);
    }

    function fail(error: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      context.off("page", onPage);
      reject(error);
    }

    function watchPage(page: Page): void {
      const remaining = Math.max(1, deadline - Date.now());
      void page
        .waitForURL((url) => url.searchParams.get("gl") === country, { timeout: remaining })
        .then(() => resolveOnce(page))
        .catch(() => {});
    }

    function onPage(page: Page): void {
      watchPage(page);
    }

    context.on("page", onPage);
    for (const page of context.pages()) watchPage(page);
  });
}

function storageKeyFromSource(path: string, constantName: string): string {
  const source = readFileSync(path, "utf8");
  const escapedConstantName = constantName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`const\\s+${escapedConstantName}\\s*=\\s*"([^"]+)"`));
  if (!match) throw new Error(`Could not find ${constantName} in ${path}`);
  return match[1];
}
