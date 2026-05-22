import type { Cabin, ItinerarySegment, NormalizedItinerary, TripType } from "./types";

const IATA_RE = /^[A-Z0-9]{2,3}$/;

export function parseItaBookingDetails(input: unknown): NormalizedItinerary {
  const data = input as any;
  const slices = Array.isArray(data?.itinerary?.slices) ? data.itinerary.slices : [];
  const fareMap = buildFareMap(data);

  const normalizedSlices: NormalizedItinerary["slices"] = slices.map((slice: any) => {
    const segments = normalizeSegments(slice, fareMap);
    return {
      origin: airportCode(slice?.origin?.code),
      destination: airportCode(slice?.destination?.code),
      departureDate: isoDate(slice?.departure),
      arrivalDate: isoDate(slice?.arrival),
      segments,
    };
  });

  const allSegments = normalizedSlices.flatMap((slice) => slice.segments);
  const carriers = unique(allSegments.map((segment: ItinerarySegment) => segment.carrier).filter(Boolean));
  const fareBases = unique(
    allSegments.map((segment: ItinerarySegment) => segment.fareBasis).filter(Boolean) as string[],
  );

  return {
    source: "ita-matrix",
    capturedAt: new Date().toISOString(),
    tripType: inferTripType(normalizedSlices),
    currency: parseCurrency(data?.displayTotal),
    totalPrice: parseDisplayTotal(data?.displayTotal),
    totalDistance: numberOrUndefined(data?.itinerary?.distance?.value),
    passengerCount: numberOrUndefined(data?.passengerCount),
    carriers,
    fareBases,
    slices: normalizedSlices,
  };
}

export function parseItineraryJson(text: string): NormalizedItinerary {
  return parseItaBookingDetails(JSON.parse(text));
}

export function flattenSegments(itinerary: NormalizedItinerary): ItinerarySegment[] {
  return itinerary.slices.flatMap((slice) => slice.segments);
}

export type WhereToCreditSegmentLink = {
  label: string;
  url: string;
};

export function buildWhereToCreditUrl(itinerary: NormalizedItinerary): string {
  return buildWhereToCreditSegmentUrls(itinerary)[0]?.url || buildWhereToCreditCalculatorUrl(itinerary);
}

export function buildWhereToCreditSegmentUrls(itinerary: NormalizedItinerary): WhereToCreditSegmentLink[] {
  return flattenSegments(itinerary)
    .map((segment) => {
      const carrier = normalizeCarrier(segment.fareCarrier || segment.carrier);
      const bookingClass = normalizeBookingClass(segment.bookingClass);
      if (!carrier || !bookingClass) return null;
      return {
        label: `${segment.origin}-${segment.destination} ${carrier} ${bookingClass}`,
        url: `https://wheretocredit.com/en/${encodeURIComponent(carrier)}/${encodeURIComponent(bookingClass)}`,
      };
    })
    .filter((link): link is WhereToCreditSegmentLink => Boolean(link));
}

