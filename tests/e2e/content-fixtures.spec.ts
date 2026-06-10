import { readFileSync } from "node:fs";
import type { BrowserContext, Page, Worker } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  MOOFLIGHTS_GOOGLE_FLIGHTS_RESULTS_STORAGE_KEY,
  MOOFLIGHTS_SETTINGS_STORAGE_KEY,
  setGoogleFlightsCountries,
  waitForComparisonTab,
} from "./helpers";

const itaFixtureJson = readFileSync("src/shared/fixtures/itaRoundTrip.json", "utf8");

test.beforeEach(async ({ context }) => {
  await routeOptionalExtensionNetwork(context);
});

test("injects the ITA Matrix airport helper on routed search pages", async ({ page }) => {
  await routeItaFixture(page, matrixSearchFixture());

  await page.goto("https://matrix.itasoftware.com/search");

  const panel = page.locator("#mooflights-panel");
  await expect(panel).toBeAttached();
  await expect(panel.getByText("Airport helper")).toBeVisible();
  await expect(panel.getByLabel("Area")).toBeVisible();

  await panel.locator("summary[aria-label='Panel actions']").click();
  await panel.getByRole("button", { name: "Minimize" }).click();
  await expect(panel.getByLabel("Expand MooFlights panel")).toBeVisible();

  await panel.getByLabel("Expand MooFlights panel").click();
  await expect(panel.getByText("Airport helper")).toBeVisible();
});

test("parses pasted ITA itinerary JSON on routed itinerary pages", async ({ page }) => {
  await routeItaFixture(page, matrixItineraryFixture());

  await page.goto("https://matrix.itasoftware.com/itinerary");

  const panel = page.locator("#mooflights-panel");
  await expect(panel.getByText("Itinerary", { exact: true })).toBeVisible();

  await panel.getByText("Itinerary", { exact: true }).click();
  await expect(panel.getByText("Advanced fallback")).toBeVisible();
  await panel.getByText("Advanced fallback").click();
  await panel.getByPlaceholder("Paste ITA Matrix Copy as JSON output here").fill(itaFixtureJson);
  await panel.getByRole("button", { name: "Parse pasted JSON" }).click();

  await expect(panel.getByText("JFK-LHR AA100 I // LHR-JFK BA117 R")).toBeVisible();
  await expect(panel.getByText("round-trip")).toBeVisible();
  await expect(panel.getByText("USD 1234.56")).toBeVisible();
  await expect(panel.getByRole("link", { name: /Where to Credit/i })).toBeVisible();
});

