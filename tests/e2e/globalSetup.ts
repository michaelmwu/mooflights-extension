import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export default async function globalSetup(): Promise<void> {
  await execFileAsync("bun", ["run", "build:dev"], {
    env: {
      ...process.env,
      MU_TRAVEL_DIST_DIR: "dist",
    },
  });
}
