import { expect, test } from "./fixtures";

function bookingFixture(price = 950): string {
  return `<!doctype html><html><body><main>
    <div class="gN1nAc"><span class="ogfYpf">Book with Example Travel</span><span role="text">$${price}</span></div>
    <div id="stream"></div>
  </main></body></html>`;
}

test("bounds mutation refreshes and keeps the stylesheet and delegated controls alive", async ({ context, page }) => {
  await context.route("https://www.google.com/travel/flights**", (route) =>
    route.fulfill({ contentType: "text/html", body: bookingFixture() }),
  );
  await page.goto("https://www.google.com/travel/flights/booking?tfs=performance-fixture&curr=USD&gl=US");
  const panel = page.locator("#mooflights-google-flights-panel");
  await expect(panel.getByRole("button", { name: "Compare (18)" })).toBeVisible();
  await panel.evaluate((host) => {
    const style = host.shadowRoot?.querySelector("style");
    if (!style) throw new Error("Panel stylesheet missing");
    style.dataset.testIdentity = "original";
  });
  await panel.getByLabel("Add a country").fill("FR");
  await panel.getByLabel("Add a country").press("Enter");
  await expect(panel.getByRole("button", { name: "Compare (19)" })).toBeVisible();
  await expect(panel.locator('style[data-test-identity="original"]')).toHaveCount(1);
  await expect(panel.locator("style")).toHaveCount(1);
  await panel.getByLabel("Add a country").fill("DE");
  await page.evaluate(() => {
    const stream = document.getElementById("stream");
    if (!stream) throw new Error("Streaming fixture missing");
    (window as any).streamInterval = setInterval(() => {
      stream.textContent = String(performance.now());
    }, 40);
    history.replaceState(null, "", "/travel/flights?unresolved=1");
  });
  await expect(panel).toHaveCount(0, { timeout: 2500 });
  await page.evaluate(() => {
    clearInterval((window as any).streamInterval);
  });
});

test("detects URL-only navigation without patching page history", async ({ context, page }) => {
  await context.route("https://www.google.com/travel/flights**", (route) =>
    route.fulfill({ contentType: "text/html", body: bookingFixture() }),
  );
  await page.goto("https://www.google.com/travel/flights/booking?tfs=performance-fixture&curr=USD&gl=US");
  const panel = page.locator("#mooflights-google-flights-panel");
  await expect(panel).toBeAttached();
  await page.evaluate(() => {
    history.pushState(null, "", "/travel/flights?unresolved=1");
  });
  await expect(panel).toHaveCount(0, { timeout: 2500 });
});

test("comparison worker tabs only answer parse messages and never install the panel", async ({
  context,
  page,
  extensionServiceWorker,
}) => {
  await extensionServiceWorker.evaluate(async () => {
    await chrome.storage.local.set({ muTravelSettings: { googleFlights: { countryCodes: ["US", "CA"] } } });
    const runtime = globalThis as any;
    const update = chrome.tabs.update;
    chrome.tabs.update = ((tabId: number, properties: chrome.tabs.UpdateProperties, callback: () => void) => {
      if (properties.url?.includes("mooFlightsComparisonWorker=")) {
        runtime.performanceWorkerNavigation = { tabId, url: properties.url, complete: callback };
        return;
      }
      return update(tabId, properties, callback);
    }) as typeof chrome.tabs.update;
  });
  await context.route("https://www.google.com/travel/flights**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: bookingFixture().replace(
        "</main>",
        '<button aria-label="View more flights" onclick="this.remove()">View more flights</button></main>',
      ),
    }),
  );
  await page.goto("https://www.google.com/travel/flights/booking?tfs=performance-fixture&curr=USD&gl=US");
  const panel = page.locator("#mooflights-google-flights-panel");
  const workerPagePromise = context.waitForEvent("page");
  await panel.getByRole("button", { name: "Compare (2)" }).click();
  const workerPage = await workerPagePromise;
  await expect
    .poll(() => extensionServiceWorker.evaluate(() => Boolean((globalThis as any).performanceWorkerNavigation)))
    .toBe(true);
  const navigation = await extensionServiceWorker.evaluate(() => {
    const pending = (globalThis as any).performanceWorkerNavigation;
    return { tabId: pending.tabId as number, url: pending.url as string };
  });
  await expect(panel.getByRole("button", { name: "Stop", exact: true })).toBeVisible();
  await workerPage.goto(navigation.url);
  await expect
    .poll(() =>
      extensionServiceWorker.evaluate(async (tabId) => {
        try {
          const result = await chrome.tabs.sendMessage(tabId, { command: "parseBookingOptions" });
          return result?.options?.length || 0;
        } catch {
          return 0;
        }
      }, navigation.tabId),
    )
    .toBe(1);
  const expansion = await extensionServiceWorker.evaluate(
    (tabId) =>
      chrome.tabs.sendMessage(tabId, {
        command: "expandGoogleFlightsSearchResults",
        waitForExpansion: true,
      }),
    navigation.tabId,
  );
  expect(expansion).toMatchObject({ ok: true, clicked: true });
  await expect(workerPage.locator("#mooflights-google-flights-panel")).toHaveCount(0);
  await extensionServiceWorker.evaluate(() => (globalThis as any).performanceWorkerNavigation.complete());
  await expect(panel.getByRole("button", { name: "Compare (2)" })).toBeEnabled();
  await expect.poll(() => workerPage.isClosed()).toBe(true);
});

