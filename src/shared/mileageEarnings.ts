import { airportDistanceMiles } from "./airportCoordinates";
import type { UsdCurrencyRates } from "./currencyRates";
import mileageEarningData from "./data/mileage-earning.json";
import programTierLabels from "./data/program-tier-labels.json";
import { flattenSegments } from "./itinerary";
import type { AppLanguage, ItinerarySegment, NormalizedItinerary } from "./types";

type CompactBookingClass = {
  redeemable_miles: CompactProgramEarning[];
};

type CompactProgramEarning = {
  program: string;
  percent: number | null;
  value: string | null;
};

type CompactProgramEarningTuple = [number, number | null, string | null];

type RevenueMultiplier = {
  multiplier: number;
  currency: string;
};

type CompactAirline = {
  name: string;
  booking_classes: Record<string, CompactBookingClass>;
};

type CompactMileageEarningData = {
  f: string;
  n?: string;
  p: string[];
  a: Record<string, [string, Record<string, CompactProgramEarningTuple[]>]>;
};

type ProgramTierLabelData = {
  source_note: string;
  fetched_at: string;
  programs: Record<string, string[]>;
};

export type MileageProgramOption = {
  program: string;
  carrierCodes: string[];
  label: string;
  searchValue: string;
  aliases: string[];
};

export type MileageProgramTierPreference = Record<string, string>;

export type MileageProgramTierOption = {
  program: string;
  label: string;
};

export type EarningsEstimate = {
  segment: ItinerarySegment;
  airlineName: string;
  bookingClass: string;
  url: string;
  program: string;
  estimatedMiles?: number;
  formula: string;
  displayFare?: string;
  basis: "distance-percent" | "revenue-multiplier" | "fixed" | "unknown";
  approximate?: boolean;
  sourceFetchedAt: string;
};

export type WhereToCreditSegmentInsight = {
  segment: ItinerarySegment;
  label: string;
  status: "earning-data" | "airline-only" | "missing-airline" | "missing-booking-class";
  message: string;
  url?: string;
};

// This generated snapshot must come from airline/program public earning charts,
// licensed datasets, or curated MooTravel reference data. Where to Credit URLs
// are outbound lookup destinations, not the source copied into this file.
const DATA = mileageEarningData as unknown as CompactMileageEarningData;
const PROGRAM_TIER_LABELS = programTierLabels as ProgramTierLabelData;
const AIRLINES = normalizeCompactAirlines(DATA);
let uniqueMileageProgramsCache: string[] | undefined;
let tierParentProgramCache: Map<string, string> | undefined;

const PROGRAM_OWNER_CARRIER_CODES: Record<string, string[]> = {
  "ANA Mileage Club": ["NH"],
  "Aegean Miles+Bonus": ["A3"],
  "Aer Lingus AerClub": ["EI"],
  "Aerolíneas Argentinas AerolíneasPlus": ["AR"],
  "Aeromexico Club Premier": ["AM"],
  "Air Canada Aeroplan": ["AC"],
  "Air China PhoenixMiles": ["CA"],
  "Air Europa Suma": ["UX"],
  "Air India Maharaja Club": ["AI"],
  "Alaska/Hawaiian Atmos Rewards": ["AS", "HA"],
  "American Airlines AAdvantage": ["AA"],
  "Asiana Club": ["OZ"],
  "Avianca LifeMiles": ["AV"],
  "Azul TodoAzul": ["AD"],
  "Bangkok Airways FlyerBonus": ["PG"],
  "British Airways Club": ["BA"],
  "Cathay Marco Polo Club / Asia Miles": ["CX"],
  "China Airlines Dynasty Flyer": ["CI"],
  "Copa Airlines ConnectMiles": ["CM"],
  "Delta SkyMiles": ["DL"],
  "Egyptair Plus": ["MS"],
  "Emirates Skywards": ["EK"],
  "Ethiopian ShebaMiles": ["ET"],
  "Etihad Guest": ["EY"],
  "Eva Air Infinity MileageLands": ["BR"],
  "Finnair Plus": ["AY"],
  "Flying Blue": ["AF", "KL"],
  "GOL Aéreos Smiles": ["G3"],
  "Garuda Indonesia GarudaMiles": ["GA"],
  "Hainan Fortune Wings Club": ["HU"],
  "Iberia Plus": ["IB"],
  "Japan Airlines Mileage Bank": ["JL"],
  "JetBlue TrueBlue": ["B6"],
  "Korean Air Skypass": ["KE"],
  "LATAM Pass": ["LA"],
  "MEA Cedar Miles": ["ME"],
  "Malaysia Airlines Enrich": ["MH"],
  "Miles&More": ["LH"],
  "Oman Air Sindbad": ["WY"],
  "Qatar Airways Privilege Club": ["QR"],
  "Royal Air Maroc Safar Flyer": ["AT"],
  "Royal Jordanian Royal Club": ["RJ"],
  "SAS EuroBonus": ["SK"],
  "Saudia Alfursan": ["SV"],
  "Singapore Airlines KrisFlyer": ["SQ"],
  "SriLankan FlySmiLes": ["UL"],
  "TAP Miles&Go": ["TP"],
  "Thai Royal Orchid Plus": ["TG"],
  "Turkish Airlines Miles&Smiles": ["TK"],
  "United MileagePlus": ["UA"],
  "Vietnam Airlines Lotusmiles": ["VN"],
  "Virgin Atlantic Flying Club": ["VS"],
  "Xiamen Airlines Egret Club": ["MF"],
};

