import type { NormalizedItinerary } from "./types";
import { buildValidatedWhereToCreditUrl, estimateEarnings, inspectWhereToCreditSegments } from "./wheretocredit";

describe("Where to Credit earnings estimates", () => {
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
});