test("opens Google Flights country comparison tabs from a routed US booking page", async ({
  context,
  extensionServiceWorker,
  page,
}) => {
  const pageUrl = "https://www.google.com/travel/flights/booking?tfs=e2e-fixture&curr=USD&gl=US";
  await setGoogleFlightsCountries(extensionServiceWorker, ["US", "CA", "ZA"]);
  await routeGoogleFlightsBookingFixtures(context);

  await page.goto(pageUrl);

  const panel = page.locator("#mooflights-google-flights-panel");
  await expect(panel).toBeAttached();
  await expect(panel.getByText("Compare country pricing")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Compare (3)" })).toBeEnabled();

  const comparisonTabsPromise = Promise.all(["CA", "ZA"].map((country) => waitForComparisonTab(context, country)));
  await panel.getByRole("button", { name: "Compare (3)" }).click();

  const comparisonTabs = await comparisonTabsPromise;
  expect(comparisonTabs.map((comparisonPage) => new URL(comparisonPage.url()).searchParams.get("gl")).sort()).toEqual([
    "CA",
    "ZA",
  ]);
});

test("renders Google Flights cached country comparison prices on routed booking pages", async ({
  context,
  extensionServiceWorker,
  page,
}) => {
  const pageUrl = "https://www.google.com/travel/flights/booking?tfs=e2e-fixture&curr=USD&gl=US";
  await setGoogleFlightsCachedResults(extensionServiceWorker, pageUrl);
  await routeGoogleFlightsBookingFixtures(context);

  await page.goto(pageUrl);

  const panel = page.locator("#mooflights-google-flights-panel");
  await expect(panel).toBeAttached();
  await expect(panel.getByText("Compare country pricing")).toBeVisible();

  await expect(panel.getByText("South Africa", { exact: true })).toBeVisible();
  await expect(panel.getByText("$870")).toBeVisible();
  await expect(panel.getByText("Canada", { exact: true })).toBeVisible();
  await expect(panel.getByText("$900")).toBeVisible();
  await expect(panel.getByText(/United States/)).toBeVisible();
  await expect(panel.getByText("$950")).toBeVisible();
  await expect(panel.getByText(/2 option\(s\)/)).toHaveCount(3);
});

test("does not backfill later Google Flights multicity filters into earlier legs", async ({ context, page }) => {
  await routeGoogleFlightsBookingFixtures(context);
  const pageUrl = `https://www.google.com/travel/flights/search?tfs=${encodeTfsText([
    tfsSearchSlice("2026-06-03", "HKG", "TPE"),
    tfsSearchSlice("2026-06-05", "TPE", "HKG", "\x32\x02BR"),
  ])}`;

  await page.goto(pageUrl);

  const panel = page.locator("#mooflights-google-flights-panel");
  await expect(panel).toBeAttached();
  await expect(panel.getByText("Preserve stops and airline filters")).toBeVisible();
  await expect(panel.locator('[data-action="toggle-preserve-multicity-filters"]')).toBeChecked();
  await expect(page).toHaveURL(pageUrl);
});

test("normalizes preserved filters on a clicked Google Flights multicity leg", async ({ context, page }) => {
  await routeGoogleFlightsBookingFixtures(context);
  const pageUrl =
    "https://www.google.com/travel/flights/search?tfs=CBwQAhprEgoyMDI2LTA4LTI3Ih8KA0FLTBIKMjAyNi0wOC0yNxoDTkFOKgJGSjIDNDEwIh8KA05BThIKMjAyNi0wOC0yOBoDTlJUKgJGSjIDMzUxKAEyAkZKagcIARIDQUtMcgwIAxIIL20vMDdkZmsaOxIKMjAyNy0wNC0yMWoMCAMSCC9tLzA3ZGZrcgcIARIDTUVMcgcIARIDU1lEcgcIARIDQUtMKAEyAkZKQAFIA3ABggELCP///////////wGYAQM%3D&tfu=CnRDalJJU25kUGJrOTFPVU5FTFhOQlFqQTBTbEZDUnkwdExTMHRMUzB0TFhSc2FuY3hNa0ZCUVVGQlIyOXZMWFJuUkU5blptVkJFZ3RHU2pReE1IeEdTak0xTVJvTENNeWpFQkFDR2dOVlUwUTRISERNb3hBPRIGCAAgAigBIgA&curr=USD";

  await page.goto(pageUrl);

  const panel = page.locator("#mooflights-google-flights-panel");
  await expect(panel).toBeAttached();
  await expect(panel.getByText("Preserve stops and airline filters")).toBeVisible();
  await expect(page).not.toHaveURL(pageUrl);

  const preservedTfs = decodeTfsText(new URL(page.url()).searchParams.get("tfs") || "");
  expect(countOccurrences(preservedTfs, "\x28\x01")).toBe(2);
  expect(preservedTfs).toContain("\x12\x0a2027-04-21\x28\x01\x32\x02FJ");
});

test("fills missing Google Flights multicity filters only after the source leg", async ({ context, page }) => {
  await routeGoogleFlightsBookingFixtures(context);
  const pageUrl = `https://www.google.com/travel/flights/search?tfs=${encodeTfsText([
    tfsSearchSlice("2026-06-03", "HKG", "TPE"),
    tfsSearchSlice("2026-06-05", "TPE", "HKG", "\x32\x02BR"),
    tfsSearchSlice("2026-06-07", "HKG", "NRT"),
  ])}`;

  await page.goto(pageUrl);

  const panel = page.locator("#mooflights-google-flights-panel");
  await expect(panel).toBeAttached();
  await expect(panel.getByText("Preserve stops and airline filters")).toBeVisible();
  await expect(page).not.toHaveURL(pageUrl);

  const preservedTfs = decodeTfsText(new URL(page.url()).searchParams.get("tfs") || "");
  expect(countOccurrences(preservedTfs, "\x32\x02BR")).toBe(2);
  expect(preservedTfs.indexOf("\x32\x02BR")).toBeGreaterThan(preservedTfs.indexOf("2026-06-05"));
  expect(preservedTfs.indexOf("\x32\x02BR")).toBeLessThan(preservedTfs.indexOf("2026-06-07"));
});

async function routeOptionalExtensionNetwork(context: BrowserContext): Promise<void> {
  const fixtureDate = new Date().toISOString().slice(0, 10);
  await context.route("https://cdn.jsdelivr.net/**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ date: fixtureDate, usd: { eur: 0.92, gbp: 0.78, jpy: 156, usd: 1 } }),
    });
  });
  await context.route("https://api.fxratesapi.com/**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ date: fixtureDate, rates: { EUR: 0.92, GBP: 0.78, JPY: 156, USD: 1 } }),
    });
  });
}

async function routeItaFixture(page: Page, body: string): Promise<void> {
  await page.route("https://matrix.itasoftware.com/**", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body,
    });
  });
}

async function routeGoogleFlightsBookingFixtures(context: BrowserContext): Promise<void> {
  await context.route("https://www.google.com/travel/flights**", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: googleFlightsBookingFixture(route.request().url()),
    });
  });
}