const REVENUE_PROGRAM_TICKETING_CARRIER_CODES: Partial<Record<string, string[]>> = {
  "Miles&More": ["LH", "LX", "OS", "SN", "EW", "EN", "VL", "4Y", "AZ"],
};

// Temporary curated rows for preferred-program display until the generated
// snapshot stores all program earning rows. Keep this small and source future
// additions from airline/program public earning charts or licensed data.
const SUPPLEMENTAL_PROGRAM_EARNINGS: Record<string, Record<string, CompactProgramEarning[]>> = {
  AC: Object.fromEntries(
    ["A", "B", "C", "D", "E", "G", "H", "J", "K", "L", "M", "N", "O", "P", "Q", "S", "T", "U", "V", "W", "Y"].map(
      (bookingClass) => [bookingClass, [{ program: "Air Canada Aeroplan", percent: null, value: "1 Miles/CAD" }]],
    ),
  ),
  DL: Object.fromEntries(
    [
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "J",
      "K",
      "L",
      "M",
      "P",
      "Q",
      "S",
      "T",
      "U",
      "V",
      "W",
      "X",
      "Y",
      "Z",
    ].map((bookingClass) => [
      bookingClass,
      [
        { program: "Delta SkyMiles Member", percent: null, value: "5 Miles/USD" },
        { program: "Delta SkyMiles Silver", percent: null, value: "7 Miles/USD" },
        { program: "Delta SkyMiles Gold", percent: null, value: "8 Miles/USD" },
        { program: "Delta SkyMiles Platinum", percent: null, value: "9 Miles/USD" },
        { program: "Delta SkyMiles Diamond", percent: null, value: "11 Miles/USD" },
      ],
    ]),
  ),
  UA: Object.fromEntries(
    ["B", "E", "G", "H", "K", "L", "M", "N", "Q", "S", "T", "U", "V", "W", "Y"].map((bookingClass) => [
      bookingClass,
      [
        { program: "United MileagePlus Member", percent: null, value: "5 Miles/USD" },
        { program: "United MileagePlus Premier Silver", percent: null, value: "7 Miles/USD" },
        { program: "United MileagePlus Premier Gold", percent: null, value: "8 Miles/USD" },
        { program: "United MileagePlus Premier Platinum", percent: null, value: "9 Miles/USD" },
        { program: "United MileagePlus Premier 1K", percent: null, value: "11 Miles/USD" },
      ],
    ]),
  ),
  OZ: {
    S: [
      { program: "Air India Maharaja Club", percent: 100, value: "100%" },
      { program: "Asiana Club", percent: 100, value: "100%" },
      { program: "Avianca LifeMiles", percent: 100, value: "100%" },
      { program: "Copa Airlines ConnectMiles", percent: 100, value: "100%" },
      { program: "Ethiopian ShebaMiles", percent: 100, value: "100%" },
      { program: "Singapore Airlines KrisFlyer", percent: 100, value: "100%" },
      { program: "TAP Miles&Go", percent: 100, value: "100%" },
      { program: "Thai Royal Orchid Plus", percent: 100, value: "100%" },
      { program: "Turkish Airlines Miles&Smiles", percent: 100, value: "100% 500 Miles" },
      { program: "United MileagePlus", percent: 75, value: "75%" },
    ],
  },
  TG: {
    W: [
      { program: "Air India Maharaja Club", percent: 100, value: "100%" },
      { program: "TAP Miles&Go", percent: 100, value: "100%" },
      { program: "Thai Royal Orchid Plus", percent: 25, value: "25% 500 Miles" },
      { program: "United MileagePlus", percent: 25, value: "25%" },
    ],
  },
};

export function buildValidatedWhereToCreditUrl(itinerary: NormalizedItinerary): string {
  const insights = inspectWhereToCreditSegments(itinerary);
  return (
    insights.find((insight) => insight.status === "earning-data")?.url ||
    insights.find((insight) => insight.status === "airline-only")?.url ||
    insights.find((insight) => insight.status === "missing-booking-class")?.url ||
    ""
  );
}

export function inspectWhereToCreditSegments(itinerary: NormalizedItinerary): WhereToCreditSegmentInsight[] {
  return flattenSegments(itinerary)
    .map((segment) => inspectWhereToCreditSegment(segment))
    .filter((insight): insight is WhereToCreditSegmentInsight => Boolean(insight));
}

