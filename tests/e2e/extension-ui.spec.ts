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
  const sharing = page.getByRole("checkbox", { name: "Enable anonymous sharing and historical suggestions" });
  await expect(sharing).not.toBeChecked();
  await page.getByLabel("History API URL").fill("http://example.com");
  await sharing.click();
  await expect(page.getByRole("status")).toHaveText("Enter an HTTPS API origin, or localhost for development.");
  await expect(sharing).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Disable sharing and delete my shared history" })).toBeDisabled();
});
