import { execFile } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = process.cwd();
const artifacts = resolve(root, "artifacts");
const zipPath = resolve(artifacts, "mu-travel-flights.zip");

await mkdir(artifacts, { recursive: true });
await rm(zipPath, { force: true });
try {
  await execFileAsync("zip", ["--version"]);
} catch {
  throw new Error("The `zip` CLI is required to package the extension. Install zip or run `bun run build` only.");
}
await execFileAsync("zip", ["-r", zipPath, "."], { cwd: resolve(root, "dist") });
console.log(`Wrote ${zipPath}`);