export function estimateEarnings(
  itinerary: NormalizedItinerary,
  _preferredPrograms: string[] = [],
  programTiers: MileageProgramTierPreference = {},
  currencyRates?: UsdCurrencyRates | null,
): EarningsEstimate[] {
  const segments = flattenSegments(itinerary);
  return segments
    .flatMap((segment, index) =>
      estimateSegmentEarningsRows(segment, itinerary, segments, index, programTiers, currencyRates),
    )
    .filter((estimate): estimate is EarningsEstimate => Boolean(estimate));
}

export function uniqueMileagePrograms(): string[] {
  if (uniqueMileageProgramsCache) return [...uniqueMileageProgramsCache];
  const programs = new Set<string>();
  for (const airline of Object.values(AIRLINES)) {
    for (const bookingClass of Object.values(airline.booking_classes)) {
      for (const row of bookingClass.redeemable_miles) programs.add(row.program);
    }
  }
  uniqueMileageProgramsCache = Array.from(programs).sort((left, right) => left.localeCompare(right));
  return [...uniqueMileageProgramsCache];
}

export function uniqueMileageProgramOptions(language: AppLanguage = "en"): MileageProgramOption[] {
  return uniqueMileagePrograms().map((program) => {
    const carrierCodes = PROGRAM_OWNER_CARRIER_CODES[program] || [];
    const localized = localizedMileageProgramName(program, language);
    const labelText = carrierCodes.length > 0 ? `${localized} (${carrierCodes.join("/")})` : localized;
    const englishLabel = carrierCodes.length > 0 ? `${program} (${carrierCodes.join("/")})` : program;
    return {
      program,
      carrierCodes,
      label: labelText === englishLabel ? labelText : `${labelText} - ${englishLabel}`,
      searchValue: labelText === englishLabel ? labelText : `${labelText} - ${englishLabel}`,
      aliases: uniqueAliases([...mileageProgramAliases(program), labelText, englishLabel, ...carrierCodes]),
    };
  });
}

export function localizedMileageProgramDisplay(program: string, language: AppLanguage = "en"): string {
  const parentProgram = tierParentProgram(program);
  if (!parentProgram || parentProgram === program) return localizedMileageProgramName(program, language);
  const tierLabel = mileageProgramTierOptions(parentProgram, language).find((tier) => tier.program === program)?.label;
  return [localizedMileageProgramName(parentProgram, language), tierLabel].filter(Boolean).join(" ");
}

export function mileageProgramTierOptions(program: string, language: AppLanguage = "en"): MileageProgramTierOption[] {
  const tierPrograms = new Map<string, { label: string; rank: number }>();
  const importedLabels = PROGRAM_TIER_LABELS.programs[program] || [];
  for (const [index, tierLabel] of importedLabels.entries()) {
    const tierProgram = `${program} ${tierLabel}`;
    tierPrograms.set(tierProgram, {
      label: compactTierLabel(program, tierProgram),
      rank: index,
    });
  }

  for (const airlineRows of Object.values(SUPPLEMENTAL_PROGRAM_EARNINGS)) {
    for (const rows of Object.values(airlineRows)) {
      for (const row of rows) {
        if (!isTieredProgram(program, row.program)) continue;
        const label = compactTierLabel(program, row.program);
        const current = tierPrograms.get(row.program);
        tierPrograms.set(row.program, {
          label,
          rank: current?.rank ?? tierRank(label),
        });
      }
    }
  }
  return Array.from(tierPrograms.entries())
    .map(([tierProgram, value]) => ({ program: tierProgram, label: value.label, rank: value.rank }))
    .sort((left, right) => left.rank - right.rank || left.label.localeCompare(right.label))
    .map(({ program, label }) => ({ program, label: localizedTierLabel(label, language) }));
}

function inspectWhereToCreditSegment(segment: ItinerarySegment): WhereToCreditSegmentInsight | null {
  const carrier = normalizeCarrier(segment.fareCarrier || segment.carrier);
  const bookingClass = normalizeBookingClass(segment.bookingClass);
  if (!carrier) return null;

  const carrierName = displayAirlineName(carrier, segment);
  const carrierLabel = `${carrierName} (${carrier})`;
  const label = `${segment.origin}-${segment.destination} ${carrierLabel}${bookingClass ? ` ${bookingClass}` : ""}`;
  const airline = AIRLINES[carrier];
  if (!airline) {
    return {
      segment,
      label,
      status: "missing-airline",
      message: `No earning data for ${carrierLabel}.`,
    };
  }

  if (!bookingClass) {
    return {
      segment,
      label,
      status: "missing-booking-class",
      url: whereToCreditAirlineUrl(carrier),
      message: `Missing booking class for ${airline.name} (${carrier}).`,
    };
  }

  const booking = airline.booking_classes[bookingClass];
  if (!booking) {
    return {
      segment,
      label,
      status: "airline-only",
      url: whereToCreditAirlineUrl(carrier),
      message: `No earning rows for ${airline.name} (${carrier}) ${bookingClass}.`,
    };
  }

  return {
    segment,
    label,
    status: "earning-data",
    url: whereToCreditBookingUrl(carrier, bookingClass),
    message: `${airline.name} booking class ${bookingClass} has earning data.`,
  };
}

