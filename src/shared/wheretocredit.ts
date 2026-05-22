import { airportDistanceMiles } from "./airportCoordinates";
import mileageEarningData from "./data/mileage-earning-compact.json";
import { flattenSegments } from "./itinerary";
import type { ItinerarySegment, NormalizedItinerary } from "./types";

type CompactBookingClass = {
  cabin: string | null;
  top_program: string | null;
  top_redeemable_percent: number | null;
  top_redeemable_value: string | null;
  top_qualifying_program: string | null;
  top_qualifying_percent: number | null;
  top_qualifying_value: string | null;
};

type SupplementalProgramEarning = {
  program: string;
  percent: number | null;
  value: string | null;
};

type CompactAirline = {
  iata: string;
  name: string;
  alliance: string | null;
  booking_classes: Record<string, CompactBookingClass>;
};

type CompactMileageEarningData = {
  provider: string;
  source_note: string;
  fetched_at: string;
  airlines: Record<string, CompactAirline>;
};

export type MileageProgramOption = {
  program: string;
  carrierCodes: string[];
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
  basis: "distance-percent" | "revenue-multiplier" | "fixed" | "unknown";
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
// licensed datasets, or curated Mu Travel reference data. Where to Credit URLs
// are outbound lookup destinations, not the source copied into this file.
const DATA = mileageEarningData as CompactMileageEarningData;

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
  "Bangkok Airways FlyerBonus": ["PG"],
  "British Airways Club": ["BA"],
  "Cathay Marco Polo Club / Asia Miles": ["CX"],
  "Copa Airlines ConnectMiles": ["CM"],
  "Delta SkyMiles": ["DL"],
  "Egyptair Plus": ["MS"],
  "Emirates Skywards": ["EK"],
  "Ethiopian ShebaMiles": ["ET"],
  "Etihad Guest": ["EY"],
  "Eva Air Infinity MileageLands": ["BR"],
  "Finnair Plus": ["AY"],
  "Flying Blue": ["AF", "KL"],
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

// Temporary curated rows for preferred-program display until the generated
// snapshot stores all program earning rows. Keep this small and source future
// additions from airline/program public earning charts or licensed data.
const SUPPLEMENTAL_PROGRAM_EARNINGS: Record<string, Record<string, SupplementalProgramEarning[]>> = {
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

export function estimateEarnings(itinerary: NormalizedItinerary, preferredPrograms: string[] = []): EarningsEstimate[] {
  const segments = flattenSegments(itinerary);
  return segments
    .flatMap((segment, index) => estimateSegmentEarningsRows(segment, itinerary, segments, index, preferredPrograms))
    .filter((estimate): estimate is EarningsEstimate => Boolean(estimate));
}

export function uniqueMileagePrograms(): string[] {
  const programs = new Set<string>();
  for (const airline of Object.values(DATA.airlines)) {
    for (const bookingClass of Object.values(airline.booking_classes)) {
      if (bookingClass.top_program) programs.add(bookingClass.top_program);
      if (bookingClass.top_qualifying_program) programs.add(bookingClass.top_qualifying_program);
    }
  }
  return Array.from(programs).sort((left, right) => left.localeCompare(right));
}

export function uniqueMileageProgramOptions(): MileageProgramOption[] {
  return uniqueMileagePrograms().map((program) => {
    const carrierCodes = PROGRAM_OWNER_CARRIER_CODES[program] || [];
    return {
      program,
      carrierCodes,
      label: carrierCodes.length > 0 ? `${program} (${carrierCodes.join("/")})` : program,
    };
  });
}

function inspectWhereToCreditSegment(segment: ItinerarySegment): WhereToCreditSegmentInsight | null {
  const carrier = normalizeCarrier(segment.fareCarrier || segment.carrier);
  const bookingClass = normalizeBookingClass(segment.bookingClass);
  if (!carrier) return null;

  const carrierName = displayAirlineName(carrier, segment);
  const carrierLabel = `${carrierName} (${carrier})`;
  const label = `${segment.origin}-${segment.destination} ${carrierLabel}${bookingClass ? ` ${bookingClass}` : ""}`;
  const airline = DATA.airlines[carrier];
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
): EarningsEstimate | null {
  return estimateSegmentEarningsRows(segment, itinerary, segmentsOrCount, segmentIndex)[0] || null;
}

function estimateSegmentEarningsRows(
  segment: ItinerarySegment,
  itinerary: NormalizedItinerary,
  segmentsOrCount: ItinerarySegment[] | number = flattenSegments(itinerary),
  segmentIndex = 0,
  preferredPrograms: string[] = [],
): EarningsEstimate[] {
  const segments = Array.isArray(segmentsOrCount) ? segmentsOrCount : flattenSegments(itinerary);
  const segmentCount = Array.isArray(segmentsOrCount) ? segmentsOrCount.length : segmentsOrCount;
  const carrier = normalizeCarrier(segment.fareCarrier || segment.carrier);
  const bookingClass = normalizeBookingClass(segment.bookingClass);
  if (!carrier || !bookingClass) return [];

  const airline = DATA.airlines[carrier];
  const booking = airline?.booking_classes[bookingClass];
  if (!airline || !booking) return [];

  const distance = segment.distance ?? inferSegmentDistance(itinerary, segment, segments, segmentIndex, segmentCount);
  const fare = inferSegmentFare(itinerary, segmentCount, segmentIndex);
  const rows = earningRows(carrier, bookingClass, booking, preferredPrograms);

  return rows.map((row) => {
    const computed = computeMiles(row.percent, row.value, distance, fare);
    return {
      segment,
      airlineName: airline.name,
      bookingClass,
      url: whereToCreditBookingUrl(carrier, bookingClass),
      program: row.program,
      estimatedMiles: computed.estimatedMiles,
      formula: computed.formula,
      basis: computed.basis,
      sourceFetchedAt: DATA.fetched_at,
    };
  });
}

function earningRows(
  carrier: string,
  bookingClass: string,
  booking: CompactBookingClass,
  preferredPrograms: string[],
): SupplementalProgramEarning[] {
  const rows = new Map<string, SupplementalProgramEarning>();
  if (booking.top_program) {
    rows.set(booking.top_program, {
      program: booking.top_program,
      percent: booking.top_redeemable_percent,
      value: booking.top_redeemable_value,
    });
  }

  const preferred = new Set(preferredPrograms);
  for (const row of SUPPLEMENTAL_PROGRAM_EARNINGS[carrier]?.[bookingClass] || []) {
    if (preferred.size > 0 && !preferred.has(row.program)) continue;
    rows.set(row.program, row);
  }

  return Array.from(rows.values());
}

function computeMiles(
  percent: number | null,
  value: string | null,
  distance: number | undefined,
  fare: number | undefined,
): Pick<EarningsEstimate, "estimatedMiles" | "formula" | "basis"> {
  if (finiteNumber(percent) && finiteNumber(distance)) {
    return {
      estimatedMiles: Math.round(distance * (percent / 100)),
      formula: `${formatNumber(Math.round(distance))} miles x ${formatPercent(percent)}`,
      basis: "distance-percent",
    };
  }

  const revenueMultiplier = parseRevenueMultiplier(value);
  if (finiteNumber(revenueMultiplier) && finiteNumber(fare)) {
    return {
      estimatedMiles: Math.round(fare * revenueMultiplier),
      formula: `${formatCurrency(fare)} x ${revenueMultiplier} miles per currency unit`,
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
  itinerary: NormalizedItinerary,
  segmentCount: number,
  _segmentIndex: number,
): number | undefined {
  if (!finiteNumber(itinerary.totalPrice)) return undefined;
  const passengerCount =
    finiteNumber(itinerary.passengerCount) && itinerary.passengerCount > 0 ? itinerary.passengerCount : 1;
  const perPassengerTotal = itinerary.totalPrice / passengerCount;
  if (segmentCount <= 1) return perPassengerTotal;
  return perPassengerTotal / segmentCount;
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

function parseRevenueMultiplier(value: string | null): number | undefined {
  const match = value?.match(/([\d.]+)\s*Miles\/(?:USD|EUR|GBP|CAD|AUD|JPY|[A-Z]{3})/i);
  if (!match) return undefined;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : undefined;
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
