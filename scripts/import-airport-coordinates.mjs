import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const AIRPORTS_SOURCE = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const ATTRIBUTION_URL = "https://ourairports.com/data/";
const INCLUDED_TYPES = new Set(["large_airport", "medium_airport"]);

const OUTPUT = "src/shared/data/airport-coordinates-compact.json";
const coordinates = {};

const response = await fetch(AIRPORTS_SOURCE);
if (!response.ok) throw new Error(`Failed to fetch ${AIRPORTS_SOURCE}: ${response.status}`);
const rows = parseCsv(await response.text());
const header = rows.shift();
if (!header) throw new Error("OurAirports CSV was missing a header row.");
const index = Object.fromEntries(header.map((name, fieldIndex) => [name, fieldIndex]));

for (const row of rows) {
  const type = row[index.type];
  const code = row[index.iata_code];
  const lat = Number(row[index.latitude_deg]);
  const lon = Number(row[index.longitude_deg]);
  if (!INCLUDED_TYPES.has(type)) continue;
  if (!/^[A-Z0-9]{3}$/.test(code) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  coordinates[code] = [Math.round(lat * 10_000), Math.round(lon * 10_000)];
}

const output = {
  provider: "OurAirports",
  license: "Public Domain",
  source_urls: [AIRPORTS_SOURCE, ATTRIBUTION_URL],
  fetched_at: new Date().toISOString(),
  included_types: Array.from(INCLUDED_TYPES).sort(),
  precision: "latitude and longitude are stored as integer degrees * 10000",
  coordinates,
};

const target = resolve(process.cwd(), OUTPUT);
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(output)}\n`);
console.log(`Wrote ${Object.keys(coordinates).length} medium/large airport coordinates to ${OUTPUT}`);

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
