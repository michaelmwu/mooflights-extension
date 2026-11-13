import type { FareEstimate, FareQuery } from "./communityHistory";
import { buildItaMatrixSearchUrl } from "./googleFlightsBooking";
import { type EarningsEstimate, estimateEarnings, uniqueMileageProgramOptions } from "./mileageEarnings";
import type { ExtensionSettings, ItinerarySegment, NormalizedItinerary } from "./types";

export type FarePreviewContext = { fare: FareQuery; flightNumber: string };
export type FarePreviewSelection = { bookingClass?: string; program?: string };
export type FareClassPreview = { bookingClass: string; earning?: EarningsEstimate };
export type FarePreviewModel = {
  classes: FareClassPreview[];
  selected: FareClassPreview;
  program: string;
  programs: string[];
  mostLikelyClass?: string;
  range: { min: number; max: number } | null;
  matrixUrl: string;
};

const CABINS = { COACH: "economy", "PREMIUM-COACH": "premium-economy", BUSINESS: "business", FIRST: "first" } as const;

/** Calculation inputs stay inside this module: previews are never captured or uploaded. */
function classEarnings(
  context: FarePreviewContext,
  bookingClass: string,
  settings: ExtensionSettings,
): EarningsEstimate[] {
  const { fare, flightNumber } = context;
  const segment: ItinerarySegment = {
    origin: fare.origin,
    destination: fare.destination,
    carrier: fare.carrier,
    departure: fare.departureDate,
    flightNumber,
    cabin: CABINS[fare.cabin],
    bookingClass,
  };
  const calculation: NormalizedItinerary = {
    source: "ita-matrix",
    capturedAt: "",
    tripType: "one-way",
    passengerCount: 1,
    currency: fare.currency,
    carriers: [fare.carrier],
    fareBases: [],
    slices: [
      { origin: fare.origin, destination: fare.destination, departureDate: fare.departureDate, segments: [segment] },
    ],
  };
  // Google shows a tax-inclusive total, not the eligible fare used by revenue programs.
  // Deliberately omit totalPrice and farePrice, rather than turning that total into miles.
  return estimateEarnings(calculation, settings.preferredFrequentFlyerPrograms, settings.frequentFlyerProgramTiers);
}

function matchesProgram(program: string, selected: string): boolean {
  return program === selected || program.startsWith(`${selected} `);
}

export function buildFarePreview(
  context: FarePreviewContext,
  estimate: FareEstimate,
  settings: ExtensionSettings,
  selection: FarePreviewSelection = {},
): FarePreviewModel {
  const candidates = [...estimate.candidates].sort(
    (a, b) => b.share - a.share || a.bookingClass.localeCompare(b.bookingClass),
  );
  const classes = [...new Set(candidates.map((candidate) => candidate.bookingClass))];
  const bookingClass = /^[A-Z]$/.test(selection.bookingClass || "") ? selection.bookingClass || "" : classes[0] || "";
  const earnings = new Map(
    [...new Set([...classes, bookingClass])].map((code) => [code, classEarnings(context, code, settings)]),
  );
  const available = [...new Set([...earnings.values()].flatMap((rows) => rows.map((row) => row.program)))];
  const preferred = settings.preferredFrequentFlyerPrograms.map(
    (program) => available.find((p) => matchesProgram(p, program)) || program,
  );
  const ownProgram = uniqueMileageProgramOptions().find(
    (option) =>
      option.carrierCodes.includes(context.fare.carrier) && available.some((p) => matchesProgram(p, option.program)),
  )?.program;
  const program =
    selection.program ||
    preferred[0] ||
    available.find((p) => ownProgram && matchesProgram(p, ownProgram)) ||
    [...available].sort()[0] ||
    "";
  const programs = [...new Set([...preferred, program, ...available.sort()])].filter(Boolean);
  const preview = (code: string): FareClassPreview => ({
    bookingClass: code,
    earning: earnings.get(code)?.find((row) => matchesProgram(row.program, program)),
  });
  const alternatives = classes.map(preview);
  const amounts = alternatives.map((row) => row.earning?.estimatedMiles);
  const numeric = amounts.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const { fare, flightNumber } = context;
  const slices = [
    {
      origin: fare.origin,
      destination: fare.destination,
      departureDate: fare.departureDate,
      segments: [
        {
          origin: fare.origin,
          destination: fare.destination,
          departureDate: fare.departureDate,
          carrier: fare.carrier,
          flightNumber,
        },
      ],
    },
  ];
  return {
    classes: alternatives,
    selected: preview(bookingClass),
    program,
    programs,
    mostLikelyClass:
      candidates.length === 1 || (candidates[0]?.share ?? 0) > (candidates[1]?.share ?? 0)
        ? candidates[0]?.bookingClass
        : undefined,
    range:
      numeric.length > 0 && numeric.length === amounts.length
        ? { min: Math.min(...numeric), max: Math.max(...numeric) }
        : null,
    matrixUrl: buildItaMatrixSearchUrl("one-way", slices, fare.cabin, fare.currency),
  };
}
