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

const AIRLINE_NAME_FALLBACKS: Record<string, string> = {
  HB: "Greater Bay Airlines",
  HX: "Hong Kong Airlines",
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

export function buildValidatedWhereToCreditUrl(itinerary: NormalizedItinerary): string {
  const insights = inspectWhereToCreditSegments(itinerary);
  return (
    insights.find((insight) => insight.status === "earning-data")?.url ||
    insights.find((insight) => insight.status === "airline-only")?.url ||
    ""
  );
}

export function inspectWhereToCreditSegments(itinerary: NormalizedItinerary): WhereToCreditSegmentInsight[] {
  return flattenSegments(itinerary)
    .map((segment) => inspectWhereToCreditSegment(segment))
    .filter((insight): insight is WhereToCreditSegmentInsight => Boolean(insight));
}

export function estimateEarnings(itinerary: NormalizedItinerary): EarningsEstimate[] {
  const segments = flattenSegments(itinerary);
  return segments
    .map((segment, index) => estimateSegmentEarnings(segment, itinerary, segments.length, index))
    .filter((estimate): estimate is EarningsEstimate => Boolean(estimate));
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
  return carrierName || AIRLINE_NAME_FALLBACKS[carrier] || carrier;
}

export function estimateSegmentEarnings(
  segment: ItinerarySegment,
  itinerary: NormalizedItinerary,
  segmentCount = flattenSegments(itinerary).length,
  segmentIndex = 0,
): EarningsEstimate | null {
  const carrier = normalizeCarrier(segment.fareCarrier || segment.carrier);
  const bookingClass = normalizeBookingClass(segment.bookingClass);
  if (!carrier || !bookingClass) return null;

  const airline = DATA.airlines[carrier];
  const booking = airline?.booking_classes[bookingClass];
  if (!airline || !booking) return null;

  const distance = segment.distance ?? inferSegmentDistance(itinerary, segmentCount);
  const fare = inferSegmentFare(itinerary, segmentCount, segmentIndex);
  const program = booking.top_program || "Best available program";
  const computed = computeMiles(booking.top_redeemable_percent, booking.top_redeemable_value, distance, fare);

  return {
    segment,
    airlineName: airline.name,
    bookingClass,
    url: whereToCreditBookingUrl(carrier, bookingClass),
    program,
    estimatedMiles: computed.estimatedMiles,
    formula: computed.formula,
    basis: computed.basis,
    sourceFetchedAt: DATA.fetched_at,
  };
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
      formula: `${Math.round(distance).toLocaleString()} miles x ${formatPercent(percent)}`,
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
      formula: value || `${fixedMiles.toLocaleString()} miles`,
      basis: "fixed",
    };
  }

  return {
    formula: value || "Open Where to Credit for details",
    basis: "unknown",
  };
}

function inferSegmentDistance(itinerary: NormalizedItinerary, segmentCount: number): number | undefined {
  if (!finiteNumber(itinerary.totalDistance)) return undefined;
  return segmentCount <= 1 ? itinerary.totalDistance : undefined;
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
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
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
