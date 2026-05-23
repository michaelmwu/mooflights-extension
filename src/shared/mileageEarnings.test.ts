import type { UsdCurrencyRates } from "./currencyRates";
import {
  buildValidatedWhereToCreditUrl,
  estimateEarnings,
  inspectWhereToCreditSegments,
  mileageProgramTierOptions,
  uniqueMileageProgramOptions,
  uniqueMileagePrograms,
} from "./mileageEarnings";
import type { NormalizedItinerary } from "./types";

describe("Mileage earning estimates", () => {
  it("lists mileage programs available in the local snapshot", () => {
    expect(uniqueMileagePrograms()).toEqual(expect.arrayContaining(["Air Canada Aeroplan", "British Airways Club"]));
    expect(uniqueMileageProgramOptions()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          program: "Air Canada Aeroplan",
          carrierCodes: ["AC"],
          label: "Air Canada Aeroplan (AC)",
        }),
      ]),
    );
  });

  it("lists compact tier labels for programs with tiered local rows", () => {
    expect(mileageProgramTierOptions("United MileagePlus")).toEqual([
      { program: "United MileagePlus Member", label: "Member" },
      { program: "United MileagePlus Premier Silver", label: "Silver" },
      { program: "United MileagePlus Premier Gold", label: "Gold" },
      { program: "United MileagePlus Premier Platinum", label: "Platinum" },
      { program: "United MileagePlus Premier 1K", label: "1K" },
    ]);
    expect(mileageProgramTierOptions("Air Canada Aeroplan")).toEqual([
      { program: "Air Canada Aeroplan Member", label: "Member" },
      { program: "Air Canada Aeroplan 25K", label: "25K" },
      { program: "Air Canada Aeroplan 35K", label: "35K" },
      { program: "Air Canada Aeroplan 50K", label: "50K" },
      { program: "Air Canada Aeroplan 75K", label: "75K" },
      { program: "Air Canada Aeroplan Super Elite", label: "Super Elite" },
    ]);
    expect(uniqueMileagePrograms()).not.toContain("Air Canada Aeroplan 2026");
  });

  it("removes repetitive program branding from imported tier labels", () => {
    expect(mileageProgramTierOptions("Singapore Airlines KrisFlyer")).toEqual([
      { program: "Singapore Airlines KrisFlyer KrisFlyer", label: "KrisFlyer" },
      { program: "Singapore Airlines KrisFlyer KrisFlyer Silver", label: "Silver" },
      { program: "Singapore Airlines KrisFlyer KrisFlyer Gold", label: "Gold" },
    ]);
    expect(mileageProgramTierOptions("Air Europa Suma")).toEqual([
      { program: "Air Europa Suma SUMA", label: "SUMA" },
      { program: "Air Europa Suma SUMA Silver", label: "Silver" },
      { program: "Air Europa Suma SUMA Gold", label: "Gold" },
      { program: "Air Europa Suma SUMA Platinum", label: "Platinum" },
    ]);
    expect(mileageProgramTierOptions("Alaska/Hawaiian Atmos Rewards")).toEqual([
      { program: "Alaska/Hawaiian Atmos Rewards Member", label: "Member" },
      { program: "Alaska/Hawaiian Atmos Rewards Atmos Silver", label: "Silver" },
      { program: "Alaska/Hawaiian Atmos Rewards Atmos Gold", label: "Gold" },
      { program: "Alaska/Hawaiian Atmos Rewards Atmos Platinum", label: "Platinum" },
      { program: "Alaska/Hawaiian Atmos Rewards Atmos Titanium", label: "Titanium" },
    ]);
    expect(mileageProgramTierOptions("Japan Airlines Mileage Bank")).toEqual([
      { program: "Japan Airlines Mileage Bank Crystal", label: "Crystal" },
      { program: "Japan Airlines Mileage Bank Sapphire", label: "Sapphire" },
      { program: "Japan Airlines Mileage Bank JGC Premier", label: "JGC Premier" },
      { program: "Japan Airlines Mileage Bank Diamond", label: "Diamond" },
    ]);
    expect(mileageProgramTierOptions("Korean Air Skypass")).toEqual([
      { program: "Korean Air Skypass Standard", label: "Standard" },
      { program: "Korean Air Skypass Premium", label: "Premium" },
      { program: "Korean Air Skypass Million Miler", label: "Million Miler" },
    ]);
    expect(mileageProgramTierOptions("British Airways Club")).toEqual([
      { program: "British Airways Club Blue", label: "Blue" },
      { program: "British Airways Club Bronze", label: "Bronze" },
      { program: "British Airways Club Silver", label: "Silver" },
      { program: "British Airways Club Gold", label: "Gold" },
    ]);
  });

  it("includes curated preferred earning rows that are not the compact top row", () => {
    const thai: NormalizedItinerary = itineraryFor("TG", "W");
    expect(estimateEarnings(thai, ["United MileagePlus"]).map((estimate) => estimate.program)).toEqual(
      expect.arrayContaining([
        "Air India Maharaja Club",
        "TAP Miles&Go",
        "Thai Royal Orchid Plus",
        "United MileagePlus",
      ]),
    );
    expect(earningForProgram(thai, "United MileagePlus", ["United MileagePlus"])).toMatchObject({
      estimatedMiles: 250,
      formula: "1,000 miles x 25%",
      program: "United MileagePlus",
    });

    const asiana: NormalizedItinerary = itineraryFor("OZ", "S");
    expect(earningForProgram(asiana, "Asiana Club", ["Asiana Club"])).toMatchObject({
      estimatedMiles: 1000,
      formula: "1,000 miles x 100%",
      program: "Asiana Club",
    });
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

    const estimates = estimateEarnings(itinerary).filter(
      (estimate) => estimate.program === "Alaska/Hawaiian Atmos Rewards",
    );

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
      "524 miles x 40.2%",
      "1,307 miles x 40.2%",
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

    expect(
      estimateEarnings(itinerary)
        .filter((estimate) => estimate.program === "Alaska/Hawaiian Atmos Rewards")
        .map((estimate) => estimate.estimatedMiles),
    ).toEqual([90, 210]);
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

    expect(
      estimateEarnings(itinerary)
        .filter((estimate) => estimate.program === "Alaska/Hawaiian Atmos Rewards")
        .map((estimate) => estimate.formula),
    ).toEqual(["500 miles x 30%", "500 miles x 30%"]);
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
      formula: "100 USD x 2 miles/USD",
      basis: "revenue-multiplier",
    });
  });

  it("shows the lowest United MileagePlus status tier from ITA base fare by default", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      totalPrice: 600,
      passengerCount: 1,
      carriers: ["UA"],
      fareBases: ["SNAA0BC"],
      slices: [
        {
          origin: "TPE",
          destination: "SFO",
          segments: [
            {
              origin: "TPE",
              destination: "SFO",
              carrier: "UA",
              bookingClass: "S",
              farePrice: 450,
              cabin: "economy",
            },
          ],
        },
      ],
    };

    expect(
      estimateEarnings(itinerary, ["United MileagePlus"])
        .filter((estimate) => estimate.program.startsWith("United MileagePlus"))
        .map((estimate) => ({
          program: estimate.program,
          miles: estimate.estimatedMiles,
          formula: estimate.formula,
        })),
    ).toEqual([
      {
        program: "United MileagePlus Member",
        miles: 2250,
        formula: "450 USD x 5 miles/USD",
      },
    ]);
  });

  it("uses the selected United MileagePlus status tier when configured", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      totalPrice: 600,
      passengerCount: 1,
      carriers: ["UA"],
      fareBases: ["SNAA0BC"],
      slices: [
        {
          origin: "TPE",
          destination: "SFO",
          segments: [
            {
              origin: "TPE",
              destination: "SFO",
              carrier: "UA",
              bookingClass: "S",
              farePrice: 450,
              cabin: "economy",
            },
          ],
        },
      ],
    };

    expect(
      estimateEarnings(itinerary, ["United MileagePlus"], {
        "United MileagePlus": "United MileagePlus Premier Gold",
      })
        .filter((estimate) => estimate.program.startsWith("United MileagePlus"))
        .map((estimate) => ({
          program: estimate.program,
          miles: estimate.estimatedMiles,
        })),
    ).toEqual([
      {
        program: "United MileagePlus Premier Gold",
        miles: 3600,
      },
    ]);
  });

  it("does not multiply non-USD fares by USD revenue multipliers", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      currency: "JPY",
      totalPrice: 30000,
      passengerCount: 1,
      carriers: ["UA"],
      fareBases: ["NNAA0BC"],
      slices: [
        {
          origin: "HNL",
          destination: "SFO",
          segments: [
            {
              origin: "HNL",
              destination: "SFO",
              carrier: "UA",
              bookingClass: "N",
              farePrice: 27328,
              cabin: "economy",
            },
          ],
        },
      ],
    };

    expect(
      estimateEarnings(itinerary, ["United MileagePlus"], {
        "United MileagePlus": "United MileagePlus Premier 1K",
      })
        .filter((estimate) => estimate.program.startsWith("United MileagePlus"))
        .map((estimate) => ({
          miles: estimate.estimatedMiles,
          formula: estimate.formula,
          basis: estimate.basis,
        })),
    ).toEqual([
      {
        miles: undefined,
        formula: "27,328 JPY cannot be used with 11 miles/USD without FX conversion",
        basis: "unknown",
      },
    ]);
  });

  it("uses cached FX rates for approximate non-USD revenue mileage math", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      currency: "JPY",
      totalPrice: 30000,
      passengerCount: 1,
      carriers: ["UA"],
      fareBases: ["NNAA0BC"],
      slices: [
        {
          origin: "HNL",
          destination: "SFO",
          segments: [
            {
              origin: "HNL",
              destination: "SFO",
              carrier: "UA",
              bookingClass: "N",
              farePrice: 27328,
              cabin: "economy",
            },
          ],
        },
      ],
    };
    const rates: UsdCurrencyRates = {
      base: "USD",
      rates: { USD: 1, JPY: 152.5 },
      fetchedAt: 0,
      source: "test",
    };

    expect(
      estimateEarnings(
        itinerary,
        ["United MileagePlus"],
        {
          "United MileagePlus": "United MileagePlus Premier 1K",
        },
        rates,
      )
        .filter((estimate) => estimate.program.startsWith("United MileagePlus"))
        .map((estimate) => ({
          miles: estimate.estimatedMiles,
          formula: estimate.formula,
          displayFare: estimate.displayFare,
          approximate: estimate.approximate,
          basis: estimate.basis,
        })),
    ).toEqual([
      {
        miles: 1971,
        formula: "27,328 JPY ~ $179.2 USD x 11 miles/USD (FX estimate)",
        displayFare: "27,328 JPY ~ $179.2 USD",
        approximate: true,
        basis: "revenue-multiplier",
      },
    ]);
  });

  it("displays the selected Air Canada Aeroplan revenue tier", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      currency: "CAD",
      totalPrice: 237,
      passengerCount: 1,
      carriers: ["UA"],
      fareBases: ["NNAA0BC"],
      slices: [
        {
          origin: "HNL",
          destination: "SFO",
          segments: [
            {
              origin: "HNL",
              destination: "SFO",
              carrier: "UA",
              bookingClass: "N",
              farePrice: 237,
              cabin: "economy",
            },
          ],
        },
      ],
    };

    expect(
      estimateEarnings(itinerary, ["Air Canada Aeroplan"], {
        "Air Canada Aeroplan": "Air Canada Aeroplan 25K",
      })
        .filter((estimate) => estimate.program.startsWith("Air Canada Aeroplan"))
        .map((estimate) => ({
          program: estimate.program,
          miles: estimate.estimatedMiles,
          formula: estimate.formula,
        })),
    ).toEqual([
      {
        program: "Air Canada Aeroplan 25K",
        miles: 474,
        formula: "237 CAD x 2 miles/CAD",
      },
    ]);
  });

  it("apportions one fare component across multiple legs before revenue mileage math", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      totalPrice: 600,
      passengerCount: 1,
      carriers: ["UA"],
      fareBases: ["SNAA0BC"],
      slices: [
        {
          origin: "TPE",
          destination: "SFO",
          segments: [
            {
              origin: "TPE",
              destination: "NRT",
              carrier: "UA",
              bookingClass: "S",
              farePrice: 450,
              fareComponentKey: "0/0",
              cabin: "economy",
            },
            {
              origin: "NRT",
              destination: "SFO",
              carrier: "UA",
              bookingClass: "S",
              farePrice: 450,
              fareComponentKey: "0/0",
              cabin: "economy",
            },
          ],
        },
      ],
    };

    expect(
      estimateEarnings(itinerary, ["United MileagePlus"], {
        "United MileagePlus": "United MileagePlus Premier Gold",
      })
        .filter((estimate) => estimate.program.startsWith("United MileagePlus"))
        .map((estimate) => ({
          segment: `${estimate.segment.origin}-${estimate.segment.destination}`,
          miles: estimate.estimatedMiles,
          formula: estimate.formula,
        })),
    ).toEqual([
      {
        segment: "TPE-NRT",
        miles: 1800,
        formula: "225 USD x 8 miles/USD",
      },
      {
        segment: "NRT-SFO",
        miles: 1800,
        formula: "225 USD x 8 miles/USD",
      },
    ]);
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

function itineraryFor(carrier: string, bookingClass: string): NormalizedItinerary {
  return {
    source: "ita-matrix",
    capturedAt: "2026-01-01T00:00:00Z",
    tripType: "one-way",
    totalDistance: 1000,
    carriers: [carrier],
    fareBases: [],
    slices: [
      {
        origin: "BKK",
        destination: "HND",
        segments: [
          {
            origin: "BKK",
            destination: "HND",
            carrier,
            bookingClass,
            cabin: "economy",
          },
        ],
      },
    ],
  };
}

function earningForProgram(
  itinerary: NormalizedItinerary,
  program: string,
  preferredPrograms: string[] = [],
): ReturnType<typeof estimateEarnings>[number] | undefined {
  return estimateEarnings(itinerary, preferredPrograms).find((estimate) => estimate.program === program);
}