test("restores cached search prices immediately after returning to a previous route", async ({
  context,
  page,
  extensionServiceWorker,
}) => {
  const firstUrl = "https://www.google.com/travel/flights/search?tfs=cache-return-a&curr=USD&gl=US";
  const otherUrl = firstUrl.replace("cache-return-a", "cache-return-b");
  await extensionServiceWorker.evaluate(async (url) => {
    const row = {
      rowKey: "stored-row",
      matchKey: "Thai Airways 7:00 AM 3:00 PM 6 hr Nonstop",
      rowIndex: 0,
      price: 200,
      currency: "USD",
      priceText: "$200",
      summaryText: "7:00 AM - 3:00 PM Thai Airways 6 hr Nonstop $200",
      carrierText: "Thai Airways",
      timeText: "7:00 AM - 3:00 PM",
      durationText: "6 hr",
      stopsText: "Nonstop",
      itineraryKey: "BKK-NRT-TG640-20270101",
      matchConfidence: "high",
    };
    await chrome.storage.local.set({
      muTravelSettings: { googleFlights: { countryCodes: ["US", "KR"] } },
      mooFlightsGoogleFlightsSearchComparisonCache: {
        fixture: {
          pageKey: "/travel/flights/search?tfs=cache-return-a&curr=USD",
          baselineSignature: "previous-row-order",
          selectedCountries: ["US", "KR"],
          cachedAt: Date.now(),
          results: [
            { country: "US", url, status: "ready", results: [row] },
            {
              country: "KR",
              url: url.replace("gl=US", "gl=KR"),
              status: "ready",
              results: [{ ...row, price: 180, priceText: "$180" }],
            },
          ],
        },
      },
    });
  }, firstUrl);
  await context.route("https://www.google.com/travel/flights**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body><ul><li class="pIav2d">
      <div class="wtdjmc">7:00 AM - 3:00 PM</div><div class="sSHqwe">Thai Airways</div><div>6 hr Nonstop</div>
      <div class="U3gSDe"><span class="YMlIz FpEdX" role="text">$200</span></div>
      <span data-travelimpactmodelwebsiteurl="https://www.google.com/travel/impact?itinerary=BKK-NRT-TG-640-20270101"></span>
    </li></ul></body></html>`,
    }),
  );
  await page.goto(firstUrl);
  const priceBadge = page.locator("[data-moo-flights-search-badge]", { hasText: "South Korea $180" });
  await expect(priceBadge).toBeVisible();
  for (let visit = 0; visit < 2; visit += 1) {
    await page.evaluate((url) => history.pushState(null, "", url), otherUrl);
    await expect(priceBadge).toHaveCount(0, { timeout: 2500 });
    await page.evaluate((url) => history.pushState(null, "", url), firstUrl);
    await expect(priceBadge).toBeVisible({ timeout: 2500 });
  }
});
