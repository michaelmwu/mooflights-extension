import { expect, test } from "./fixtures";

test("loads the Manifest V3 service worker", async ({ extensionId, extensionServiceWorker }) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);

  const manifest = await extensionServiceWorker.evaluate(() => chrome.runtime.getManifest());
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.name).toBe("MooFlights");
});

test("renders the popup against extension storage defaults", async ({ openExtensionPage }) => {
  const page = await openExtensionPage("popup/index.html");

  await expect(page.getByRole("heading", { name: "MooFlights" })).toBeVisible();
  await expect(page.getByText("Offline-first ITA Matrix tools.")).toBeVisible();
  await expect(page.getByText("Local only")).toBeVisible();
  await expect(page.getByText("Kayak")).toBeVisible();
});

test("persists Google Flights country settings from the options page", async ({ openExtensionPage }) => {
  const page = await openExtensionPage("options/index.html");

  await expect(page.getByRole("heading", { name: "MooFlights" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Google Flights" })).toBeVisible();

  await page.getByLabel("Add country").fill("FR");
  await page.getByRole("button", { name: "Add" }).click();

  await expect(page.getByText("Saved")).toBeVisible();
  await expect(page.getByText("France")).toBeVisible();

  await page.reload();

  await expect(page.getByText("France")).toBeVisible();
  await page.getByRole("button", { name: "Remove FR" }).click();
  await expect(page.getByText("France")).toBeHidden();
});

test("keeps community history off by default and validates the API URL before consent", async ({
  openExtensionPage,
}) => {
  const page = await openExtensionPage("options/index.html");
  const sharing = page.getByRole("checkbox", { name: "Help improve MooFlights" });
  await expect(sharing).not.toBeChecked();
  await page.getByLabel("History API URL").fill("http://example.com");
  await sharing.click();
  await expect(page.getByRole("status")).toHaveText("Enter an HTTPS API origin, or localhost for development.");
  await expect(sharing).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Turn off sharing and delete my contributions" })).toBeDisabled();
});

test("uses one benefit-led consent control for flight contributions and feature usage", async ({
  openExtensionPage,
  extensionServiceWorker,
}) => {
  const page = await openExtensionPage("options/index.html");
  const section = page.getByRole("heading", { name: "Community insights" }).locator("..");
  await expect(section.getByRole("checkbox")).toHaveCount(1);
  await expect(
    section.getByText(
      "Share flight comparisons and basic feature usage to improve country recommendations and mileage estimates.",
    ),
  ).toBeVisible();
  await expect(section.getByRole("link", { name: "What gets shared" })).toBeVisible();
  await page.evaluate(() => {
    chrome.permissions.request = async () => true;
  });
  await section.getByRole("checkbox", { name: "Help improve MooFlights" }).click();
  await expect(section.getByRole("checkbox")).toBeChecked();
  const settings = await extensionServiceWorker.evaluate(
    async () => (await chrome.storage.local.get("muTravelSettings")).muTravelSettings,
  );
  expect(settings.communityHistory).toMatchObject({
    enabled: true,
    consentVersion: "community-v2",
    baseUrl: "https://app.mooflights.com",
  });
  await section.getByRole("checkbox").click();
  await expect(section.getByRole("checkbox")).not.toBeChecked();
});

test("accepts explicit localhost ports for development API permissions", async ({ extensionServiceWorker }) => {
  const allowed = await extensionServiceWorker.evaluate(() =>
    chrome.permissions.contains({ origins: ["http://localhost:48731/*"] }),
  );
  expect(allowed).toBe(true);
});

test("preserves preferences changed while contribution deletion is pending", async ({
  openExtensionPage,
  extensionServiceWorker,
}) => {
  await extensionServiceWorker.evaluate(async () => {
    await chrome.storage.local.set({
      muTravelSettings: {
        communityHistory: { enabled: false, baseUrl: "https://app.mooflights.com", consentVersion: "" },
      },
    });
  });
  const page = await openExtensionPage("options/index.html");
  await page.evaluate(() => {
    chrome.runtime.sendMessage = (() =>
      new Promise((resolve) => {
        (window as any).finishDeletion = () => resolve({ ok: true });
      })) as typeof chrome.runtime.sendMessage;
  });
  await page.getByRole("button", { name: "Turn off sharing and delete my contributions" }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).finishDeletion)).toBe("function");
  await page.getByLabel("Add country").fill("FR");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove FR" })).toBeVisible();
  await page.evaluate(() => (window as any).finishDeletion());
  await expect(page.getByRole("button", { name: "Turn off sharing and delete my contributions" })).toBeDisabled();
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove FR" })).toBeVisible();
  const saved = await extensionServiceWorker.evaluate(
    async () => (await chrome.storage.local.get("muTravelSettings")).muTravelSettings,
  );
  expect(saved.communityHistory).toEqual({ enabled: false, consentVersion: "", baseUrl: "" });
});
