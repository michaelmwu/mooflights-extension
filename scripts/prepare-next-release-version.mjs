import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const packageJsonPath = resolve(root, "package.json");
const manifestPath = resolve(root, "src/manifest.json");
const strategy = releaseStrategy();

const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8"));
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const existingVersions = new Set(
  [packageJson.version, manifest.version].filter(Boolean).map((version) => `v${version}`),
);

for (const tag of await releaseTags()) existingVersions.add(tag);

const latestVersion = latestSemver([...existingVersions]);
const nextVersion = nextAvailableVersion(latestVersion, existingVersions, strategy);

packageJson.version = nextVersion;
manifest.version = nextVersion;

await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Prepared ${strategy} release version ${nextVersion} (tag v${nextVersion})`);

function releaseStrategy() {
  const flag = process.argv.find((arg) => arg.startsWith("--next="));
  const value = flag ? flag.slice("--next=".length) : "patch";
  if (value === "patch" || value === "minor") return value;
  throw new Error(`Unsupported release strategy "${value}". Use --next=patch or --next=minor.`);
}

async function releaseTags() {
  try {
    const { stdout } = await execFileAsync("git", ["tag", "--list", "v[0-9]*.[0-9]*.[0-9]*"]);
    return stdout
      .split("\n")
      .map((tag) => tag.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function latestSemver(versions) {
  return versions.map(parseSemver).filter(Boolean).sort(compareSemver).at(-1) || { major: 0, minor: 0, patch: 0 };
}

function nextAvailableVersion(version, existingTags, next) {
  let candidate =
    next === "minor"
      ? { major: version.major, minor: version.minor + 1, patch: 0 }
      : { major: version.major, minor: version.minor, patch: version.patch + 1 };
  while (existingTags.has(`v${formatSemver(candidate)}`)) {
    candidate =
      next === "minor"
        ? { major: candidate.major, minor: candidate.minor + 1, patch: 0 }
        : { major: candidate.major, minor: candidate.minor, patch: candidate.patch + 1 };
  }
  return formatSemver(candidate);
}

function parseSemver(value) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value || ""));
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareSemver(left, right) {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

function formatSemver(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}
