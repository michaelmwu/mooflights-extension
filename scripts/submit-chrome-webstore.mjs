import { readdir, readFile, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";

const root = process.cwd();
const REQUEST_TIMEOUT_MS = 30_000;
const args = parseArgs(process.argv.slice(2));
const dryRun = booleanArg("dry-run", process.env.CHROME_WEBSTORE_DRY_RUN === "1");
const uploadOnly = booleanArg("upload-only", process.env.CHROME_WEBSTORE_UPLOAD_ONLY === "1");
const publishType = stringArg("publish-type", process.env.CHROME_WEBSTORE_PUBLISH_TYPE || "STAGED_PUBLISH");
const allowWarnings = booleanArg("allow-warnings", false);
const blockOnWarnings = !allowWarnings && process.env.CHROME_WEBSTORE_BLOCK_ON_WARNINGS !== "0";
const skipReview = booleanArg("skip-review", process.env.CHROME_WEBSTORE_SKIP_REVIEW === "1");
const artifactPath = resolve(root, optionArg("artifact") || (await detectZipArtifact()));
const artifact = await stat(artifactPath);

if (!artifact.isFile()) throw new Error(`Chrome Web Store artifact is not a file: ${artifactPath}`);
if (!artifactPath.endsWith(".zip")) throw new Error(`Chrome Web Store artifact must be a .zip file: ${artifactPath}`);

const config = {
  CHROME_WEBSTORE_CLIENT_ID: process.env.CHROME_WEBSTORE_CLIENT_ID || "",
  CHROME_WEBSTORE_CLIENT_SECRET: process.env.CHROME_WEBSTORE_CLIENT_SECRET || "",
  CHROME_WEBSTORE_REFRESH_TOKEN: process.env.CHROME_WEBSTORE_REFRESH_TOKEN || "",
  CHROME_WEBSTORE_PUBLISHER_ID: process.env.CHROME_WEBSTORE_PUBLISHER_ID || "",
  CHROME_WEBSTORE_EXTENSION_ID: process.env.CHROME_WEBSTORE_EXTENSION_ID || "",
};
const missing = Object.entries(config)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (!["DEFAULT_PUBLISH", "STAGED_PUBLISH"].includes(publishType)) {
  throw new Error(`Unsupported publish type "${publishType}". Use DEFAULT_PUBLISH or STAGED_PUBLISH.`);
}

const publishPayload = {
  publishType,
  skipReview,
  blockOnWarnings,
};

if (dryRun) {
  console.log(`Chrome Web Store dry run: ${basename(artifactPath)} (${artifact.size} bytes)`);
  console.log(
    `Would upload to item: ${config.CHROME_WEBSTORE_PUBLISHER_ID || "<CHROME_WEBSTORE_PUBLISHER_ID>"}/${config.CHROME_WEBSTORE_EXTENSION_ID || "<CHROME_WEBSTORE_EXTENSION_ID>"}`,
  );
  console.log(
    uploadOnly ? "Would stop after upload." : `Would publish with payload: ${JSON.stringify(publishPayload)}`,
  );
  if (missing.length > 0) console.log(`Missing live-submit env vars: ${missing.join(", ")}`);
  process.exit(0);
}

if (missing.length > 0) {
  throw new Error(`Missing Chrome Web Store env vars: ${missing.join(", ")}`);
}

const itemName = `publishers/${config.CHROME_WEBSTORE_PUBLISHER_ID}/items/${config.CHROME_WEBSTORE_EXTENSION_ID}`;
const token = await accessToken(config);
const upload = await uploadZip(token, itemName, artifactPath);
const uploadState = upload.uploadState || "UPLOAD_STATE_UNSPECIFIED";
console.log(`Chrome Web Store upload state: ${uploadState}${upload.crxVersion ? ` (${upload.crxVersion})` : ""}`);

if (isUploadInProgress(uploadState)) {
  await waitForUpload(token, itemName);
} else {
  assertUploadSucceeded(uploadState, "upload");
}

if (uploadOnly) {
  console.log("Chrome Web Store upload complete. Skipping publish because --upload-only was set.");
  process.exit(0);
}

const publish = await postJson(
  `https://chromewebstore.googleapis.com/v2/${itemName}:publish`,
  token,
  publishPayload,
  "publish",
);
console.log(`Chrome Web Store publish state: ${publish.state || "unknown"}`);
if (publish.warningInfo?.warnings?.length) {
  console.log(`Chrome Web Store warnings: ${JSON.stringify(publish.warningInfo.warnings)}`);
}

async function accessToken(config) {
  const response = await fetchJson(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.CHROME_WEBSTORE_CLIENT_ID,
        client_secret: config.CHROME_WEBSTORE_CLIENT_SECRET,
        refresh_token: config.CHROME_WEBSTORE_REFRESH_TOKEN,
        grant_type: "refresh_token",
      }),
    },
    "token exchange",
  );
  if (!response.access_token) throw new Error("OAuth token response did not include access_token.");
  return response.access_token;
}

