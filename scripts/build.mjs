import { execFile } from "node:child_process";
import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { promisify } from "node:util";
import esbuild from "esbuild";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const watch = process.argv.includes("--watch");
const stableDist = process.argv.includes("--stable-dist") || process.env.MU_TRAVEL_STABLE_EXTENSION_DIST === "1";
const dist = await distPath();
const devBuild = watch || process.argv.includes("--dev") || process.env.MU_TRAVEL_DEV_BUILD === "1";

const entries = [
  {
    entryPoints: ["src/content/itaMatrixContent.ts"],
    outfile: "content/itaMatrixContent.js",
    format: "iife",
  },
  {
    entryPoints: ["src/content/itaMatrixPageBridge.ts"],
    outfile: "content/itaMatrixPageBridge.js",
    format: "iife",
  },
  {
    entryPoints: ["src/content/googleFlightsContent.ts"],
    outfile: "content/googleFlightsContent.js",
    format: "iife",
  },
  {
    entryPoints: ["src/background/serviceWorker.ts"],
    outfile: "background/serviceWorker.js",
    format: "esm",
  },
  {
    entryPoints: ["src/popup/main.tsx"],
    outfile: "popup/main.js",
    format: "iife",
  },
  {
    entryPoints: ["src/options/main.tsx"],
    outfile: "options/main.js",
    format: "iife",
  },
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

async function buildEntry(entry) {
  const outfile = resolve(dist, entry.outfile);
  await mkdir(dirname(outfile), { recursive: true });
  return {
    ...entry,
    outfile,
    bundle: true,
    sourcemap: devBuild,
    minify: !devBuild,
    target: "chrome114",
    legalComments: "linked",
    define: {
      "process.env.NODE_ENV": JSON.stringify(devBuild ? "development" : "production"),
      __MU_TRAVEL_DEV_BUILD__: JSON.stringify(devBuild),
    },
  };
}

const staticFiles = [
  ["src/popup/index.html", "popup/index.html"],
  ["src/options/index.html", "options/index.html"],
];

async function copyStaticFiles() {
  const manifest = JSON.parse(await readFile(resolve(root, "src/manifest.json"), "utf8"));
  manifest.optional_host_permissions = Array.from(
    new Set([
      ...(manifest.optional_host_permissions || []),
      "https://travel.mu-travel.com/*",
      ...(devBuild ? ["http://localhost/*", "http://127.0.0.1/*"] : []),
    ]),
  );
  manifest.web_accessible_resources = [
    {
      matches: ["https://matrix.itasoftware.com/*"],
      resources: ["content/itaMatrixPageBridge.js"],
    },
  ];
  await writeFile(resolve(dist, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  for (const [from, to] of staticFiles) {
    const target = resolve(dist, to);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(resolve(root, from), target);
  }

  await cp(resolve(root, "src/assets"), resolve(dist, "assets"), { recursive: true, force: true });

  await writeFile(
    resolve(dist, "OPEN_SOURCE_NOTICE.txt"),
    [
      "Mu Travel Flights Extension",
      "",
      "This browser extension is AGPL-3.0-only open-source software.",
      "The optional hosted Mu Travel backend is a separate closed-source service.",
      "",
      "Bundled airport coordinate data is derived from OurAirports public-domain data.",
      "Source: https://ourairports.com/data/",
      "Bundled carrier icons are local copies of Seats.aero 64px carrier assets.",
      "Source: https://seats.aero/static/carriers64/",
      "",
      "See README.md, LICENSE, and the repository docs for development and contribution details.",
      "",
    ].join("\n"),
  );
}

async function distPath() {
  if (process.env.MU_TRAVEL_DIST_DIR) return resolve(process.env.MU_TRAVEL_DIST_DIR);
  if (!stableDist) return resolve(root, "dist");

  const { stdout } = await execFileAsync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const commonGitDir = stdout.trim();
  const repoRoot = basename(commonGitDir) === ".git" ? dirname(commonGitDir) : root;
  return resolve(repoRoot, "dist");
}

if (watch) {
  const contexts = await Promise.all(entries.map(async (entry) => esbuild.context(await buildEntry(entry))));
  await copyStaticFiles();
  await Promise.all(contexts.map((context) => context.watch()));
  console.log(`Watching extension sources in dev-build mode. Load or reload the unpacked extension from ${dist}.`);
} else {
  await Promise.all(entries.map(async (entry) => esbuild.build(await buildEntry(entry))));
  await copyStaticFiles();
  console.log(`Wrote extension build to ${dist}`);
}
