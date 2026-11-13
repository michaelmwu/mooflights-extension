import { expect, test } from "./fixtures";

const shell = (body: string) => `<!doctype html><html lang="en"><body>${body}</body></html>`;
const grid = `<table><tr mat-header-row><th>Flight</th></tr><tr mat-row class="mat-mdc-row"><td>Thai Airways</td></tr>
<tr class="detail-row"><td colspan="1"><matrix-itinerary-grid><mat-list-item><div class="info-grid">
<div class="info-line"><b>Bangkok (BKK) to Tokyo (NRT)</b></div><div class="info-line">Thai Airways 640</div>
<div class="service-line">Economy (W)</div><div class="time-line">Duration (6h)</div>
<img class="carrier-img" src="https://matrix.itasoftware.com/TG.png"></div></mat-list-item></matrix-itinerary-grid></td></tr></table>`;

test.beforeEach(async ({ context }) => {
  await context.route("https://cdn.jsdelivr.net/**", (route) =>
    route.fulfill({ contentType: "application/json", body: '{"usd":{"jpy":150}}' }),
  );
  await context.route("https://api.fxratesapi.com/**", (route) => route.abort());
});

test("keeps the ITA stylesheet and delegated controls across panel renders", async ({ page }) => {
  await page.route("https://matrix.itasoftware.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: shell("<main>Matrix search</main>") }),
  );
  await page.goto("https://matrix.itasoftware.com/search");
  const panel = page.locator("#mooflights-panel");
  await expect(panel.getByLabel("Area", { exact: true })).toBeVisible();
  await panel.evaluate((host) => {
    (window as any).originalItaStyle = host.shadowRoot?.querySelector("style");
  });
  await panel.locator("summary[aria-label='Panel actions']").click();
  await panel.getByRole("button", { name: "Minimize", exact: true }).click();
  await panel.getByLabel("Expand MooFlights panel").click();
  await expect(panel.getByLabel("Area", { exact: true })).toBeVisible();
  await panel.getByLabel("Area", { exact: true }).fill("Japan");
  await panel.getByRole("option", { name: /Japan/ }).click();
  await expect.poll(() => panel.locator(".airport-chip").count()).toBeGreaterThan(0);
  const chip = panel.locator(".airport-chip").first();
  const code = await chip.getAttribute("data-code");
  await chip.click();
  await expect(panel.locator(`.airport-chip[data-code="${code}"]`)).toHaveCount(0);
  expect(
    await panel.evaluate((host) => host.shadowRoot?.querySelector("style") === (window as any).originalItaStyle),
  ).toBe(true);
});

test("annotates during continuous DOM changes and invalidates only a changed ITA grid", async ({ page }) => {
  await page.route("https://matrix.itasoftware.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: shell('<main id="results"></main><div id="stream"></div>') }),
  );
  await page.goto("https://matrix.itasoftware.com/flights");
  await page.evaluate((markup) => {
    const state = window as any;
    state.streamingTicks = 0;
    state.streamingTimer = setInterval(() => {
      state.streamingTicks++;
      document.getElementById("stream")?.append(document.createTextNode("."));
    }, 30);
    const results = document.getElementById("results");
    if (results) results.innerHTML = markup;
  }, grid);
  const line = page.locator(".mu-mileage-earnings");
  await expect(line).toHaveCount(1, { timeout: 1800 });
  expect(await page.evaluate(() => (window as any).streamingTicks)).toBeGreaterThan(0);
  await page.evaluate(() => {
    clearInterval((window as any).streamingTimer);
    (window as any).originalMileageLine = document.querySelector(".mu-mileage-earnings");
    (window as any).originalMileageSummary = document.querySelector("td.mu-mileage-column")?.firstElementChild;
    const stream = document.getElementById("stream");
    if (stream) stream.textContent = "Unrelated page update";
  });
  // Wait through the annotation debounce: unrelated DOM changes must not rewrite the cached grid.
  await page.waitForTimeout(350);
  expect(
    await page.evaluate(() => document.querySelector(".mu-mileage-earnings") === (window as any).originalMileageLine),
  ).toBe(true);
  expect(
    await page.evaluate(
      () =>
        document.querySelector("td.mu-mileage-column")?.firstElementChild === (window as any).originalMileageSummary,
    ),
  ).toBe(true);
  await page.evaluate(() => {
    const text = document.querySelector(".service-line")?.firstChild;
    if (text) text.textContent = "Economy (Y)";
  });
  await expect
    .poll(() =>
      page.evaluate(() => document.querySelector(".mu-mileage-earnings") !== (window as any).originalMileageLine),
    )
    .toBe(true);
  await expect(line).toHaveCount(1);
});
