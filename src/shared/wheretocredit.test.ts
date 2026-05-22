import type { NormalizedItinerary } from "./types";
import { estimateEarnings } from "./wheretocredit";

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
});