function displayAirlineName(carrier: string, segment: ItinerarySegment): string {
  const carrierName = segment.fareCarrier === carrier ? undefined : segment.carrierName;
  return carrierName || carrier;
}

export function estimateSegmentEarnings(
  segment: ItinerarySegment,
  itinerary: NormalizedItinerary,
  segmentsOrCount: ItinerarySegment[] | number = flattenSegments(itinerary),
  segmentIndex = 0,
  programTiers: MileageProgramTierPreference = {},
  currencyRates?: UsdCurrencyRates | null,
): EarningsEstimate | null {
  return bestEarningsEstimate(
    estimateSegmentEarningsRows(segment, itinerary, segmentsOrCount, segmentIndex, programTiers, currencyRates),
  );
}

function estimateSegmentEarningsRows(
  segment: ItinerarySegment,
  itinerary: NormalizedItinerary,
  segmentsOrCount: ItinerarySegment[] | number = flattenSegments(itinerary),
  segmentIndex = 0,
  programTiers: MileageProgramTierPreference = {},
  currencyRates?: UsdCurrencyRates | null,
): EarningsEstimate[] {
  const segments = Array.isArray(segmentsOrCount) ? segmentsOrCount : flattenSegments(itinerary);
  const segmentCount = Array.isArray(segmentsOrCount) ? segmentsOrCount.length : segmentsOrCount;
  const carrier = normalizeCarrier(segment.fareCarrier || segment.carrier);
  const bookingClass = normalizeBookingClass(segment.bookingClass);
  if (!carrier || !bookingClass) return [];

  const airline = AIRLINES[carrier];
  const booking = airline?.booking_classes[bookingClass];
  if (!airline || !booking) return [];

  const distance = segment.distance ?? inferSegmentDistance(itinerary, segment, segments, segmentIndex, segmentCount);
  const fare = inferSegmentFare(itinerary, segment, segments, segmentCount);
  const rows = earningRows(carrier, bookingClass, booking, programTiers, distance);

  return rows.map((row) => {
    const computed = computeMiles(row.percent, row.value, distance, fare, itinerary.currency, currencyRates);
    return {
      segment,
      airlineName: airline.name,
      bookingClass,
      url: whereToCreditBookingUrl(carrier, bookingClass),
      program: row.program,
      estimatedMiles: computed.estimatedMiles,
      formula: computed.formula,
      displayFare: computed.displayFare,
      basis: computed.basis,
      approximate: computed.approximate,
      sourceFetchedAt: DATA.f,
    };
  });
}

function bestEarningsEstimate(estimates: EarningsEstimate[]): EarningsEstimate | null {
  return (
    [...estimates].sort(
      (left, right) =>
        (right.estimatedMiles ?? -1) - (left.estimatedMiles ?? -1) || left.program.localeCompare(right.program),
    )[0] || null
  );
}

function earningRows(
  carrier: string,
  bookingClass: string,
  booking: CompactBookingClass,
  programTiers: MileageProgramTierPreference,
  distance: number | undefined,
): CompactProgramEarning[] {
  const acceptedRows: CompactProgramEarning[] = [];
  const rows = new Map<string, CompactProgramEarning>();
  const supplementalRows = SUPPLEMENTAL_PROGRAM_EARNINGS[carrier]?.[bookingClass] || [];
  const supplementalTierParents = new Set(
    supplementalRows.map((row) => tierParentProgram(row.program)).filter((program) => program.length > 0),
  );
  for (const row of [...booking.redeemable_miles, ...supplementalRows]) {
    if (supplementalTierParents.has(row.program)) continue;
    const displayRow = displayEarningRowForTier(row, programTiers);
    if (!appliesToRevenueTicketingCarrier(carrier, displayRow)) continue;
    if (!matchesDisplayedProgramTier(displayRow.program, programTiers)) continue;
    acceptedRows.push(displayRow);
  }

  const revenuePrograms = new Set(
    acceptedRows
      .filter((row) => parseRevenueMultiplier(row.value))
      .map((row) => revenueProgramOwner(row.program) || row.program),
  );

  for (const displayRow of acceptedRows) {
    const program = revenueProgramOwner(displayRow.program) || displayRow.program;
    if (revenuePrograms.has(program) && !parseRevenueMultiplier(displayRow.value)) continue;
    rows.set(displayRow.program, preferredEarningRow(rows.get(displayRow.program), displayRow, distance));
  }

  return Array.from(rows.values());
}