async function uploadZip(token, itemName, path) {
  const body = await readFile(path);
  return fetchJson(
    `https://chromewebstore.googleapis.com/upload/v2/${itemName}:upload?uploadType=media`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/zip",
      },
      body,
    },
    "package upload",
  );
}

async function waitForUpload(token, itemName) {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    await sleep(10_000);
    const status = await fetchJson(
      `https://chromewebstore.googleapis.com/v2/${itemName}:fetchStatus`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
      "upload status",
    );
    const uploadState = status.lastAsyncUploadState || "UPLOAD_STATE_UNSPECIFIED";
    console.log(`Chrome Web Store async upload state ${attempt}/12: ${uploadState}`);
    if (uploadState === "SUCCEEDED") return;
    if (!isUploadInProgress(uploadState)) {
      throw new Error(`Chrome Web Store async upload did not succeed: ${uploadState}`);
    }
  }
  throw new Error("Chrome Web Store async upload did not finish within 120 seconds.");
}

async function postJson(url, token, payload, label) {
  return fetchJson(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    label,
  );
}

async function fetchJson(url, init, label) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, REQUEST_TIMEOUT_MS);

  if (init?.signal?.aborted) {
    controller.abort();
  } else {
    init?.signal?.addEventListener("abort", abort, { once: true });
  }

  let text = "";
  let response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
    text = await response.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Chrome Web Store ${label} request failed: ${message}`);
  } finally {
    clearTimeout(timeout);
    init?.signal?.removeEventListener("abort", abort);
  }
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  if (!response.ok) {
    throw new Error(`Chrome Web Store ${label} failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function detectZipArtifact() {
  const artifactsDir = resolve(root, "artifacts");
  const entries = await readdir(artifactsDir).catch(() => []);
  const candidates = entries.filter((entry) => /^mooflights-[^/]+\.zip$/.test(entry));
  if (candidates.length !== 1) {
    throw new Error(
      `Expected exactly one artifacts/mooflights-*.zip file; found ${candidates.length}. Pass --artifact=path.`,
    );
  }
  return resolve(artifactsDir, candidates[0]);
}

function parseArgs(values) {
  const parsed = new Map();
  for (const value of values) {
    if (!value.startsWith("--")) throw new Error(`Unexpected argument: ${value}`);
    const body = value.slice(2);
    const separator = body.indexOf("=");
    if (separator === -1) {
      parsed.set(body, "");
    } else {
      parsed.set(body.slice(0, separator), body.slice(separator + 1));
    }
  }
  return parsed;
}

function optionArg(name) {
  if (!args.has(name)) return "";
  const value = args.get(name);
  if (!value) throw new Error(`--${name} requires a value. Use --${name}=value.`);
  return value;
}

function booleanArg(name, fallback) {
  if (!args.has(name)) return fallback;
  const value = args.get(name);
  if (!value) return true;
  const normalized = value.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  throw new Error(`--${name} requires a boolean value. Use true/false or 1/0.`);
}

function stringArg(name, value) {
  if (args.has(name) && !args.get(name)) throw new Error(`--${name} requires a value. Use --${name}=value.`);
  const cliValue = args.get(name);
  return String(cliValue || value || "").trim();
}

function isUploadInProgress(uploadState) {
  return uploadState === "IN_PROGRESS" || uploadState === "UPLOAD_IN_PROGRESS";
}

function assertUploadSucceeded(uploadState, label) {
  if (uploadState !== "SUCCEEDED") throw new Error(`Chrome Web Store ${label} did not succeed: ${uploadState}`);
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
