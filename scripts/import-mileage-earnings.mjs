import { constants } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const sourcePath = await mileageEarningSourcePath();
const outPath = resolve(root, "src/shared/data/mileage-earning.json");

const source = JSON.parse(await readFile(sourcePath, "utf8"));
const compact = {
  f: source.fetched_at || new Date().toISOString(),
  n: "Compact local copy of all redeemable mileage rows from the MooTravel reference snapshot.",
  p: [],
  a: {},
};
const programIndexes = new Map();

for (const [iata, airline] of Object.entries(source.airlines || {})) {
  const bookingClasses = {};
  for (const [bookingClass, row] of Object.entries(airline.booking_classes || {})) {
    const rows = compactRows(row.redeemable_miles || []);
    if (rows.length > 0) bookingClasses[bookingClass] = rows;
  }
  if (Object.keys(bookingClasses).length > 0) compact.a[iata] = [airline.name || iata, bookingClasses];
}
compact.p = Array.from(programIndexes.keys());

await writeFile(outPath, `${JSON.stringify(compact)}\n`);

function compactRows(rows) {
  const seen = new Set();
  const compactRows = [];
  const hasAeroplanRevenueRows = rows.some((row) => {
    const base = row.base || {};
    return normalizedProgram(row.program) === "Air Canada Aeroplan" && isAeroplanRevenueValue(base.value);
  });
  for (const row of rows) {
    const base = row.base || {};
    const value = typeof base.value === "string" ? base.value : null;
    const percent = typeof base.percent === "number" ? base.percent : null;
    const program = normalizedProgram(row.program);
    if (!program || (!value && percent === null)) continue;
    if (program === "Air Canada Aeroplan" && hasAeroplanRevenueRows && !isAeroplanRevenueValue(value)) continue;
    if (percent === 0 || value === "0%" || value === "0 Miles") continue;
    const key = [program, percent ?? "", value ?? ""].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    compactRows.push([programIndex(program), percent, value]);
  }
  return compactRows;
}

function normalizedProgram(program) {
  if (program === "Air Canada Aeroplan 2026") return "Air Canada Aeroplan";
  return program || "";
}

function isAeroplanRevenueValue(value) {
  return typeof value === "string" && /\bMiles\/CAD\b/i.test(value);
}

function programIndex(program) {
  const existing = programIndexes.get(program);
  if (existing !== undefined) return existing;
  const next = programIndexes.size;
  programIndexes.set(program, next);
  return next;
}

async function mileageEarningSourcePath() {
  if (process.argv[2]) return resolve(root, process.argv[2]);
  const localDefault = resolve(root, "data/reference/wheretocredit.json");
  try {
    await access(localDefault, constants.R_OK);
    return localDefault;
  } catch {
    console.error(
      "Usage: bun run import:mileage-earnings -- <path-to-source-json>\nExpected source shape: data/reference/wheretocredit.json",
    );
    process.exit(1);
  }
}