function preferredEarningRow(
  current: CompactProgramEarning | undefined,
  candidate: CompactProgramEarning,
  distance: number | undefined,
): CompactProgramEarning {
  if (!current) return candidate;
  const currentScore = earningRowScore(current, distance);
  const candidateScore = earningRowScore(candidate, distance);
  if (candidateScore.priority !== currentScore.priority) {
    return candidateScore.priority > currentScore.priority ? candidate : current;
  }
  if (candidateScore.amount !== currentScore.amount) {
    return candidateScore.amount > currentScore.amount ? candidate : current;
  }
  return current;
}

function earningRowScore(
  row: CompactProgramEarning,
  distance: number | undefined,
): { priority: number; amount: number } {
  const revenueMultiplier = parseRevenueMultiplier(row.value);
  if (revenueMultiplier) return { priority: 3, amount: revenueMultiplier.multiplier };
  if (finiteNumber(row.percent) && finiteNumber(distance)) return { priority: 2, amount: row.percent };
  const fixedMiles = parseFixedMiles(row.value);
  if (finiteNumber(fixedMiles)) return { priority: 1, amount: fixedMiles };
  return { priority: 0, amount: 0 };
}

function appliesToRevenueTicketingCarrier(carrier: string, row: CompactProgramEarning): boolean {
  if (!parseRevenueMultiplier(row.value)) return true;
  const ownerProgram = revenueProgramOwner(row.program);
  const ownerCarriers = ownerProgram ? revenueProgramTicketingCarriers(ownerProgram) : [];
  return ownerCarriers.length === 0 || ownerCarriers.includes(carrier);
}

function revenueProgramTicketingCarriers(program: string): string[] {
  return REVENUE_PROGRAM_TICKETING_CARRIER_CODES[program] || PROGRAM_OWNER_CARRIER_CODES[program] || [];
}

function revenueProgramOwner(program: string): string {
  if (PROGRAM_OWNER_CARRIER_CODES[program]) return program;
  return (
    Object.keys(PROGRAM_OWNER_CARRIER_CODES).find((parentProgram) => program.startsWith(`${parentProgram} `)) || ""
  );
}

function displayEarningRowForTier(
  row: CompactProgramEarning,
  programTiers: MileageProgramTierPreference,
): CompactProgramEarning {
  if (row.program !== "Air Canada Aeroplan" || !isAeroplanRevenueValue(row.value)) return row;
  const tierProgram =
    selectedProgramTierProgram("Air Canada Aeroplan", programTiers) || lowestProgramTierProgram("Air Canada Aeroplan");
  return {
    program: tierProgram || row.program,
    percent: null,
    value: `${aeroplanRevenueMultiplier(tierProgram)} Miles/CAD`,
  };
}

function aeroplanRevenueMultiplier(tierProgram: string): number {
  const multipliers = new Map([
    ["Air Canada Aeroplan Member", 1],
    ["Air Canada Aeroplan 25K", 2],
    ["Air Canada Aeroplan 35K", 3],
    ["Air Canada Aeroplan 50K", 4],
    ["Air Canada Aeroplan 75K", 5],
    ["Air Canada Aeroplan Super Elite", 6],
  ]);
  return multipliers.get(tierProgram) || 1;
}

function isAeroplanRevenueValue(value: string | null): boolean {
  return /\bMiles\/CAD\b/i.test(value || "");
}

function normalizeCompactAirlines(data: CompactMileageEarningData): Record<string, CompactAirline> {
  return Object.fromEntries(
    Object.entries(data.a).map(([iata, [name, bookingClasses]]) => [
      iata,
      {
        name,
        booking_classes: Object.fromEntries(
          Object.entries(bookingClasses).map(([bookingClass, rows]) => [
            bookingClass,
            {
              redeemable_miles: rows.map((row) => tupleToEarningRow(data, row)),
            },
          ]),
        ),
      },
    ]),
  );
}

function tupleToEarningRow(data: CompactMileageEarningData, row: CompactProgramEarningTuple): CompactProgramEarning {
  return {
    program: data.p[row[0]] || "",
    percent: row[1],
    value: row[2],
  };
}

function matchesDisplayedProgramTier(program: string, programTiers: MileageProgramTierPreference): boolean {
  const parentProgram = tierParentProgram(program);
  if (!parentProgram) return true;
  const selectedProgram = selectedProgramTierProgram(parentProgram, programTiers);
  return program === (selectedProgram || lowestProgramTierProgram(parentProgram));
}

function tierParentProgram(program: string): string {
  return tierParentPrograms().get(program) || "";
}

function tierParentPrograms(): Map<string, string> {
  if (tierParentProgramCache) return tierParentProgramCache;
  tierParentProgramCache = new Map();
  for (const parentProgram of uniqueMileagePrograms()) {
    for (const tier of mileageProgramTierOptions(parentProgram)) {
      if (tier.program !== parentProgram) tierParentProgramCache.set(tier.program, parentProgram);
    }
  }
  return tierParentProgramCache;
}

