import { execFile } from "node:child_process";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const artifacts = resolve(root, "artifacts");
const zipPath = resolve(artifacts, "mu-travel-flights.zip");
const crxPath = resolve(artifacts, "mu-travel-flights.crx");
const generatedCrxPath = resolve(root, "dist.crx");
const generatedPemPath = resolve(root, "dist.pem");

await mkdir(artifacts, { recursive: true });
await rm(zipPath, { force: true });
await rm(crxPath, { force: true });
await rm(generatedCrxPath, { force: true });
await rm(generatedPemPath, { force: true });
try {
  await execFileAsync("zip", ["--version"]);
} catch {
  throw new Error("The `zip` CLI is required to package the extension. Install zip or run `bun run build` only.");
}
await execFileAsync("zip", ["-r", zipPath, "."], { cwd: resolve(root, "dist") });
console.log(`Wrote ${zipPath}`);

const chrome = await chromeExecutable();
if (!chrome) {
  throw new Error(
    "Chrome or Chromium is required to package the CRX. Set CHROME_BIN or install Google Chrome/Chromium.",
  );
}

const keyPath = await crxKeyPath();
const args = [`--pack-extension=${resolve(root, "dist")}`, "--no-sandbox"];
if (keyPath) args.push(`--pack-extension-key=${keyPath.path}`);

try {
  await execFileAsync(chrome, args);
  await rename(generatedCrxPath, crxPath);
  console.log(`Wrote ${crxPath}`);
} finally {
  if (keyPath?.temporary) await rm(keyPath.path, { force: true });
  await rm(generatedPemPath, { force: true });
}

async function chromeExecutable() {
  const candidates = [
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "google-chrome",
    "google-chrome-stable",
    "chromium",
    "chromium-browser",
    "chrome",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ["--version"]);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return "";
}

async function crxKeyPath() {
  if (process.env.MU_TRAVEL_CRX_KEY_B64) {
    const path = resolve(artifacts, ".mu-travel-crx-key.pem");
    await writeFile(path, Buffer.from(process.env.MU_TRAVEL_CRX_KEY_B64, "base64"));
    return { path, temporary: true };
  }
  if (process.env.MU_TRAVEL_CRX_KEY_PATH) return { path: process.env.MU_TRAVEL_CRX_KEY_PATH, temporary: false };
  return null;
}
