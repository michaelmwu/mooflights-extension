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

  it("keeps repeated origin-destination booking classes mapped to their own fares", () => {
    const itinerary = parseItaBookingDetails({
      displayTotal: "USD 500.00",
      passengerCount: 1,
      itinerary: {
        slices: [repeatedSlice("2026-08-10T10:00:00", "100"), repeatedSlice("2026-08-15T10:00:00", "200")],
      },
      tickets: [
        {
          pricings: [
            {
              fares: [repeatedFare("AA", "FIRSTFARE"), repeatedFare("BA", "SECONDFARE")],
            },
          ],
        },
      ],
    });

    expect(itinerary.slices[0]?.segments[0]).toMatchObject({
      fareCarrier: "AA",
      fareBasis: "FIRSTFARE",
    });
    expect(itinerary.slices[1]?.segments[0]).toMatchObject({
      fareCarrier: "BA",
      fareBasis: "SECONDFARE",
    });
  });

  it("keeps ITA carrier display names when present", () => {
    const itinerary = parseItaBookingDetails({
      itinerary: {
        slices: [
          {
            origin: { code: "HKG" },
            destination: { code: "BKK" },
            segments: [
              {
                origin: { code: "HKG" },
                destination: { code: "BKK" },
                carrier: { code: "HX", shortName: "Hong Kong Airlines" },
                bookingInfos: [{ bookingCode: "Y", cabin: "COACH" }],
              },
            ],
          },
        ],
      },
    });

    expect(itinerary.slices[0]?.segments[0]).toMatchObject({
      carrier: "HX",
      carrierName: "Hong Kong Airlines",
    });
  });

  it("keeps ITA segment duration when present", () => {
    const itinerary = parseItaBookingDetails({
      itinerary: {
        slices: [
          {
            origin: { code: "TPE" },
            destination: { code: "MFM" },
            segments: [
              {
                origin: { code: "TPE" },
                destination: { code: "MFM" },
                carrier: { code: "NX" },
                duration: 110,
                bookingInfos: [{ bookingCode: "R", cabin: "COACH" }],
              },
            ],
          },
        ],
      },
    });

    expect(itinerary.slices[0]?.segments[0]).toMatchObject({
      origin: "TPE",
      destination: "MFM",
      duration: 110,
    });
  });

  it("normalizes numeric ITA flight numbers", () => {
    const itinerary = parseItaBookingDetails({
      itinerary: {
        slices: [
          {
            origin: { code: "TPE" },
            destination: { code: "MFM" },
            segments: [
              {
                origin: { code: "TPE" },
                destination: { code: "MFM" },
                carrier: { code: "NX" },
                flight: { number: 631 },
                bookingInfos: [{ bookingCode: "R", cabin: "COACH" }],
              },
            ],
          },
        ],
      },
    });

    expect(itinerary.slices[0]?.segments[0]?.flightNumber).toBe("631");
  });
});

function repeatedSlice(departure: string, flightNumber: string): unknown {
  return {
    origin: { code: "JFK" },
    destination: { code: "LAX" },
    departure,
    segments: [
      {
        origin: { code: "JFK" },
        destination: { code: "LAX" },
        carrier: { code: "AA" },
        flight: { number: flightNumber },
        bookingInfos: [{ bookingCode: "X", cabin: "COACH" }],
        legs: [
          {
            origin: { code: "JFK" },
            destination: { code: "LAX" },
            departure,
          },
        ],
      },
    ],
  };
}

function repeatedFare(carrier: string, code: string): unknown {
  return {
    carrier,
    code,
    bookingInfos: [
      {
        bookingCode: "X",
        segment: {
          origin: "JFK",
          destination: "LAX",
        },
      },
    ],
  };
}
