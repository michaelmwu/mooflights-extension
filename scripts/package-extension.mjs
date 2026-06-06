import { execFile } from "node:child_process";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const artifacts = resolve(root, "artifacts");
const packageVersion = await extensionVersion();
const artifactBaseName = `mu-travel-flights-${packageVersion}`;
const zipPath = resolve(artifacts, `${artifactBaseName}.zip`);
const crxPath = resolve(artifacts, `${artifactBaseName}.crx`);
const generatedCrxPath = resolve(root, "dist.crx");
const generatedPemPath = resolve(root, "dist.pem");
const providedCrxKeyPath = process.env.MU_TRAVEL_CRX_KEY_PATH ? resolve(process.env.MU_TRAVEL_CRX_KEY_PATH) : "";

await mkdir(artifacts, { recursive: true });
await removeExistingPackageArtifacts();
await rm(generatedCrxPath, { force: true });
if (!isProvidedCrxKeyPath(generatedPemPath)) await rm(generatedPemPath, { force: true });
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
if (!keyPath && process.env.MU_TRAVEL_REQUIRE_CRX_KEY === "1") {
  throw new Error(
    "A stable CRX signing key is required for release packaging. Set MU_TRAVEL_CRX_KEY_B64 or MU_TRAVEL_CRX_KEY_PATH.",
  );
}
const args = [`--pack-extension=${resolve(root, "dist")}`, "--no-sandbox"];
if (keyPath) args.push(`--pack-extension-key=${keyPath.path}`);

try {
  await execFileAsync(chrome, args);
  await rename(generatedCrxPath, crxPath);
  console.log(`Wrote ${crxPath}`);
} finally {
  if (keyPath?.temporary) await rm(keyPath.path, { force: true });
  await rm(generatedCrxPath, { force: true });
  if (!isProvidedCrxKeyPath(generatedPemPath)) await rm(generatedPemPath, { force: true });
}

async function extensionVersion() {
  const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const version = String(packageJson.version || "").trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Invalid package.json version "${version}".`);
  return version;
}

async function removeExistingPackageArtifacts() {
  const entries = await readdir(artifacts);
  await Promise.all(
    entries
      .filter((entry) => /^mu-travel-flights(?:-\d+\.\d+\.\d+)?\.(zip|crx)$/.test(entry))
      .map((entry) => rm(resolve(artifacts, entry), { force: true })),
  );
}

function isProvidedCrxKeyPath(path) {
  return Boolean(providedCrxKeyPath && resolve(path) === providedCrxKeyPath);
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
  if (process.env.MU_TRAVEL_CRX_KEY_PATH) return { path: providedCrxKeyPath, temporary: false };
  return null;
}