function selectedProgramTierProgram(program: string, programTiers: MileageProgramTierPreference): string {
  const selected = programTiers[program];
  if (!selected) return "";
  const option = mileageProgramTierOptions(program).find(
    (tier) => tier.program === selected || tier.label.toLowerCase() === selected.toLowerCase(),
  );
  return option?.program || "";
}

function lowestProgramTierProgram(program: string): string {
  return mileageProgramTierOptions(program)[0]?.program || "";
}

function isTieredProgram(parentProgram: string, program: string): boolean {
  return program !== parentProgram && program.startsWith(`${parentProgram} `);
}

function compactTierLabel(parentProgram: string, tierProgram: string): string {
  const label = tierProgram
    .slice(parentProgram.length)
    .trim()
    .replace(/^Premier\s+/i, "")
    .replace(/^Status\s+/i, "")
    .trim();
  return removeTierBrandPrefix(parentProgram, label);
}

function removeTierBrandPrefix(parentProgram: string, label: string): string {
  const programTokens = tierLabelTokens(parentProgram);
  const labelTokens = label.split(/\s+/).filter(Boolean);
  while (labelTokens.length > 1 && programTokens.has(labelTokens[0]?.toLowerCase() || "")) {
    labelTokens.shift();
  }
  return labelTokens.join(" ") || label;
}

function tierLabelTokens(value: string): Set<string> {
  return new Set(
    value
      .split(/[^A-Za-z0-9+&]+/)
      .map((token) => token.toLowerCase())
      .filter((token) => token.length >= 4 || token === "jmb"),
  );
}

function tierRank(label: string): number {
  const ranks = new Map([
    ["Member", 0],
    ["Silver", 1],
    ["Gold", 2],
    ["Platinum", 3],
    ["1K", 4],
  ]);
  return ranks.get(label) ?? 100;
}

function localizedTierLabel(label: string, language: AppLanguage): string {
  return TIER_LABEL_TRANSLATIONS[language]?.[label] || label;
}

function localizedMileageProgramName(program: string, language: AppLanguage): string {
  return MILEAGE_PROGRAM_NAME_TRANSLATIONS[language]?.[program] || program;
}

function mileageProgramAliases(program: string): string[] {
  return uniqueAliases([
    program,
    ...Object.values(MILEAGE_PROGRAM_NAME_TRANSLATIONS).map((translations) => translations?.[program] || ""),
  ]);
}