export function buildWhereToCreditCalculatorUrl(itinerary: NormalizedItinerary): string {
  const encodedSegments = flattenSegments(itinerary)
    .map((segment) =>
      [segment.origin, segment.destination, segment.fareCarrier || segment.carrier, segment.bookingClass]
        .map((part) =>
          String(part || "")
            .trim()
            .toUpperCase(),
        )
        .join("-"),
    )
    .filter((part) => /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{2,3}-[A-Z]$/.test(part));

  return `https://www.wheretocredit.com/calculator#${encodedSegments.join("/")}`;
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

function buildFareMap(data: any): Map<string, { carrier?: string; code?: string }> {
  const fareMap = new Map<string, { carrier?: string; code?: string }>();
  const tickets = Array.isArray(data?.tickets) ? data.tickets : [];

  for (const ticket of tickets) {
    const pricings = Array.isArray(ticket?.pricings) ? ticket.pricings : [];
    for (const pricing of pricings) {
      const fares = Array.isArray(pricing?.fares) ? pricing.fares : [];
      for (const fare of fares) {
        const bookingInfos = Array.isArray(fare?.bookingInfos) ? fare.bookingInfos : [];
        for (const bookingInfo of bookingInfos) {
          const origin = airportCode(bookingInfo?.segment?.origin);
          const destination = airportCode(bookingInfo?.segment?.destination);
          const bookingCode = stringOrUndefined(bookingInfo?.bookingCode)?.toUpperCase();
          if (origin && destination && bookingCode) {
            fareMap.set(`${origin}${destination}${bookingCode}`, {
              carrier: stringOrUndefined(fare?.carrier)?.toUpperCase(),
              code: stringOrUndefined(fare?.code)?.toUpperCase(),
            });
          }
        }
      }
    }
  }

  return fareMap;
}

function normalizeSegments(slice: any, fareMap: Map<string, { carrier?: string; code?: string }>): ItinerarySegment[] {
  const segments = Array.isArray(slice?.segments) ? slice.segments : [];

  return segments.flatMap((segment: any) => {
    const legs = Array.isArray(segment?.legs) && segment.legs.length > 0 ? segment.legs : [segment];
    const bookingInfo = Array.isArray(segment?.bookingInfos) ? segment.bookingInfos[0] : undefined;
    const bookingClass = stringOrUndefined(bookingInfo?.bookingCode)?.toUpperCase();
    const segmentOrigin = airportCode(segment?.origin?.code);
    const segmentDestination = airportCode(segment?.destination?.code);
    const fare = fareMap.get(`${segmentOrigin}${segmentDestination}${bookingClass || ""}`);

    return legs.map((leg: any) => ({
      origin: airportCode(leg?.origin?.code || segment?.origin?.code),
      destination: airportCode(leg?.destination?.code || segment?.destination?.code),
      distance: numberOrUndefined(leg?.distance?.value ?? segment?.distance?.value),
      carrier: stringOrUndefined(segment?.carrier?.code)?.toUpperCase() || "",
      flightNumber: stringOrUndefined(segment?.flight?.number),
      bookingClass,
      fareBasis: fare?.code,
      fareCarrier: fare?.carrier,
      cabin: normalizeCabin(bookingInfo?.cabin),
      departure: stringOrUndefined(leg?.departure),
      arrival: stringOrUndefined(leg?.arrival),
    }));
  });
}

function inferTripType(slices: Array<{ origin: string; destination: string }>): TripType {
  if (slices.length === 1) return "one-way";
  if (
    slices.length === 2 &&
    slices[0]?.origin === slices[1]?.destination &&
    slices[0]?.destination === slices[1]?.origin
  ) {
    return "round-trip";
  }
  return "multi-city";
}

function normalizeCabin(value: unknown): Cabin {
  const cabin = String(value || "").toLowerCase();
  if (cabin.includes("first")) return "first";
  if (cabin.includes("business")) return "business";
  if (cabin.includes("premium")) return "premium-economy";
  if (cabin.includes("coach") || cabin.includes("economy")) return "economy";
  return "unknown";
}

function parseCurrency(value: unknown): string | undefined {
  const text = stringOrUndefined(value);
  const match = text?.match(/^([A-Z]{3})/);
  return match?.[1];
}

function parseDisplayTotal(value: unknown): number | undefined {
  const text = stringOrUndefined(value);
  if (!text) return undefined;
  const match = text.match(/[A-Z]{3}\s*([\d,.]+)/);
  if (!match) return undefined;
  const parsed = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isoDate(value: unknown): string | undefined {
  const text = stringOrUndefined(value);
  return text?.slice(0, 10);
}

function airportCode(value: unknown): string {
  const code = String(value || "")
    .trim()
    .toUpperCase();
  return IATA_RE.test(code) ? code : "";
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function unique<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values));
}
