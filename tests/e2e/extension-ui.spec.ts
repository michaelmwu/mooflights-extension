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
  await page.getByText("Development API", { exact: true }).click();
  await page.getByLabel("History API URL").fill("http://example.com");
  await sharing.click();
  await expect(page.getByRole("status")).toHaveText("Enter an HTTPS API origin, or localhost for development.");
  await expect(sharing).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Prepare deletion request" })).toBeHidden();
  await expect(page.getByRole("link", { name: "Email deletion request" })).toHaveCount(0);
});

test("uses one benefit-led consent control for flight contributions and feature usage", async ({
  openExtensionPage,
  extensionServiceWorker,
}) => {
  const page = await openExtensionPage("options/index.html");
  const section = page.getByRole("region", { name: "Community insights" });
  await expect(section.getByRole("checkbox")).toHaveCount(1);
  await expect(
    section.getByText(
      "Share flight comparisons and basic feature usage to improve country recommendations and mileage estimates.",
    ),
  ).toBeVisible();
  await expect(section.getByRole("link", { name: "What gets shared" })).toBeVisible();
  await expect(section.locator(".community-retention")).toHaveText(
    "Grouped statistics without an installation link may remain after deletion.",
  );
  await section.screenshot({ path: ".context/qa/community-options.png" });
  const toggleBox = await section.getByRole("checkbox").boundingBox();
  expect(toggleBox?.width).toBe(38);
  expect(toggleBox?.height).toBe(22);
  await page.setViewportSize({ width: 360, height: 700 });
  await section.screenshot({ path: ".context/qa/community-options-mobile.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
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
    consentVersion: "community-v3",
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

test("keeps management collapsed and preserves preferences while preparing a deletion email reference", async ({
  openExtensionPage,
  extensionServiceWorker,
}) => {
  const reference = "4b126830-53c8-4017-8bb9-42ef5ac39c92";
  await extensionServiceWorker.evaluate(async () => {
    await chrome.storage.local.set({
      muTravelSettings: {
        communityHistory: { enabled: false, baseUrl: "https://app.mooflights.com", consentVersion: "community-v3" },
      },
    });
  });
  const page = await openExtensionPage("options/index.html");
  const management = page.locator("details.community-management");
  await expect(management).not.toHaveAttribute("open", "");
  await expect(page.getByRole("button", { name: "Prepare deletion request" })).toBeHidden();
  await page.getByText("Manage shared data", { exact: true }).click();
  await expect(
    management.getByText("Grouped statistics without an installation link may remain after deletion."),
  ).toBeVisible();
  await page.evaluate(() => {
    chrome.runtime.sendMessage = ((message: unknown) =>
      new Promise((resolve) => {
        (window as any).preparedMessage = message;
        (window as any).finishPreparation = (requestId: string) =>
          resolve({ ok: true, status: "pending", requestId, requestedAt: "2026-11-14T01:00:00Z" });
      })) as typeof chrome.runtime.sendMessage;
  });
  await page.getByRole("button", { name: "Prepare deletion request" }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as any).finishPreparation)).toBe("function");
  expect(await page.evaluate(() => (window as any).preparedMessage)).toEqual({
    command: "prepareHistoryDeletionRequest",
    baseUrl: "https://app.mooflights.com",
  });
  await page.getByLabel("Add country").fill("FR");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove FR" })).toBeVisible();
  await page.evaluate((requestId) => (window as any).finishPreparation(requestId), reference);
  const input = page.getByRole("textbox", { name: "Request reference" });
  await expect(input).toHaveValue(reference);
  await expect(input).toHaveAttribute("readonly", "");
  const email = page.getByRole("link", { name: "Email deletion request" });
  const href = await email.getAttribute("href");
  const mailto = new URL(href || "");
  expect(mailto.protocol).toBe("mailto:");
  expect(mailto.pathname).toBe("support@mooflights.com");
  expect(mailto.searchParams.get("body")).toBe(`Request reference: ${reference}`);
  expect(mailto.searchParams.get("subject")).toBe("MooFlights data deletion request");
  expect(href).not.toContain("contributor");
  await expect(page.getByRole("status")).toHaveText("Sharing is off. Email the reference below to request deletion.");
  await page.reload();
  await expect(page.getByRole("button", { name: "Remove FR" })).toBeVisible();
  const saved = await extensionServiceWorker.evaluate(() =>
    chrome.storage.local.get(["muTravelSettings", "mooFlightsCommunityPromptDecision"]),
  );
  expect(saved.muTravelSettings.communityHistory).toMatchObject({
    enabled: false,
    baseUrl: "https://app.mooflights.com",
  });
  expect(saved.mooFlightsCommunityPromptDecision).toBe("community-v3");
});

test("prepares no deletion session or network request when this installation has no contribution credential", async ({
  openExtensionPage,
  extensionServiceWorker,
}) => {
  await extensionServiceWorker.evaluate(() => {
    (globalThis as any).managementFetches = [];
    globalThis.fetch = (async (url: string) => {
      (globalThis as any).managementFetches.push(url);
      throw new Error("Unexpected network request");
    }) as typeof fetch;
  });
  const page = await openExtensionPage("options/index.html");
  await page.getByText("Manage shared data", { exact: true }).click();
  await page.getByRole("button", { name: "Prepare deletion request" }).click();
  await expect(page.getByRole("status")).toHaveText("No shared contributions are recorded for this installation.");
  await expect(page.getByRole("link", { name: "Email deletion request" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Request reference" })).toHaveCount(0);
  expect(await extensionServiceWorker.evaluate(() => (globalThis as any).managementFetches)).toEqual([]);
  const popup = await openExtensionPage("popup/index.html");
  await expect(popup.locator("main")).toHaveAttribute("aria-busy", "false");
  await expect(popup.getByRole("region", { name: "Better searches, together" })).toHaveCount(0);
});

test("accepts deletion preparation only from Options and exposes no contributor credential in its reference", async ({
  openExtensionPage,
  extensionServiceWorker,
}) => {
  const reference = "4b126830-53c8-4017-8bb9-42ef5ac39c92";
  await extensionServiceWorker.evaluate(async (requestId) => {
    (globalThis as any).preparedCalls = [];
    chrome.permissions.contains = async () => true;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      (globalThis as any).preparedCalls.push({ url, method: init.method });
      return new Response(JSON.stringify({ status: "pending", requestId, requestedAt: "2026-11-14T01:00:00Z" }), {
        status: 200,
      });
    }) as typeof fetch;
    await chrome.storage.local.set({
      muTravelSettings: {
        communityHistory: { enabled: false, consentVersion: "community-v3", baseUrl: "https://app.mooflights.com" },
      },
      mooFlightsHistoryContributorSessions: {
        "https://app.mooflights.com": "test-only-contributor-credential-for-browser-test",
      },
    });
  }, reference);
  const popup = await openExtensionPage("popup/index.html");
  const rejected = await popup.evaluate(async () => {
    try {
      return await chrome.runtime.sendMessage({
        command: "prepareHistoryDeletionRequest",
        baseUrl: "https://app.mooflights.com",
      });
    } catch {
      return undefined;
    }
  });
  expect(rejected).toBeUndefined();
  expect(
    await extensionServiceWorker.evaluate(() =>
      (globalThis as any).preparedCalls.filter((call: any) => call.url.endsWith("/deletion-request")),
    ),
  ).toEqual([]);
  const options = await openExtensionPage("options/index.html");
  await options.getByText("Manage shared data", { exact: true }).click();
  await options.getByRole("button", { name: "Prepare deletion request" }).click();
  await expect(options.getByRole("textbox", { name: "Request reference" })).toHaveValue(reference);
  expect(await options.locator(".community-management").textContent()).not.toContain("test-only-contributor");
  expect(await options.getByRole("link", { name: "Email deletion request" }).getAttribute("href")).not.toContain(
    "test-only-contributor",
  );
  expect(
    await extensionServiceWorker.evaluate(() =>
      (globalThis as any).preparedCalls.filter((call: any) => call.url.endsWith("/deletion-request")),
    ),
  ).toHaveLength(1);
});

test("offers sharing on first popup use and remembers a dismissal without opting in", async ({
  openExtensionPage,
  extensionServiceWorker,
}) => {
  const page = await openExtensionPage("popup/index.html");
  await page.setViewportSize({ width: 320, height: 600 });
  const banner = page.getByRole("region", { name: "Better searches, together" });
  await expect(banner).toBeVisible();
  await expect(banner.locator(".community-retention")).toHaveText(
    "Grouped statistics without an installation link may remain after deletion.",
  );
  await expect(banner).toHaveCSS("position", "sticky");
  await page.screenshot({ path: ".context/qa/community-popup.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await banner.getByRole("button", { name: "No thanks" }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false");
  await expect(banner).toHaveCount(0);
  const stored = await extensionServiceWorker.evaluate(() =>
    chrome.storage.local.get(["muTravelSettings", "mooFlightsCommunityPromptDecision"]),
  );
  expect(stored.muTravelSettings?.communityHistory?.enabled).not.toBe(true);
  expect(stored.mooFlightsCommunityPromptDecision).toBe("community-v3");
});

test("popup requires permission before opting in and updates sharing controls across views", async ({
  openExtensionPage,
  extensionServiceWorker,
}) => {
  const page = await openExtensionPage("popup/index.html");
  const banner = page.getByRole("region", { name: "Better searches, together" });
  await expect(banner).toBeVisible();
  await page.evaluate(() => {
    chrome.permissions.request = async () => false;
  });
  await banner.getByRole("button", { name: "Enable sharing" }).click();
  await expect(banner.getByRole("status")).toHaveText("Permission wasn’t granted. Sharing remains off.");
  await expect(banner).toBeVisible();
  const before = await extensionServiceWorker.evaluate(() => chrome.storage.local.get("muTravelSettings"));
  expect(before.muTravelSettings?.communityHistory?.enabled).not.toBe(true);
  await page.evaluate(() => {
    chrome.permissions.request = async (requested) => {
      (window as any).requestedOrigins = requested.origins;
      return true;
    };
  });
  await banner.getByRole("button", { name: "Enable sharing" }).click();
  await expect(banner).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).requestedOrigins)).toEqual(["https://app.mooflights.com/*"]);
  const options = await openExtensionPage("options/index.html");
  const toggle = options.getByRole("checkbox", { name: "Help improve MooFlights" });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await page.reload();
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false");
  await expect(banner).toHaveCount(0);
});

test("does not prompt existing users who have already chosen to turn sharing off", async ({
  openExtensionPage,
  extensionServiceWorker,
}) => {
  await extensionServiceWorker.evaluate(() =>
    chrome.storage.local.set({
      muTravelSettings: {
        communityHistory: { enabled: false, consentVersion: "community-v3", baseUrl: "https://app.mooflights.com" },
      },
    }),
  );
  const page = await openExtensionPage("popup/index.html");
  await expect(page.locator("main")).toHaveAttribute("aria-busy", "false");
  await expect(page.getByRole("region", { name: "Better searches, together" })).toHaveCount(0);
});

test("asks community-v2 users to accept the retention disclosure before community-v3 sharing resumes", async ({
  openExtensionPage,
  extensionServiceWorker,
}) => {
  await extensionServiceWorker.evaluate(async () => {
    (globalThis as any).transitionCalls = [];
    chrome.permissions.contains = async () => true;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      (globalThis as any).transitionCalls.push({ url, body: init.body ? JSON.parse(String(init.body)) : null });
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    await chrome.storage.local.set({
      muTravelSettings: {
        communityHistory: { enabled: true, consentVersion: "community-v2", baseUrl: "https://app.mooflights.com" },
      },
      mooFlightsCommunityPromptDecision: "community-v2",
      mooFlightsHistoryContributorSessions: {
        "https://app.mooflights.com": "test-only-contributor-credential-for-browser-test",
      },
    });
  });
  const options = await openExtensionPage("options/index.html");
  await expect(options.getByRole("checkbox", { name: "Help improve MooFlights" })).not.toBeChecked();
  const popup = await openExtensionPage("popup/index.html");
  const banner = popup.getByRole("region", { name: "Better searches, together" });
  await expect(banner).toBeVisible();
  await expect(banner.locator(".community-retention")).toHaveText(
    "Grouped statistics without an installation link may remain after deletion.",
  );
  const before = await extensionServiceWorker.evaluate(() => (globalThis as any).transitionCalls);
  expect(
    before.every(
      (call: any) =>
        call.url.endsWith("/contributor-sessions/current") &&
        call.body.historyEnabled === false &&
        call.body.retentionConsentVersion === null,
    ),
  ).toBe(true);
  await popup.evaluate(() => {
    chrome.permissions.request = async () => true;
  });
  await banner.getByRole("button", { name: "Enable sharing" }).click();
  await expect(banner).toHaveCount(0);
  await expect
    .poll(() =>
      extensionServiceWorker.evaluate(() =>
        (globalThis as any).transitionCalls.some(
          (call: any) => call.body?.historyEnabled === true && call.body?.retentionConsentVersion === "aggregate-v1",
        ),
      ),
    )
    .toBe(true);
  const saved = await extensionServiceWorker.evaluate(() =>
    chrome.storage.local.get(["muTravelSettings", "mooFlightsCommunityPromptDecision"]),
  );
  expect(saved.muTravelSettings.communityHistory).toMatchObject({ enabled: true, consentVersion: "community-v3" });
  expect(saved.mooFlightsCommunityPromptDecision).toBe("community-v3");
});

test("restores saved sharing state and reports an opt-out persistence failure before preparing deletion", async ({
  openExtensionPage,
  extensionServiceWorker,
}) => {
  await extensionServiceWorker.evaluate(() =>
    chrome.storage.local.set({
      muTravelSettings: {
        communityHistory: { enabled: true, consentVersion: "community-v3", baseUrl: "https://app.mooflights.com" },
      },
    }),
  );
  const page = await openExtensionPage("options/index.html");
  const sharing = page.getByRole("checkbox", { name: "Help improve MooFlights" });
  await expect(sharing).toBeChecked();
  await page.getByLabel("Add country").fill("FR");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name: "Remove FR" })).toBeVisible();
  await page.evaluate(() => {
    const save = chrome.storage.local.set.bind(chrome.storage.local);
    let failFirstOptOut = true;
    chrome.storage.local.set = (async (patch: Record<string, any>) => {
      if (failFirstOptOut && patch.muTravelSettings?.communityHistory?.enabled === false) {
        failFirstOptOut = false;
        throw new Error("Simulated storage failure");
      }
      await save(patch);
    }) as typeof chrome.storage.local.set;
    (window as any).deletionPreparationMessages = [];
    chrome.runtime.sendMessage = (async (message: unknown) => {
      (window as any).deletionPreparationMessages.push(message);
      return { ok: true, status: "no-contributions" };
    }) as typeof chrome.runtime.sendMessage;
  });
  await page.getByText("Manage shared data", { exact: true }).click();
  await page.getByRole("button", { name: "Prepare deletion request" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Could not confirm sharing is off. Check the sharing setting and try again.",
  );
  await expect(sharing).toBeChecked();
  await expect(page.getByRole("button", { name: "Remove FR" })).toBeVisible();
  expect(await page.evaluate(() => (window as any).deletionPreparationMessages)).toEqual([]);
  const saved = await extensionServiceWorker.evaluate(() => chrome.storage.local.get("muTravelSettings"));
  expect(saved.muTravelSettings.communityHistory.enabled).toBe(true);
  expect(saved.muTravelSettings.googleFlights.countryCodes).toContain("FR");
  await page.reload();
  await expect(sharing).toBeChecked();
  await expect(page.getByRole("button", { name: "Remove FR" })).toBeVisible();
});
