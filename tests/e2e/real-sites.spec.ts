import { expect, test } from "./fixtures";
import { setGoogleFlightsCountries, waitForComparisonTab } from "./helpers";

const DEFAULT_GOOGLE_FLIGHTS_BOOKING_URL =
  "https://www.google.com/travel/flights/booking?tfs=CBwQAho_EgoyMDI2LTA2LTI0Ih8KA1RQRRIKMjAyNi0wNi0yNBoDTlJUKgJCUjIDMTk2agcIARIDVFBFcgcIARIDTlJUQAFIAXABggELCP___________wGYAQI&tfu=CmxDalJJY0ZsYVRVRkdVRFJsUld0QlJFUktZVUZDUnkwdExTMHRMUzB0TFhSc2FuY3hOVUZCUVVGQlIyOXVNbFZqUWtNMGQzZEJFZ1ZDVWpFNU5ob0tDSkZMRUFBYUExUlhSRGdjY09ydEFRPT0SAggAIgMKATA&curr=USD";
const DEFAULT_GOOGLE_FLIGHTS_MULTICITY_BOOKING_URL =
  "https://www.google.com/travel/flights/booking?tfs=CBwQAhppEgoyMDI2LTA4LTI3Ih8KA0FLTBIKMjAyNi0wOC0yNxoDTkFOKgJGSjIDNDEwIh8KA05BThIKMjAyNi0wOC0yOBoDTlJUKgJGSjIDMzUxMgJGSmoHCAESA0FLTHIMCAMSCC9tLzA3ZGZrGncSCjIwMjctMDQtMjEiHwoDTlJUEgoyMDI3LTA0LTIxGgNOQU4qAkZKMgMzNTAiHwoDTkFOEgoyMDI3LTA0LTIyGgNBS0wqAkZKMgM0MTFqDAgDEggvbS8wN2Rma3IHCAESA01FTHIHCAESA1NZRHIHCAESA0FLTEABSANwAYIBCwj___________8BmAED&tfu=CnhDalJJVkZZeWFWZHBaMkpTUVZsQlExVnVVa0ZDUnkwdExTMHRMUzB0TFhSaVlucDFPRUZCUVVGQlIyOXdRWEpyUWs5SVdUaEJFZzFHU2pNMU1IeEdTalF4TVNNeUdnc0l6Y2dSRUFJYUExVlRSRGdjY00zSUVRPT0SBggAIAIoASIDCgEw&curr=USD";
const DEFAULT_GOOGLE_FLIGHTS_MULTICITY_TOP_SEARCH_URL =
  "https://www.google.com/travel/flights/search?tfs=CBwQAhonEgoyMDI2LTA4LTI3MgJGSmoHCAESA0FLTHIMCAMSCC9tLzA3ZGZrGjUSCjIwMjctMDQtMjFqDAgDEggvbS8wN2Rma3IHCAESA01FTHIHCAESA1NZRHIHCAESA0FLTEABSANwAYIBCwj___________8BmAED&tfu=EgYIACACKAEiAA&curr=USD";
const DEFAULT_GOOGLE_FLIGHTS_MULTICITY_SEARCH_URL =
  "https://www.google.com/travel/flights/search?tfs=CBwQAhppEgoyMDI2LTA4LTI3Ih8KA0FLTBIKMjAyNi0wOC0yNxoDTkFOKgJGSjIDNDEwIh8KA05BThIKMjAyNi0wOC0yOBoDTlJUKgJGSjIDMzUxMgJGSmoHCAESA0FLTHIMCAMSCC9tLzA3ZGZrGjUSCjIwMjctMDQtMjFqDAgDEggvbS8wN2Rma3IHCAESA01FTHIHCAESA1NZRHIHCAESA0FLTEABSANwAYIBCwj___________8BmAED&tfu=CnRDalJJVW1wVlpVeDZjM0ZHTjAxQlEzYzBOVkZDUnkwdExTMHRMUzB0ZEdKaWEySXlOa0ZCUVVGQlIyOXdRWFJqUlZwMk0wVkJFZ3RHU2pReE1IeEdTak0xTVJvTENKU2xFQkFDR2dOVlUwUTRISENVcFJBPRIGCAAgAigBIgMKATA&curr=USD";

