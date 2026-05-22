import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import esbuild from "esbuild";

const root = process.cwd();
const dist = resolve(root, "dist");
const watch = process.argv.includes("--watch");
const devBuild = watch || process.argv.includes("--dev") || process.env.MU_TRAVEL_DEV_BUILD === "1";

const entries = [
  {
    entryPoints: ["src/content/itaMatrixContent.ts"],
    outfile: "dist/content/itaMatrixContent.js",
    format: "iife",
  },
  {
    entryPoints: ["src/content/itaMatrixPageBridge.ts"],
    outfile: "dist/content/itaMatrixPageBridge.js",
    format: "iife",
  },
  {
    entryPoints: ["src/background/serviceWorker.ts"],
    outfile: "dist/background/serviceWorker.js",
    format: "esm",
  },
  {
    entryPoints: ["src/popup/main.tsx"],
    outfile: "dist/popup/main.js",
    format: "iife",
  },
  {
    entryPoints: ["src/options/main.tsx"],
    outfile: "dist/options/main.js",
    format: "iife",
  },
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

async function buildEntry(entry) {
  await mkdir(dirname(resolve(root, entry.outfile)), { recursive: true });
  return {
    ...entry,
    bundle: true,
    sourcemap: true,
    minify: false,
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
  ["src/shared/data/airports.json", "data/airports.json"],
];

async function copyStaticFiles() {
  const manifest = JSON.parse(await readFile(resolve(root, "src/manifest.json"), "utf8"));
  manifest.host_permissions = Array.from(
    new Set([
      ...(manifest.host_permissions || []),
      ...(devBuild ? ["https://travel.mu-travel.com/*", "http://localhost/*", "http://127.0.0.1/*"] : []),
    ]),
  );
  manifest.optional_host_permissions = Array.from(
    new Set([...(manifest.optional_host_permissions || []), "https://travel.mu-travel.com/*"]),
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

  await writeFile(
    resolve(dist, "OPEN_SOURCE_NOTICE.txt"),
    [
      "Mu Travel Flights Extension",
      "",
      "This browser extension is AGPL-3.0-only open-source software.",
      "The optional hosted Mu Travel backend is a separate closed-source service.",
      "",
      "See README.md, LICENSE, and the repository docs for development and contribution details.",
      "",
    ].join("\n"),
  );
}

if (watch) {
  const contexts = await Promise.all(entries.map(async (entry) => esbuild.context(await buildEntry(entry))));
  await copyStaticFiles();
  await Promise.all(contexts.map((context) => context.watch()));
  console.log("Watching extension sources in dev-build mode. Reload the unpacked extension after rebuilds.");
} else {
  await Promise.all(entries.map(async (entry) => esbuild.build(await buildEntry(entry))));
  await copyStaticFiles();
}
