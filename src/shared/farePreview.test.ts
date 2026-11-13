import type { FareEstimate } from "./communityHistory";
import { buildFarePreview, type FarePreviewContext } from "./farePreview";
import { DEFAULT_SETTINGS } from "./storage";

const context: FarePreviewContext = {
  fare: {
    origin: "BKK",
    destination: "NRT",
    carrier: "TG",
    cabin: "COACH",
    departureDate: "2027-01-01",
    currency: "USD",
    price: 200,
    tripType: "one-way",
    passengerCount: 1,
  },
  flightNumber: "640",
};
const estimate: FareEstimate = {
  status: "historical-estimate",
  candidates: [
    { bookingClass: "W", share: 0.7, sampleCount: 7 },
    { bookingClass: "Y", share: 0.3, sampleCount: 3 },
  ],
};
const settings = { ...DEFAULT_SETTINGS, preferredFrequentFlyerPrograms: ["United MileagePlus"] };

describe("uncertain booking-class mileage previews", () => {
  it("uses the same preferred program across every plausible class", () => {
    const model = buildFarePreview(context, estimate, settings);
    expect(model.program).toBe("United MileagePlus");
    expect(model.classes.map((row) => row.earning?.program)).toEqual(["United MileagePlus", "United MileagePlus"]);
    expect(model.range).toEqual({ min: 722, max: 2889 });
    expect(model.selected.bookingClass).toBe("W");
    expect(model.mostLikelyClass).toBe("W");
  });
  it("collapses equal earning results to one amount", () => {
    expect(
      buildFarePreview(context, estimate, { ...settings, preferredFrequentFlyerPrograms: ["Air India Maharaja Club"] })
        .range,
    ).toEqual({ min: 2889, max: 2889 });
  });
  it("withholds a range when a plausible class lacks earning data", () => {
    const model = buildFarePreview(
      { ...context, fare: { ...context.fare, origin: "TPE", carrier: "BR" } },
      {
        status: "historical-estimate",
        candidates: [
          { bookingClass: "V", share: 0.7, sampleCount: 7 },
          { bookingClass: "S", share: 0.3, sampleCount: 3 },
        ],
      },
      settings,
    );
    expect(model.classes[0]?.earning).toBeUndefined();
    expect(model.classes[1]?.earning?.estimatedMiles).toBe(678);
    expect(model.range).toBeNull();
  });
  it("keeps manual class and program changes separate from the historical prediction", () => {
    const before = JSON.stringify([context, estimate, settings]);
    const model = buildFarePreview(context, estimate, settings, {
      bookingClass: "Y",
      program: "Air India Maharaja Club",
    });
    expect(model.selected.bookingClass).toBe("Y");
    expect(model.selected.earning?.estimatedMiles).toBe(2889);
    expect(model.classes.map((row) => row.bookingClass)).toEqual(["W", "Y"]);
    expect(model.mostLikelyClass).toBe("W");
    expect(JSON.stringify([context, estimate, settings])).toBe(before);
  });
  it("does not convert a tax-inclusive search total into revenue-based miles", () => {
    const model = buildFarePreview(
      { ...context, fare: { ...context.fare, carrier: "UA", origin: "LAX", destination: "SEA", price: 5000 } },
      { status: "historical-estimate", candidates: [{ bookingClass: "Y", share: 1, sampleCount: 3 }] },
      { ...settings, frequentFlyerProgramTiers: { "United MileagePlus": "United MileagePlus Premier Gold" } },
    );
    expect(model.program).toBe("United MileagePlus Premier Gold");
    expect(model.selected.earning).toMatchObject({ requiresEligibleFare: true, formula: "8 Miles/USD" });
    expect(model.selected.earning?.estimatedMiles).toBeUndefined();
    expect(model.selected.earning?.segment.farePrice).toBeUndefined();
    expect(model.range).toBeNull();
  });
  it("does not claim a most-likely class for a tie", () => {
    const model = buildFarePreview(
      context,
      { ...estimate, candidates: estimate.candidates.map((candidate) => ({ ...candidate, share: 0.5 })) },
      settings,
    );
    expect(model.mostLikelyClass).toBeUndefined();
  });
  it("opens ITA for this flight without treating the preview as a confirmed class filter", () => {
    const model = buildFarePreview(context, estimate, settings, { bookingClass: "Y" });
    const search = JSON.parse(atob(new URL(model.matrixUrl).searchParams.get("search") || ""));
    expect(search).toMatchObject({
      type: "one-way",
      options: { cabin: "COACH", currency: { code: "USD" } },
      slices: [{ origin: ["BKK"], dest: ["NRT"], routing: "F:TG640" }],
    });
    expect(JSON.stringify(search)).not.toContain("bookingClass");
  });
});
