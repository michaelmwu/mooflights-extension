import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const SOURCES = [
  "https://raw.githubusercontent.com/lxndrblz/Airports/refs/heads/main/airports.csv",
  "https://raw.githubusercontent.com/lxndrblz/Airports/refs/heads/main/citycodes.csv",
];

const OUTPUT = "src/shared/data/airport-coordinates-compact.json";
const coordinates = {};

for (const source of SOURCES) {
  const response = await fetch(source);
  if (!response.ok) throw new Error(`Failed to fetch ${source}: ${response.status}`);
  const rows = parseCsv(await response.text());
  const header = rows.shift();
  if (!header) continue;
  const index = Object.fromEntries(header.map((name, fieldIndex) => [name, fieldIndex]));

  for (const row of rows) {
    const code = row[index.code];
    const lat = Number(row[index.latitude]);
    const lon = Number(row[index.longitude]);
    if (!/^[A-Z0-9]{3}$/.test(code) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    coordinates[code] = [Math.round(lat * 10_000), Math.round(lon * 10_000)];
  }
}

const output = {
  provider: "lxndrblz/Airports",
  license: "CC-BY-SA-4.0",
  source_urls: SOURCES,
  fetched_at: new Date().toISOString(),
  precision: "latitude and longitude are stored as integer degrees * 10000",
  coordinates,
};

const target = resolve(process.cwd(), OUTPUT);
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(output)}\n`);
console.log(`Wrote ${Object.keys(coordinates).length} airport/city-code coordinates to ${OUTPUT}`);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
