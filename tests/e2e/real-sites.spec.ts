import { expect, test } from "./fixtures";
import { setGoogleFlightsCountries, waitForComparisonTab } from "./helpers";

const DEFAULT_GOOGLE_FLIGHTS_BOOKING_URL =
  "https://www.google.com/travel/flights/booking?tfs=CBwQAho_EgoyMDI2LTA2LTI0Ih8KA1RQRRIKMjAyNi0wNi0yNBoDTlJUKgJCUjIDMTk2agcIARIDVFBFcgcIARIDTlJUQAFIAXABggELCP___________wGYAQI&tfu=CmxDalJJY0ZsYVRVRkdVRFJsUld0QlJFUktZVUZDUnkwdExTMHRMUzB0TFhSc2FuY3hOVUZCUVVGQlIyOXVNbFZqUWtNMGQzZEJFZ1ZDVWpFNU5ob0tDSkZMRUFBYUExUlhSRGdjY09ydEFRPT0SAggAIgMKATA&curr=USD";

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
