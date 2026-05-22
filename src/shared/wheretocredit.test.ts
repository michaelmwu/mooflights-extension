import type { NormalizedItinerary } from "./types";
import {
  buildValidatedWhereToCreditUrl,
  estimateEarnings,
  inspectWhereToCreditSegments,
  uniqueMileagePrograms,
} from "./wheretocredit";

describe("Where to Credit earnings estimates", () => {
  it("lists mileage programs available in the local snapshot", () => {
    expect(uniqueMileagePrograms()).toEqual(expect.arrayContaining(["Air Canada Aeroplan", "British Airways Club"]));
  });

  it("estimates distance-percent earnings", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      totalDistance: 1000,
      totalPrice: 200,
      carriers: ["AS"],
      fareBases: [],
      slices: [
        {
          origin: "HNL",
          destination: "SJC",
          segments: [
            {
              origin: "HNL",
              destination: "SJC",
              carrier: "AS",
              bookingClass: "X",
              cabin: "economy",
            },
          ],
        },
      ],
    };

    expect(estimateEarnings(itinerary)[0]).toMatchObject({
      airlineName: "Alaska Airlines",
      bookingClass: "X",
      program: "Alaska/Hawaiian Atmos Rewards",
      estimatedMiles: 300,
      formula: "1,000 miles x 30%",
      basis: "distance-percent",
      url: "https://wheretocredit.com/en/AS/X",
    });
  });

  it("treats zero distance as a known numeric value", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      totalDistance: 0,
      totalPrice: 0,
      carriers: ["AS"],
      fareBases: [],
      slices: [
        {
          origin: "HNL",
          destination: "SJC",
          segments: [
            {
              origin: "HNL",
              destination: "SJC",
              carrier: "AS",
              bookingClass: "X",
              cabin: "economy",
            },
          ],
        },
      ],
    };

    expect(estimateEarnings(itinerary)[0]).toMatchObject({
      estimatedMiles: 0,
      formula: "0 miles x 30%",
      basis: "distance-percent",
    });
  });

  it("splits itinerary distance by segment duration when segment distances are missing", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      totalDistance: 1000,
      totalPrice: 200,
      carriers: ["AS"],
      fareBases: [],
      slices: [
        {
          origin: "QAA",
          destination: "QAC",
          segments: [
            {
              origin: "QAA",
              destination: "QAB",
              carrier: "AS",
              bookingClass: "X",
              duration: 30,
              cabin: "economy",
            },
            {
              origin: "QAB",
              destination: "QAC",
              carrier: "AS",
              bookingClass: "X",
              duration: 70,
              cabin: "economy",
            },
          ],
        },
      ],
    };

    const estimates = estimateEarnings(itinerary);

    expect(estimates.map((estimate) => estimate.estimatedMiles)).toEqual([90, 210]);
    expect(estimates.map((estimate) => estimate.formula)).toEqual(["300 miles x 30%", "700 miles x 30%"]);
  });

  it("uses airport coordinate distance before duration splitting for known airports", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "multi-city",
      totalDistance: 9999,
      totalPrice: 200,
      carriers: ["NX"],
      fareBases: [],
      slices: [
        {
          origin: "TPE",
          destination: "ICN",
          segments: [
            {
              origin: "TPE",
              destination: "MFM",
              carrier: "NX",
              bookingClass: "R",
              duration: 1,
              cabin: "economy",
            },
            {
              origin: "MFM",
              destination: "ICN",
              carrier: "NX",
              bookingClass: "R",
              duration: 999,
              cabin: "economy",
            },
          ],
        },
      ],
    };

    expect(estimateEarnings(itinerary).map((estimate) => estimate.formula)).toEqual([
      "524 miles x 40%",
      "1,307 miles x 40%",
    ]);
  });

  it("splits itinerary distance by parsed departure and arrival times when duration is missing", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      totalDistance: 1000,
      totalPrice: 200,
      carriers: ["AS"],
      fareBases: [],
      slices: [
        {
          origin: "QAA",
          destination: "QAC",
          segments: [
            {
              origin: "QAA",
              destination: "QAB",
              carrier: "AS",
              bookingClass: "X",
              departure: "2026-01-01T10:00:00Z",
              arrival: "2026-01-01T10:30:00Z",
              cabin: "economy",
            },
            {
              origin: "QAB",
              destination: "QAC",
              carrier: "AS",
              bookingClass: "X",
              departure: "2026-01-01T11:00:00Z",
              arrival: "2026-01-01T12:10:00Z",
              cabin: "economy",
            },
          ],
        },
      ],
    };

    expect(estimateEarnings(itinerary).map((estimate) => estimate.estimatedMiles)).toEqual([90, 210]);
  });

  it("splits reciprocal round-trip distance evenly even when block times differ", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "round-trip",
      totalDistance: 1000,
      totalPrice: 200,
      carriers: ["AS"],
      fareBases: [],
      slices: [
        {
          origin: "QAA",
          destination: "QAB",
          segments: [
            {
              origin: "QAA",
              destination: "QAB",
              carrier: "AS",
              bookingClass: "X",
              duration: 45,
              cabin: "economy",
            },
          ],
        },
        {
          origin: "QAB",
          destination: "QAA",
          segments: [
            {
              origin: "QAB",
              destination: "QAA",
              carrier: "AS",
              bookingClass: "X",
              duration: 55,
              cabin: "economy",
            },
          ],
        },
      ],
    };

    expect(estimateEarnings(itinerary).map((estimate) => estimate.formula)).toEqual([
      "500 miles x 30%",
      "500 miles x 30%",
    ]);
  });

  it("estimates revenue-based earnings from per-passenger fare", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      totalPrice: 200,
      passengerCount: 2,
      carriers: ["JA"],
      fareBases: [],
      slices: [
        {
          origin: "SCL",
          destination: "LIM",
          segments: [
            {
              origin: "SCL",
              destination: "LIM",
              carrier: "JA",
              bookingClass: "Y",
              cabin: "economy",
            },
          ],
        },
      ],
    };

    expect(estimateEarnings(itinerary)[0]).toMatchObject({
      airlineName: "JetSmart",
      bookingClass: "Y",
      estimatedMiles: 200,
      formula: "100 x 2 miles per currency unit",
      basis: "revenue-multiplier",
    });
  });

  it("splits revenue-based earnings by passenger and segment", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "round-trip",
      totalPrice: 400,
      passengerCount: 2,
      carriers: ["JA"],
      fareBases: [],
      slices: [
        {
          origin: "SCL",
          destination: "LIM",
          segments: [
            {
              origin: "SCL",
              destination: "LIM",
              carrier: "JA",
              bookingClass: "Y",
              cabin: "economy",
            },
          ],
        },
        {
          origin: "LIM",
          destination: "SCL",
          segments: [
            {
              origin: "LIM",
              destination: "SCL",
              carrier: "JA",
              bookingClass: "Y",
              cabin: "economy",
            },
          ],
        },
      ],
    };

    expect(estimateEarnings(itinerary).map((estimate) => estimate.estimatedMiles)).toEqual([200, 200]);
  });

  it("does not synthesize Where to Credit deep links for missing carriers", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      carriers: ["HB"],
      fareBases: [],
      slices: [
        {
          origin: "HKG",
          destination: "BKK",
          segments: [
            {
              origin: "HKG",
              destination: "BKK",
              carrier: "HB",
              carrierName: "Greater Bay Airlines",
              bookingClass: "Y",
              cabin: "economy",
            },
          ],
        },
      ],
    };

    const insight = inspectWhereToCreditSegments(itinerary)[0];

    expect(buildValidatedWhereToCreditUrl(itinerary)).toBe("");
    expect(insight).toMatchObject({
      label: "HKG-BKK Greater Bay Airlines (HB) Y",
      status: "missing-airline",
      message: "No earning data for Greater Bay Airlines (HB).",
    });
    expect(insight).not.toHaveProperty("url");
  });

  it("uses ITA carrier names in missing-data notices", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      carriers: ["HX"],
      fareBases: [],
      slices: [
        {
          origin: "HKG",
          destination: "BKK",
          segments: [
            {
              origin: "HKG",
              destination: "BKK",
              carrier: "HX",
              carrierName: "Hong Kong Airlines",
              bookingClass: "Y",
              cabin: "economy",
            },
          ],
        },
      ],
    };

    expect(inspectWhereToCreditSegments(itinerary)[0]).toMatchObject({
      label: "HKG-BKK Hong Kong Airlines (HX) Y",
      message: "No earning data for Hong Kong Airlines (HX).",
    });
  });

  it("keeps airline-level Where to Credit fallback when booking class is missing", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      carriers: ["AS"],
      fareBases: [],
      slices: [
        {
          origin: "HNL",
          destination: "SJC",
          segments: [
            {
              origin: "HNL",
              destination: "SJC",
              carrier: "AS",
              carrierName: "Alaska",
              cabin: "economy",
            },
          ],
        },
      ],
    };

    expect(buildValidatedWhereToCreditUrl(itinerary)).toBe("https://wheretocredit.com/en/AS");
  });
});
