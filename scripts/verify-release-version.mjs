import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const releaseTag = process.argv[2] || process.env.RELEASE_TAG || "";

const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const manifest = JSON.parse(await readFile(resolve(root, "src/manifest.json"), "utf8"));

const packageVersion = String(packageJson.version || "");
const manifestVersion = String(manifest.version || "");

if (!packageVersion) throw new Error("package.json version is missing.");
if (!manifestVersion) throw new Error("src/manifest.json version is missing.");
if (packageVersion !== manifestVersion) {
  throw new Error(`Version mismatch: package.json has ${packageVersion}, manifest has ${manifestVersion}.`);
}

if (releaseTag) {
  const expectedTag = `v${packageVersion}`;
  if (releaseTag !== expectedTag) {
    throw new Error(`Release tag ${releaseTag} does not match package/manifest version ${expectedTag}.`);
  }
}

console.log(`Release version OK: ${packageVersion}${releaseTag ? ` (${releaseTag})` : ""}`);