function normalizeSearch(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function uniqueAliases(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      const normalized = normalizeSearch(value);
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

const MILEAGE_PROGRAM_NAME_TRANSLATIONS: Partial<Record<AppLanguage, Record<string, string>>> = {
  es: {
    "Aerolíneas Argentinas AerolíneasPlus": "Aerolíneas Plus",
    "Aeromexico Club Premier": "Aeroméxico Rewards",
    "Air Canada Aeroplan": "Aeroplan",
    "Air Europa Suma": "Air Europa SUMA",
    "American Airlines AAdvantage": "AAdvantage",
    "Delta SkyMiles": "SkyMiles",
    "Iberia Plus": "Iberia Club",
    "JetBlue TrueBlue": "TrueBlue",
    "United MileagePlus": "MileagePlus",
  },
  "zh-Hans": {
    "Air China PhoenixMiles": "凤凰知音",
    "Cathay Marco Polo Club / Asia Miles": "国泰会员计划 / 亚洲万里通",
    "China Airlines Dynasty Flyer": "华夏会员",
    "Eva Air Infinity MileageLands": "无限万哩游",
    "Hainan Fortune Wings Club": "金鹏俱乐部",
    "United MileagePlus": "前程万里 (MileagePlus)",
    "Xiamen Airlines Egret Club": "白鹭俱乐部",
  },
  "zh-Hant": {
    "Air China PhoenixMiles": "鳳凰知音",
    "Cathay Marco Polo Club / Asia Miles": "國泰會員計劃 / 亞洲萬里通",
    "China Airlines Dynasty Flyer": "華夏會員",
    "Eva Air Infinity MileageLands": "無限萬哩遊",
    "Hainan Fortune Wings Club": "金鵬俱樂部",
    "United MileagePlus": "前程萬里飛行計劃 (MileagePlus)",
    "Xiamen Airlines Egret Club": "白鷺俱樂部",
  },
  ja: {
    "Air China PhoenixMiles": "フェニックスマイル",
    "ANA Mileage Club": "ANAマイレージクラブ",
    "Hainan Fortune Wings Club": "金鵬倶楽部",
    "Japan Airlines Mileage Bank": "JALマイレージバンク",
    "United MileagePlus": "マイレージプラス",
  },
  ko: {
    "Asiana Club": "아시아나클럽",
    "Korean Air Skypass": "스카이패스",
    "United MileagePlus": "마일리지플러스",
  },
};

const TIER_LABEL_TRANSLATIONS: Partial<Record<AppLanguage, Record<string, string>>> = {
  es: {
    Member: "Miembro",
    Standard: "Estándar",
    Basic: "Básico",
    Blue: "Azul",
    Green: "Verde",
    Red: "Rojo",
    Bronze: "Bronce",
    Silver: "Plata",
    Gold: "Oro",
    Platinum: "Platino",
    Diamond: "Diamante",
  },
  "zh-Hans": {
    Member: "会员",
    Standard: "标准",
    Basic: "基础",
    Blue: "蓝卡",
    Green: "绿卡",
    Red: "红卡",
    Bronze: "铜卡",
    Silver: "银卡",
    Gold: "金卡",
    Platinum: "白金卡",
    Diamond: "钻石卡",
  },
  "zh-Hant": {
    Member: "會員",
    Standard: "標準",
    Basic: "基本",
    Blue: "藍卡",
    Green: "綠卡",
    Red: "紅卡",
    Bronze: "銅卡",
    Silver: "銀卡",
    Gold: "金卡",
    Platinum: "白金卡",
    Diamond: "鑽石卡",
  },
  ja: {
    Member: "メンバー",
    Standard: "スタンダード",
    Basic: "ベーシック",
    Blue: "ブルー",
    Green: "グリーン",
    Red: "レッド",
    Bronze: "ブロンズ",
    Silver: "シルバー",
    Gold: "ゴールド",
    Platinum: "プラチナ",
    Diamond: "ダイヤモンド",
  },
  ko: {
    Member: "회원",
    Standard: "스탠다드",
    Basic: "기본",
    Blue: "블루",
    Green: "그린",
    Red: "레드",
    Bronze: "브론즈",
    Silver: "실버",
    Gold: "골드",
    Platinum: "플래티넘",
    Diamond: "다이아몬드",
  },
};

function computeMiles(
  percent: number | null,
  value: string | null,
  distance: number | undefined,
  fare: number | undefined,
  fareCurrency: string | undefined,
  currencyRates: UsdCurrencyRates | null | undefined,
): Pick<EarningsEstimate, "estimatedMiles" | "formula" | "displayFare" | "basis" | "approximate"> {
  if (finiteNumber(percent) && finiteNumber(distance)) {
    return {
      estimatedMiles: Math.round(distance * (percent / 100)),
      formula: `${formatNumber(Math.round(distance))} miles x ${formatPercent(percent)}`,
      basis: "distance-percent",
    };
  }

  const revenueMultiplier = parseRevenueMultiplier(value);
  if (revenueMultiplier && finiteNumber(fare)) {
    const effectiveFareCurrency = (fareCurrency || revenueMultiplier.currency).toUpperCase();
    const convertedFare = convertCurrency(fare, effectiveFareCurrency, revenueMultiplier.currency, currencyRates);
    if (convertedFare) {
      const displayFare =
        effectiveFareCurrency === revenueMultiplier.currency
          ? formatCurrencyWithCode(fare, effectiveFareCurrency)
          : `${formatCurrencyWithCode(fare, effectiveFareCurrency)} ~ ${formatDisplayCurrencyWithCode(convertedFare.amount, revenueMultiplier.currency)}`;
      return {
        estimatedMiles: Math.round(convertedFare.amount * revenueMultiplier.multiplier),
        formula: `${displayFare} x ${revenueMultiplier.multiplier} miles/${revenueMultiplier.currency}${convertedFare.approximate ? " (FX estimate)" : ""}`,
        displayFare,
        basis: "revenue-multiplier",
        approximate: convertedFare.approximate,
      };
    }
    if (effectiveFareCurrency !== revenueMultiplier.currency) {
      return {
        formula: `${formatCurrencyWithCode(fare, effectiveFareCurrency)} cannot be used with ${revenueMultiplier.multiplier} miles/${revenueMultiplier.currency} without FX conversion`,
        basis: "unknown",
      };
    }
    return {
      estimatedMiles: Math.round(fare * revenueMultiplier.multiplier),
      formula: `${formatCurrencyWithCode(fare, effectiveFareCurrency)} x ${revenueMultiplier.multiplier} miles/${revenueMultiplier.currency}`,
      displayFare: formatCurrencyWithCode(fare, effectiveFareCurrency),
      basis: "revenue-multiplier",
    };
  }

  const fixedMiles = parseFixedMiles(value);
  if (finiteNumber(fixedMiles)) {
    return {
      estimatedMiles: fixedMiles,
      formula: value || `${formatNumber(fixedMiles)} miles`,
      basis: "fixed",
    };
  }

  return {
    formula: value || "Open Where to Credit for details",
    basis: "unknown",
  };
}

function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  currencyRates: UsdCurrencyRates | null | undefined,
): { amount: number; approximate: boolean } | null {
  if (fromCurrency === toCurrency) return { amount, approximate: false };
  if (!currencyRates) return null;
  const fromRate = currencyRates.rates[fromCurrency];
  const toRate = currencyRates.rates[toCurrency];
  if (!finiteNumber(fromRate) || !finiteNumber(toRate) || fromRate <= 0 || toRate <= 0) return null;
  return {
    amount: (amount / fromRate) * toRate,
    approximate: true,
  };
}

function inferSegmentDistance(
  itinerary: NormalizedItinerary,
  segment: ItinerarySegment,
  segments: ItinerarySegment[],
  segmentIndex: number,
  segmentCount: number,
): number | undefined {
  if (segmentCount <= 1 && finiteNumber(itinerary.totalDistance)) return itinerary.totalDistance;

  const coordinateDistance = airportDistanceMiles(segment.origin, segment.destination);
  if (finiteNumber(coordinateDistance)) return coordinateDistance;

  if (!finiteNumber(itinerary.totalDistance)) return undefined;

  const reciprocalRoundTripDistance = inferReciprocalRoundTripDistance(itinerary, segments, segmentIndex);
  if (finiteNumber(reciprocalRoundTripDistance)) return reciprocalRoundTripDistance;

  const durations = segments.map(segmentDurationMinutes);
  const validDurations = durations.filter((duration): duration is number => finiteNumber(duration) && duration > 0);
  if (validDurations.length !== segmentCount) return undefined;

  const totalDuration = validDurations.reduce((sum, duration) => sum + duration, 0);
  const duration = validDurations[segmentIndex];
  if (!finiteNumber(totalDuration) || totalDuration <= 0 || !finiteNumber(duration)) return undefined;
  return itinerary.totalDistance * (duration / totalDuration);
}

function inferReciprocalRoundTripDistance(
  itinerary: NormalizedItinerary,
  segments: ItinerarySegment[],
  segmentIndex: number,
): number | undefined {
  if (itinerary.tripType !== "round-trip" || segments.length !== 2 || segmentIndex > 1) return undefined;

  const [outbound, inbound] = segments;
  if (
    !outbound ||
    !inbound ||
    outbound.origin !== inbound.destination ||
    outbound.destination !== inbound.origin ||
    !finiteNumber(itinerary.totalDistance)
  ) {
    return undefined;
  }

  return itinerary.totalDistance / 2;
}

function inferSegmentFare(
  _itinerary: NormalizedItinerary,
  segment: ItinerarySegment | undefined,
  segments: ItinerarySegment[],
  _segmentCount: number,
): number | undefined {
  if (finiteNumber(segment?.farePrice)) {
    if (!segment.fareComponentKey) return segment.farePrice;
    const componentSegmentCount = segments.filter(
      (candidate) => candidate.fareComponentKey === segment.fareComponentKey,
    ).length;
    return componentSegmentCount > 1 ? segment.farePrice / componentSegmentCount : segment.farePrice;
  }
  return undefined;
}

function whereToCreditAirlineUrl(carrier: string): string {
  return `https://wheretocredit.com/en/${encodeURIComponent(carrier)}`;
}

function whereToCreditBookingUrl(carrier: string, bookingClass: string): string {
  return `${whereToCreditAirlineUrl(carrier)}/${encodeURIComponent(bookingClass)}`;
}

function finiteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseRevenueMultiplier(value: string | null): RevenueMultiplier | undefined {
  const match = value?.match(/([\d.]+)\s*Miles\/(USD|EUR|GBP|CAD|AUD|JPY|[A-Z]{3})/i);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  const currency = match[2]?.toUpperCase() || "";
  return Number.isFinite(parsed) && currency ? { multiplier: parsed, currency } : undefined;
}

function parseFixedMiles(value: string | null): number | undefined {
  const match = value?.match(/^([\d,]+)\s*Miles$/i);
  if (!match) return undefined;
  const parsed = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatCurrencyWithCode(value: number, currency: string): string {
  return `${formatCurrency(value)} ${currency}`;
}

function formatDisplayCurrencyWithCode(value: number, currency: string): string {
  if (currency === "USD") return `$${formatCurrency(value)} USD`;
  return formatCurrencyWithCode(value, currency);
}

function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

function segmentDurationMinutes(segment: ItinerarySegment): number | undefined {
  if (finiteNumber(segment.duration)) return segment.duration;
  if (!segment.departure || !segment.arrival) return undefined;

  const departure = Date.parse(segment.departure);
  const arrival = Date.parse(segment.arrival);
  if (!Number.isFinite(departure) || !Number.isFinite(arrival) || arrival < departure) return undefined;

  return (arrival - departure) / 60_000;
}

function normalizeCarrier(value: unknown): string {
  const carrier = String(value || "")
    .trim()
    .toUpperCase();
  return /^[A-Z0-9]{2,3}$/.test(carrier) ? carrier : "";
}

function normalizeBookingClass(value: unknown): string {
  const bookingClass = String(value || "")
    .trim()
    .toUpperCase();
  return /^[A-Z]$/.test(bookingClass) ? bookingClass : "";
}
