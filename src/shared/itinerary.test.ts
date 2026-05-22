import fixture from "./fixtures/itaRoundTrip.json";
import {
  buildWhereToCreditCalculatorUrl,
  buildWhereToCreditSegmentUrls,
  buildWhereToCreditUrl,
  parseItaBookingDetails,
} from "./itinerary";

describe("ITA itinerary parsing", () => {
  it("normalizes ITA Matrix booking details", () => {
    const itinerary = parseItaBookingDetails(fixture);

    expect(itinerary.tripType).toBe("round-trip");
    expect(itinerary.currency).toBe("USD");
    expect(itinerary.totalPrice).toBe(1234.56);
    expect(itinerary.carriers).toEqual(["AA", "BA"]);
    expect(itinerary.fareBases).toEqual(["INN0C7S4", "RNN0C7S4"]);
    expect(itinerary.slices[0]?.segments[0]).toMatchObject({
      origin: "JFK",
      destination: "LHR",
      carrier: "AA",
      bookingClass: "I",
      fareBasis: "INN0C7S4",
      fareCarrier: "AA",
      cabin: "business",
    });
  });

  it("builds direct Where to Credit URLs from carrier and booking class", () => {
    const itinerary = parseItaBookingDetails(fixture);

    expect(buildWhereToCreditUrl(itinerary)).toBe("https://wheretocredit.com/en/AA/I");
    expect(buildWhereToCreditSegmentUrls(itinerary)).toEqual([
      { label: "JFK-LHR AA I", url: "https://wheretocredit.com/en/AA/I" },
      { label: "LHR-JFK BA R", url: "https://wheretocredit.com/en/BA/R" },
    ]);
  });

  it("still builds the multi-segment Where to Credit calculator URL", () => {
    const itinerary = parseItaBookingDetails(fixture);

    expect(buildWhereToCreditCalculatorUrl(itinerary)).toBe(
      "https://www.wheretocredit.com/calculator#JFK-LHR-AA-I/LHR-JFK-BA-R",
    );
  });
});