test.describe("local real-site smoke tests", () => {
  test.describe.configure({ timeout: 90_000 });

  test.skip(process.env.MOOFLIGHTS_REAL_E2E !== "1", "Set MOOFLIGHTS_REAL_E2E=1 to hit real travel sites locally.");

  test("injects the ITA Matrix panel on the real search page", async ({ page }) => {
    await page.goto("https://matrix.itasoftware.com/search", { waitUntil: "domcontentloaded" });

    const panel = page.locator("#mooflights-panel");
    await expect(panel).toBeAttached({ timeout: 20_000 });
    await expect(panel.getByText("Airport helper")).toBeVisible();
  });

  test("injects the Google Flights panel on a real booking URL", async ({ page }) => {
    const bookingUrl =
      process.env.MOOFLIGHTS_REAL_GOOGLE_FLIGHTS_BOOKING_URL ||
      futureDatedGoogleFlightsUrl(DEFAULT_GOOGLE_FLIGHTS_BOOKING_URL);

    await page.goto(bookingUrl, { waitUntil: "domcontentloaded" });

    const panel = page.locator("#mooflights-google-flights-panel");
    await expect(panel).toBeAttached({ timeout: 30_000 });
    await expect(panel.getByText("Compare country pricing")).toBeVisible();
  });

  test("preserves multicity airline filters on a real Google Flights selected-leg search URL", async ({ page }) => {
    const bookingUrl =
      process.env.MOOFLIGHTS_REAL_GOOGLE_FLIGHTS_MULTICITY_BOOKING_URL || DEFAULT_GOOGLE_FLIGHTS_MULTICITY_BOOKING_URL;
    const topSearchUrl =
      process.env.MOOFLIGHTS_REAL_GOOGLE_FLIGHTS_MULTICITY_TOP_SEARCH_URL ||
      DEFAULT_GOOGLE_FLIGHTS_MULTICITY_TOP_SEARCH_URL;
    const searchUrl =
      process.env.MOOFLIGHTS_REAL_GOOGLE_FLIGHTS_MULTICITY_SEARCH_URL || DEFAULT_GOOGLE_FLIGHTS_MULTICITY_SEARCH_URL;

    await page.goto(bookingUrl, { waitUntil: "domcontentloaded" });

    const panel = page.locator("#mooflights-google-flights-panel");
    await expect(panel).toBeAttached({ timeout: 30_000 });
    await expect(panel.getByText("Preserve stops and airline filters")).toHaveCount(0);

    await page.goto(topSearchUrl, { waitUntil: "domcontentloaded" });
    await expect(panel.getByText("Preserve stops and airline filters")).toBeVisible({ timeout: 30_000 });
    await expect(panel.locator('[data-action="toggle-preserve-multicity-filters"]')).toBeChecked();
    await expect(page).toHaveURL(topSearchUrl);

    await page.evaluate((nextUrl) => {
      history.pushState(history.state, "", nextUrl);
    }, searchUrl);

    await expect
      .poll(() => decodedTfsMarkerCounts(page.url()), { timeout: 20_000 })
      .toMatchObject({ fjFilters: 2, secondLegHasFjFilter: true });
    expect(page.url()).not.toBe(searchUrl);
  });

  test("runs the Google Flights country compare tab flow", async ({ context, extensionServiceWorker, page }) => {
    test.skip(
      process.env.MOOFLIGHTS_REAL_COMPARE_E2E !== "1",
      "Set MOOFLIGHTS_REAL_COMPARE_E2E=1 to open real Google Flights comparison tabs.",
    );
    const bookingUrl =
      process.env.MOOFLIGHTS_REAL_GOOGLE_FLIGHTS_BOOKING_URL ||
      futureDatedGoogleFlightsUrl(DEFAULT_GOOGLE_FLIGHTS_BOOKING_URL);
    await setGoogleFlightsCountries(extensionServiceWorker, ["US", "CA", "ZA"]);

    await page.goto(bookingUrl, { waitUntil: "domcontentloaded" });

    const panel = page.locator("#mooflights-google-flights-panel");
    await expect(panel).toBeAttached({ timeout: 30_000 });
    await expect(panel.getByRole("button", { name: "Compare (3)" })).toBeEnabled();

    const comparisonTabsPromise = Promise.all(["CA", "ZA"].map((country) => waitForComparisonTab(context, country)));

    await panel.getByRole("button", { name: "Compare (3)" }).click();

    const comparisonTabs = await comparisonTabsPromise;
    expect(comparisonTabs.map((comparisonPage) => new URL(comparisonPage.url()).searchParams.get("gl")).sort()).toEqual(
      ["CA", "ZA"],
    );
    await expect(panel.getByText("Canada", { exact: true })).toBeVisible({ timeout: 45_000 });
    await expect(panel.getByText("South Africa", { exact: true })).toBeVisible({ timeout: 45_000 });
  });
});

function futureDatedGoogleFlightsUrl(value: string, daysAhead = 45): string {
  const url = new URL(value);
  const date = futureIsoDate(daysAhead);
  for (const parameter of ["tfs", "tfu"]) {
    const encoded = url.searchParams.get(parameter);
    if (encoded) url.searchParams.set(parameter, replaceDatesInBase64Url(encoded, date));
  }
  return url.toString();
}

function futureIsoDate(daysAhead: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return date.toISOString().slice(0, 10);
}

function replaceDatesInBase64Url(value: string, date: string): string {
  const decoded = Buffer.from(base64UrlToBase64(value), "base64").toString("latin1");
  const updated = decoded.replace(/\d{4}-\d{2}-\d{2}/g, date);
  return Buffer.from(updated, "latin1").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBase64(value: string): string {
  return value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
}

function decodedTfsMarkerCounts(url: string): { fjFilters: number; secondLegHasFjFilter: boolean } {
  const tfs = new URL(url).searchParams.get("tfs") || "";
  const decoded = Buffer.from(base64UrlToBase64(tfs), "base64").toString("latin1");
  return {
    fjFilters: countOccurrences(decoded, "\x32\x02FJ"),
    secondLegHasFjFilter: decoded.includes("\x12\x0a2027-04-21\x32\x02FJ"),
  };
}

function countOccurrences(value: string, pattern: string): number {
  let count = 0;
  let index = value.indexOf(pattern);
  while (index >= 0) {
    count += 1;
    index = value.indexOf(pattern, index + pattern.length);
  }
  return count;
}