async function setGoogleFlightsCachedResults(extensionServiceWorker: Worker, pageUrl: string): Promise<void> {
  const cacheKey = "/travel/flights/booking?tfs=e2e-fixture&curr=USD";
  await extensionServiceWorker.evaluate(
    async (fixtureState) => {
      await chrome.storage.local.set({
        [fixtureState.settingsStorageKey]: {
          googleFlights: {
            countryCodes: ["US", "CA", "ZA"],
          },
        },
        [fixtureState.googleFlightsResultsStorageKey]: {
          [fixtureState.cacheKey]: {
            cachedAt: Date.now(),
            results: ["US", "CA", "ZA"].map((country) => {
              const countryFixture = fixtureState.fixtures[country];
              return {
                country,
                url: fixtureState.urls[country],
                status: "ready",
                options: [
                  {
                    provider: countryFixture.provider,
                    price: countryFixture.cheapest,
                    currency: "USD",
                    priceText: `$${countryFixture.cheapest.toLocaleString()}`,
                    isDirect: false,
                    bookingUrl: `https://book.example/${country.toLowerCase()}/cheap`,
                  },
                  {
                    provider: "American",
                    price: countryFixture.direct,
                    currency: "USD",
                    priceText: `$${countryFixture.direct.toLocaleString()}`,
                    isDirect: true,
                    bookingUrl: `https://airline.example/${country.toLowerCase()}`,
                  },
                ],
              };
            }),
          },
        },
      });
    },
    {
      cacheKey,
      googleFlightsResultsStorageKey: MOOFLIGHTS_GOOGLE_FLIGHTS_RESULTS_STORAGE_KEY,
      settingsStorageKey: MOOFLIGHTS_SETTINGS_STORAGE_KEY,
      fixtures: {
        US: googleFlightsCountryFixture("US"),
        CA: googleFlightsCountryFixture("CA"),
        ZA: googleFlightsCountryFixture("ZA"),
      },
      urls: {
        US: countryUrl(pageUrl, "US"),
        CA: countryUrl(pageUrl, "CA"),
        ZA: countryUrl(pageUrl, "ZA"),
      },
    },
  );
}

function countryUrl(pageUrl: string, country: string): string {
  const url = new URL(pageUrl);
  url.searchParams.set("gl", country);
  return url.toString();
}

function matrixSearchFixture(): string {
  return htmlFixture(`
    <main>
      <h1>ITA Matrix search</h1>
      <form aria-label="Search flights">
        <input aria-label="Origin" value="">
        <input aria-label="Destination" value="">
      </form>
    </main>
  `);
}

function matrixItineraryFixture(): string {
  return htmlFixture(`
    <main>
      <h1>ITA Matrix itinerary</h1>
      <button type="button">Share & Export</button>
    </main>
  `);
}

function googleFlightsBookingFixture(url: string): string {
  const country = new URL(url).searchParams.get("gl") || "US";
  const countryFixture = googleFlightsCountryFixture(country);

  return htmlFixture(`
    <main>
      <h1>Google Flights booking fixture</h1>
      <a class="gN1nAc" href="https://book.example/${country.toLowerCase()}/cheap">
        <span class="ogfYpf">Book with ${countryFixture.provider}</span>
        <span aria-label="${countryFixture.cheapest} US dollars">$${countryFixture.cheapest.toLocaleString()}</span>
      </a>
      <a class="gN1nAc" href="https://airline.example/${country.toLowerCase()}">
        <span class="ogfYpf">Book with American</span>
        <span class="EA71Tc">Direct</span>
        <span role="text">$${countryFixture.direct.toLocaleString()}</span>
      </a>
    </main>
  `);
}

function googleFlightsCountryFixture(country: string): { cheapest: number; direct: number; provider: string } {
  if (country === "CA") return { cheapest: 900, direct: 1120, provider: "Canada Deals" };
  if (country === "ZA") return { cheapest: 870, direct: 1300, provider: "South Africa Deals" };
  return { cheapest: 950, direct: 1050, provider: "Example Travel" };
}

function htmlFixture(body: string): string {
  return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <title>MooFlights E2E fixture</title>
      </head>
      <body>${body}</body>
    </html>`;
}

function tfsSearchSlice(departureDate: string, origin: string, destination: string, ...fields: string[]): string {
  const value = `\x12\x0a${departureDate}${tfsAirportField(13, origin)}${tfsAirportField(14, destination)}${fields.join(
    "",
  )}`;
  return `\x1a${String.fromCharCode(value.length)}${value}`;
}

function tfsAirportField(fieldNumber: number, airport: string): string {
  return `${String.fromCharCode((fieldNumber << 3) | 2)}\x07\x08\x01\x12\x03${airport}`;
}

function encodeTfsText(parts: string[]): string {
  return Buffer.from(parts.join(""), "binary")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function decodeTfsText(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(`${normalized}${"=".repeat((4 - (normalized.length % 4)) % 4)}`, "base64").toString("binary");
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
