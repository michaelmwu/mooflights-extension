import { spawnSync } from "node:child_process";

process.env.MOOFLIGHTS_REAL_E2E ||= "1";

const result = spawnSync("playwright", ["test", "tests/e2e/real-sites.spec.ts", "--headed"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(typeof result.status === "number" ? result.status : 1);
