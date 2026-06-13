const HOOK_SCRIPT_ID = "moo-flights-skyscanner-search-page-hook";
const HOOK_SCRIPT_PATH = "content/skyscannerSearchPageHook.js";

const extensionRuntime =
  (
    globalThis as typeof globalThis & {
      browser?: { runtime?: { getURL?: (path: string) => string } };
      chrome?: { runtime?: { getURL?: (path: string) => string } };
    }
  ).chrome?.runtime ||
  (
    globalThis as typeof globalThis & {
      browser?: { runtime?: { getURL?: (path: string) => string } };
    }
  ).browser?.runtime;

if (!document.getElementById(HOOK_SCRIPT_ID) && typeof extensionRuntime?.getURL === "function") {
  const script = document.createElement("script");
  script.id = HOOK_SCRIPT_ID;
  script.src = extensionRuntime.getURL(HOOK_SCRIPT_PATH);
  script.async = false;
  script.addEventListener("load", () => script.remove());
  (document.documentElement || document.head).append(script);
}
