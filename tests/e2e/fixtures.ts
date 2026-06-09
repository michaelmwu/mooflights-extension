import path from "node:path";
import { type BrowserContext, test as base, chromium, expect, type Page, type Worker } from "@playwright/test";

type ExtensionFixtures = {
  extensionId: string;
  extensionServiceWorker: Worker;
  openExtensionPage: (extensionPath: string) => Promise<Page>;
};

const extensionPath = path.resolve("dist");

export const test = base.extend<ExtensionFixtures>({
  context: async ({ headless }, use, testInfo) => {
    const context = await chromium.launchPersistentContext(testInfo.outputPath("user-data-dir"), {
      channel: "chromium",
      headless,
      viewport: { width: 1280, height: 900 },
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });

    await settleInitialInstall(context);
    await use(context);
    await context.close();
  },

  extensionServiceWorker: async ({ context }, use) => {
    await use(await extensionServiceWorker(context));
  },

  extensionId: async ({ extensionServiceWorker }, use) => {
    const extensionId = extensionServiceWorker.url().split("/")[2] || "";
    await use(extensionId);
  },

  openExtensionPage: async ({ context, extensionId }, use) => {
    await use(async (extensionPagePath: string) => {
      const page = await context.newPage();
      const normalizedPath = extensionPagePath.replace(/^\/+/, "");
      await page.goto(`chrome-extension://${extensionId}/${normalizedPath}`);
      return page;
    });
  },
});

export { expect };

async function extensionServiceWorker(context: BrowserContext): Promise<Worker> {
  const existingWorker = context.serviceWorkers().find(isExtensionServiceWorker);
  if (existingWorker) return existingWorker;
  return await context.waitForEvent("serviceworker", { predicate: isExtensionServiceWorker });
}

function isExtensionServiceWorker(worker: Worker): boolean {
  return worker.url().startsWith("chrome-extension://");
}

async function settleInitialInstall(context: BrowserContext): Promise<void> {
  await extensionServiceWorker(context);

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const optionsPage = context.pages().find(isOptionsPage);
    if (optionsPage) {
      await optionsPage.waitForLoadState("domcontentloaded").catch(() => undefined);
      break;
    }

    await context
      .waitForEvent("page", { timeout: 100 })
      .then((page) => page.waitForLoadState("domcontentloaded").catch(() => undefined))
      .catch(() => undefined);
  }

  await Promise.all(
    context
      .pages()
      .filter(isOptionsPage)
      .map((page) => page.close().catch(() => undefined)),
  );
}

function isOptionsPage(page: Page): boolean {
  return page.url().startsWith("chrome-extension://") && page.url().endsWith("/options/index.html");
}
