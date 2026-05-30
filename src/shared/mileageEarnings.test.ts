import type { UsdCurrencyRates } from "./currencyRates";
import {
  buildValidatedWhereToCreditUrl,
  estimateEarnings,
  estimateSegmentEarnings,
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
    expect(mileageProgramTierOptions("Delta SkyMiles")).toEqual([
      { program: "Delta SkyMiles Member", label: "Member" },
      { program: "Delta SkyMiles Silver", label: "Silver" },
      { program: "Delta SkyMiles Gold", label: "Gold" },
      { program: "Delta SkyMiles Platinum", label: "Platinum" },
      { program: "Delta SkyMiles Diamond", label: "Diamond" },
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

  it("uses the highest-mile row for single segment annotations", () => {
    const itinerary: NormalizedItinerary = itineraryFor("4Y", "B");
    itinerary.currency = "EUR";
    const segment = itinerary.slices[0]?.segments[0];
    if (!segment) throw new Error("Expected itinerary fixture segment");
    segment.farePrice = 500;

    expect(estimateSegmentEarnings(segment, itinerary)).toMatchObject({
      airlineName: "Discover Airlines",
      bookingClass: "B",
      program: "Miles&More",
      estimatedMiles: 2000,
      formula: "500 EUR x 4 miles/EUR",
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

  it("does not estimate non-owner revenue-based earnings from per-passenger fare", () => {
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

    expect(
      estimateEarnings(itinerary).filter((estimate) => estimate.program === "American Airlines AAdvantage"),
    ).toEqual([]);
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

  it("does not apply United revenue multipliers to partner-issued tickets", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      currency: "HKD",
      totalPrice: 910,
      passengerCount: 1,
      carriers: ["ZH"],
      fareBases: ["KTEST"],
      slices: [
        {
          origin: "CAN",
          destination: "PVG",
          segments: [
            {
              origin: "CAN",
              destination: "PVG",
              distance: 1000,
              carrier: "ZH",
              bookingClass: "K",
              farePrice: 910,
              cabin: "economy",
            },
          ],
        },
      ],
    };
    const rates: UsdCurrencyRates = {
      base: "USD",
      rates: { USD: 1, HKD: 7.835 },
      fetchedAt: 0,
      source: "test",
    };

    expect(
      estimateEarnings(itinerary, ["United MileagePlus"], {}, rates)
        .filter((estimate) => estimate.program.startsWith("United MileagePlus"))
        .map((estimate) => ({
          program: estimate.program,
          miles: estimate.estimatedMiles,
          formula: estimate.formula,
          basis: estimate.basis,
        }))
        .sort((left, right) => left.program.localeCompare(right.program)),
    ).toEqual([
      {
        program: "United MileagePlus",
        miles: 250,
        formula: "1,000 miles x 25%",
        basis: "distance-percent",
      },
    ]);
  });

  it("does not apply United revenue multipliers when the fare carrier is not United", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      currency: "USD",
      totalPrice: 450,
      passengerCount: 1,
      carriers: ["UA"],
      fareBases: ["STEST"],
      slices: [
        {
          origin: "TPE",
          destination: "SFO",
          segments: [
            {
              origin: "TPE",
              destination: "SFO",
              carrier: "UA",
              fareCarrier: "JX",
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
        .map((estimate) => estimate.formula),
    ).toEqual([]);
  });

  it("uses the selected Delta SkyMiles revenue tier on Delta fare carriers", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      currency: "USD",
      totalPrice: 300,
      passengerCount: 1,
      carriers: ["DL"],
      fareBases: ["VTEST"],
      slices: [
        {
          origin: "LAX",
          destination: "SEA",
          segments: [
            {
              origin: "LAX",
              destination: "SEA",
              carrier: "DL",
              fareCarrier: "DL",
              bookingClass: "V",
              farePrice: 200,
              cabin: "economy",
            },
          ],
        },
      ],
    };

    expect(
      estimateEarnings(itinerary, ["Delta SkyMiles"], {
        "Delta SkyMiles": "Delta SkyMiles Diamond",
      })
        .filter((estimate) => estimate.program.startsWith("Delta SkyMiles"))
        .map((estimate) => ({
          program: estimate.program,
          miles: estimate.estimatedMiles,
          formula: estimate.formula,
          basis: estimate.basis,
        })),
    ).toEqual([
      {
        program: "Delta SkyMiles Diamond",
        miles: 2200,
        formula: "200 USD x 11 miles/USD",
        basis: "revenue-multiplier",
      },
    ]);
  });

  it("keeps Delta SkyMiles distance earning on partner fare carriers", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      currency: "USD",
      totalPrice: 300,
      passengerCount: 1,
      carriers: ["AF"],
      fareBases: ["VTEST"],
      slices: [
        {
          origin: "CDG",
          destination: "AMS",
          segments: [
            {
              origin: "CDG",
              destination: "AMS",
              distance: 1000,
              carrier: "AF",
              fareCarrier: "AF",
              bookingClass: "V",
              farePrice: 200,
              cabin: "economy",
            },
          ],
        },
      ],
    };

    expect(
      estimateEarnings(itinerary, ["Delta SkyMiles"], {
        "Delta SkyMiles": "Delta SkyMiles Diamond",
      })
        .filter((estimate) => estimate.program.startsWith("Delta SkyMiles"))
        .map((estimate) => ({
          program: estimate.program,
          miles: estimate.estimatedMiles,
          formula: estimate.formula,
          basis: estimate.basis,
        })),
    ).toEqual([
      {
        program: "Delta SkyMiles",
        miles: 250,
        formula: "1,000 miles x 25%",
        basis: "distance-percent",
      },
    ]);
  });

  it("applies owner-carrier revenue multipliers on regional partner flights", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      currency: "USD",
      totalPrice: 300,
      passengerCount: 1,
      carriers: ["OO"],
      fareBases: ["QVAKZOBX"],
      slices: [
        {
          origin: "LAX",
          destination: "SEA",
          segments: [
            {
              origin: "LAX",
              destination: "SEA",
              carrier: "OO",
              carrierName: "SkyWest Airlines",
              fareCarrier: "AA",
              bookingClass: "Q",
              fareBasis: "QVAKZOBX",
              farePrice: 300,
              cabin: "economy",
            },
          ],
        },
      ],
    };

    expect(
      estimateEarnings(itinerary, ["American Airlines AAdvantage"])
        .filter((estimate) => estimate.program === "American Airlines AAdvantage")
        .map((estimate) => ({
          airlineName: estimate.airlineName,
          miles: estimate.estimatedMiles,
          formula: estimate.formula,
          basis: estimate.basis,
        })),
    ).toEqual([
      {
        airlineName: "American Airlines",
        miles: 1500,
        formula: "300 USD x 5 miles/USD",
        basis: "revenue-multiplier",
      },
    ]);
  });

  it("applies Miles&More revenue multipliers to Lufthansa Group fare carriers", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      currency: "EUR",
      totalPrice: 260,
      passengerCount: 1,
      carriers: ["LX"],
      fareBases: ["QTEST"],
      slices: [
        {
          origin: "ZRH",
          destination: "FRA",
          segments: [
            {
              origin: "ZRH",
              destination: "FRA",
              carrier: "LX",
              fareCarrier: "LX",
              bookingClass: "Q",
              farePrice: 200,
              cabin: "economy",
            },
          ],
        },
      ],
    };

    expect(
      estimateEarnings(itinerary, ["Miles&More"])
        .filter((estimate) => estimate.program === "Miles&More")
        .map((estimate) => ({
          miles: estimate.estimatedMiles,
          formula: estimate.formula,
          basis: estimate.basis,
        })),
    ).toEqual([
      {
        miles: 800,
        formula: "200 EUR x 4 miles/EUR",
        basis: "revenue-multiplier",
      },
    ]);
  });

  it("applies Aeroplan revenue tiers to Air Canada fare carriers without distance fallback", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      currency: "CAD",
      totalPrice: 320,
      passengerCount: 1,
      carriers: ["AC"],
      fareBases: ["NTEST"],
      slices: [
        {
          origin: "YYZ",
          destination: "YVR",
          segments: [
            {
              origin: "YYZ",
              destination: "YVR",
              distance: 1000,
              carrier: "AC",
              fareCarrier: "AC",
              bookingClass: "N",
              farePrice: 240,
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
          basis: estimate.basis,
        }))
        .sort((left, right) => (left.program < right.program ? -1 : left.program > right.program ? 1 : 0)),
    ).toEqual([
      {
        program: "Air Canada Aeroplan 25K",
        miles: 480,
        formula: "240 CAD x 2 miles/CAD",
        basis: "revenue-multiplier",
      },
    ]);
  });

  it("does not show multiple conditional rows for one program on the same flight", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      currency: "CAD",
      totalPrice: 300,
      passengerCount: 1,
      carriers: ["AC"],
      fareBases: ["KTEST"],
      slices: [
        {
          origin: "YYZ",
          destination: "YVR",
          segments: [
            {
              origin: "YYZ",
              destination: "YVR",
              distance: 800,
              carrier: "AC",
              fareCarrier: "AC",
              bookingClass: "K",
              cabin: "economy",
            },
          ],
        },
      ],
    };

    expect(
      estimateEarnings(itinerary, ["Air Canada Aeroplan", "United MileagePlus"])
        .filter(
          (estimate) => estimate.program.startsWith("Air Canada Aeroplan") || estimate.program === "United MileagePlus",
        )
        .map((estimate) => ({
          program: estimate.program,
          miles: estimate.estimatedMiles,
          formula: estimate.formula,
          basis: estimate.basis,
        }))
        .sort((left, right) => (left.program < right.program ? -1 : left.program > right.program ? 1 : 0)),
    ).toEqual([
      {
        program: "Air Canada Aeroplan Member",
        miles: undefined,
        formula: "1 Miles/CAD",
        basis: "unknown",
      },
      {
        program: "United MileagePlus",
        miles: 400,
        formula: "800 miles x 50%",
        basis: "distance-percent",
      },
    ]);
  });

  it("does not apply Miles&More revenue multipliers to non-Lufthansa Group fare carriers", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      currency: "EUR",
      totalPrice: 260,
      passengerCount: 1,
      carriers: ["UA"],
      fareBases: ["QTEST"],
      slices: [
        {
          origin: "SFO",
          destination: "FRA",
          segments: [
            {
              origin: "SFO",
              destination: "FRA",
              distance: 1000,
              carrier: "UA",
              fareCarrier: "UA",
              bookingClass: "Q",
              farePrice: 200,
              cabin: "economy",
            },
          ],
        },
      ],
    };

    expect(
      estimateEarnings(itinerary, ["Miles&More"])
        .filter((estimate) => estimate.program === "Miles&More")
        .map((estimate) => ({
          miles: estimate.estimatedMiles,
          formula: estimate.formula,
          basis: estimate.basis,
        })),
    ).toEqual([
      {
        miles: 500,
        formula: "1,000 miles x 50%",
        basis: "distance-percent",
      },
    ]);
  });

  it("does not use total itinerary price for revenue multiplier estimates", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      currency: "USD",
      totalPrice: 300,
      passengerCount: 1,
      carriers: ["B6"],
      fareBases: [],
      slices: [
        {
          origin: "LAX",
          destination: "JFK",
          segments: [
            {
              origin: "LAX",
              destination: "JFK",
              carrier: "B6",
              fareCarrier: "B6",
              bookingClass: "B",
              cabin: "economy",
            },
          ],
        },
      ],
    };

    expect(
      estimateEarnings(itinerary, ["JetBlue TrueBlue"])
        .filter((estimate) => estimate.program === "JetBlue TrueBlue")
        .map((estimate) => ({
          miles: estimate.estimatedMiles,
          formula: estimate.formula,
          basis: estimate.basis,
        })),
    ).toEqual([
      {
        miles: undefined,
        formula: "2 Miles/USD",
        basis: "unknown",
      },
    ]);
  });

  it("does not use total itinerary price for American AAdvantage revenue estimates", () => {
    const itinerary: NormalizedItinerary = {
      source: "ita-matrix",
      capturedAt: "2026-01-01T00:00:00Z",
      tripType: "one-way",
      currency: "USD",
      totalPrice: 300,
      passengerCount: 1,
      carriers: ["AA"],
      fareBases: ["QVAKZOBX"],
      slices: [
        {
          origin: "LAX",
          destination: "SEA",
          segments: [
            {
              origin: "LAX",
              destination: "SEA",
              carrier: "AA",
              fareCarrier: "AA",
              bookingClass: "Q",
              fareBasis: "QVAKZOBX",
              cabin: "economy",
            },
          ],
        },
      ],
    };

    expect(
      estimateEarnings(itinerary, ["American Airlines AAdvantage"])
        .filter((estimate) => estimate.program === "American Airlines AAdvantage")
        .map((estimate) => ({
          miles: estimate.estimatedMiles,
          formula: estimate.formula,
          basis: estimate.basis,
        })),
    ).toEqual([
      {
        miles: undefined,
        formula: "5 Miles/USD",
        basis: "unknown",
      },
    ]);
  });

  it("does not display the selected Air Canada Aeroplan revenue tier on United-issued tickets", () => {
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
    ).toEqual([]);
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
      carriers: ["B6"],
      fareBases: [],
      slices: [
        {
          origin: "SCL",
          destination: "LIM",
          segments: [
            {
              origin: "SCL",
              destination: "LIM",
              carrier: "B6",
              fareCarrier: "B6",
              bookingClass: "B",
              farePrice: 100,
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
              carrier: "B6",
              fareCarrier: "B6",
              bookingClass: "B",
              farePrice: 100,
              cabin: "economy",
            },
          ],
        },
      ],
    };

    expect(
      estimateEarnings(itinerary)
        .filter((estimate) => estimate.program === "JetBlue TrueBlue")
        .map((estimate) => estimate.estimatedMiles),
    ).toEqual([200, 200]);
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
