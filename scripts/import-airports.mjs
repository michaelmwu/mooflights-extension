import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const AIRPORTS_SOURCE = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const ATTRIBUTION_URL = "https://ourairports.com/data/";
const ITA_MATRIX_LOCATION_SOURCE =
  "https://alkalimatrix-pa.googleapis.com/v1/locationTypes/airportOrMultiAirportCity/locationCodes";
const INCLUDED_TYPES = new Set(["large_airport", "medium_airport"]);
const REQUIRED_SCHEDULED_SERVICE = "yes";
const ITA_MATRIX_VALIDATION_CONCURRENCY = 24;

const OUTPUT = "src/shared/data/airports.json";
const airports = {};
const CONTINENTS = {
  AF: "Africa",
  AN: "Antarctica",
  AS: "Asia",
  EU: "Europe",
  NA: "North America",
  OC: "Oceania",
  SA: "South America",
};

const response = await fetch(AIRPORTS_SOURCE);
if (!response.ok) throw new Error(`Failed to fetch ${AIRPORTS_SOURCE}: ${response.status}`);
const rows = parseCsv(await response.text());
const header = rows.shift();
if (!header) throw new Error("OurAirports CSV was missing a header row.");
const index = Object.fromEntries(header.map((name, fieldIndex) => [name, fieldIndex]));

for (const row of rows) {
  const type = row[index.type];
  const code = row[index.iata_code];
  const name = row[index.name];
  const city = row[index.municipality];
  const country = row[index.iso_country];
  const continent = CONTINENTS[row[index.continent]] || row[index.continent];
  const scheduledService = row[index.scheduled_service];
  const lat = Number(row[index.latitude_deg]);
  const lon = Number(row[index.longitude_deg]);
  if (!INCLUDED_TYPES.has(type)) continue;
  if (scheduledService !== REQUIRED_SCHEDULED_SERVICE) continue;
  if (!/^[A-Z0-9]{3}$/.test(code) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  airports[code] = [
    compactString(name),
    compactString(city),
    compactString(country),
    compactString(continent),
    Math.round(lat * 10_000),
    Math.round(lon * 10_000),
  ];
}

const itaMatrixUnsupportedCodes = await unsupportedItaMatrixAirportCodes(Object.keys(airports));
for (const code of itaMatrixUnsupportedCodes) {
  delete airports[code];
}

const output = {
  provider: "OurAirports",
  license: "Public Domain",
  source_urls: [AIRPORTS_SOURCE, ATTRIBUTION_URL, ITA_MATRIX_LOCATION_SOURCE],
  fetched_at: new Date().toISOString(),
  included_types: Array.from(INCLUDED_TYPES).sort(),
  required_scheduled_service: REQUIRED_SCHEDULED_SERVICE,
  validated_with_ita_matrix_location_codes: true,
  excluded_unsupported_ita_matrix_codes: itaMatrixUnsupportedCodes,
  fields: ["name", "city", "country", "continent", "latitude", "longitude"],
  precision: "latitude and longitude are stored as integer degrees * 10000",
  airports,
};

const target = resolve(process.cwd(), OUTPUT);
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(output)}\n`);
console.log(`Wrote ${Object.keys(airports).length} medium/large airports accepted by ITA Matrix to ${OUTPUT}`);

async function unsupportedItaMatrixAirportCodes(codes) {
  const unsupported = [];
  let index = 0;

  async function worker() {
    while (index < codes.length) {
      const code = codes[index++];
      if (!(await supportsItaMatrixAirportCode(code))) unsupported.push(code);
    }
  }

  await Promise.all(Array.from({ length: ITA_MATRIX_VALIDATION_CONCURRENCY }, worker));
  return unsupported.sort();
}

async function supportsItaMatrixAirportCode(code) {
  const response = await fetch(`${ITA_MATRIX_LOCATION_SOURCE}/${code}`);
  if (response.status === 400 || response.status === 404) return false;
  if (!response.ok) throw new Error(`Failed to validate ${code} with ITA Matrix: ${response.status}`);
  const location = await response.json();
  return location?.code === code;
}

function compactString(value) {
  return String(value || "").trim();
}

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
