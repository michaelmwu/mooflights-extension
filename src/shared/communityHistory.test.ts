import {
  buildFareObservation,
  buildMarketObservation,
  fareQueriesForSearchRow,
  fareQueryForSearchRow,
  historyBaseUrl,
  marketQueriesForSearchRows,
  orderHistoricalCountries,
  validatedFareEstimate,
} from "./communityHistory";
import type { CountryResult } from "./countryComparison";
import type { NormalizedItinerary } from "./types";

const segment = "\x0a\x03TPE\x12\x0a2027-01-01\x1a\x03NRT\x2a\x02BR\x32\x03198";
const url = `https://www.google.com/travel/flights/booking?curr=USD&tfs=${btoa(`\x1a${String.fromCharCode(segment.length)}${segment}`)}`;
const itinerary: NormalizedItinerary = {
  source: "ita-matrix",
  capturedAt: "2026-11-13T00:00:00Z",
  tripType: "one-way",
  passengerCount: 1,
  totalPrice: 200,
  currency: "USD",
  carriers: ["BR"],
  fareBases: ["VLX"],
  slices: [
    {
      origin: "TPE",
      destination: "NRT",
      segments: [
        {
          origin: "TPE",
          destination: "NRT",
          carrier: "BR",
          bookingClass: "V",
          fareBasis: "VLX",
          flightNumber: "198",
          departure: "2027-01-01T12:00:00",
          cabin: "economy",
        },
      ],
    },
  ],
};
function result(country: string, currency = "USD"): CountryResult {
  return {
    country,
    url: "https://example.com/private",
    status: "ready",
    options: [
      {
        provider: "Example OTA",
        price: 100,
        currency,
        isDirect: false,
        priceText: "$100",
        bookingUrl: "https://example.com/secret",
      },
      { provider: "EVA Air", price: 150, currency, isDirect: true, priceText: "$150" },
    ],
  };
}

describe("community flight history", () => {
  it("serializes route, carrier, OTA and direct prices without page text or booking URLs", () => {
    const observation = buildMarketObservation(url, "US", [result("US"), result("JP")], "key");
    expect(observation).toMatchObject({
      carriers: ["BR"],
      cabin: "COACH",
      markets: [
        {
          country: "US",
          cheapestPrice: 100,
          directPrice: 150,
          options: [
            { provider: "Example OTA", price: 100, isDirect: false },
            { provider: "EVA Air", price: 150, isDirect: true },
          ],
        },
        { country: "JP", cheapestPrice: 100 },
      ],
    });
    expect(observation).not.toHaveProperty("countries");
    expect(JSON.stringify(observation)).not.toMatch(/https:|secret|priceText|summaryText/);
  });
  it("does not combine currencies or record one-market comparisons", () => {
    expect(buildMarketObservation(url, "US", [result("US"), result("JP", "JPY")], "key")).toBeNull();
    expect(buildMarketObservation(url, "US", [result("US")], "key")).toBeNull();
  });
  it("captures confirmed fare labels and abstains for ambiguous totals or missing labels", () => {
    expect(buildFareObservation(itinerary, "key")).toMatchObject({
      bookingClass: "V",
      fareBasis: "VLX",
      price: 200,
      carrier: "BR",
    });
    for (const patch of [
      { passengerCount: 2 },
      { passengerCount: undefined },
      { tripType: "round-trip" as const },
      { totalPrice: Infinity },
    ]) {
      expect(buildFareObservation({ ...itinerary, ...patch }, "key")).toBeNull();
    }
    const unlabelled = structuredClone(itinerary);
    delete unlabelled.slices[0]?.segments[0]?.bookingClass;
    expect(buildFareObservation(unlabelled, "key")).toBeNull();
  });
  it("prioritizes only selected countries and preserves defaults for missing or invalid history", () => {
    const countries = ["US", "JP", "TW"];
    expect(
      orderHistoricalCountries(countries, {
        recommendations: [
          { country: "JP", relativePrice: 1, sampleCount: 3 },
          { country: "CA", relativePrice: 1, sampleCount: 20 },
          { country: "TW", relativePrice: 0, sampleCount: 100 },
        ],
      }),
    ).toEqual(["JP", "US", "TW"]);
    expect(orderHistoricalCountries(countries, null)).toEqual(countries);
  });
  it("uses a price-free segment prior for group and connecting searches", () => {
    const row = { itineraryKey: "TPE-NRT-BR198-2027-01-01", currency: "USD", price: 200 };
    expect(fareQueryForSearchRow(url, row, true)).toMatchObject({
      origin: "TPE",
      carrier: "BR",
      price: 200,
      passengerCount: 1,
    });
    expect(fareQueryForSearchRow(url, row, false)).toMatchObject({ priceContext: "itinerary" });
    expect(
      fareQueriesForSearchRow(url, { ...row, itineraryKey: "TPE-KIX-BR1-20270101|KIX-NRT-JL2-20270101" }, true),
    ).toMatchObject([
      { fare: { origin: "TPE", destination: "KIX", priceContext: "itinerary" }, flightNumber: "1" },
      { fare: { origin: "KIX", destination: "NRT", priceContext: "itinerary" }, flightNumber: "2" },
    ]);
    expect(
      fareQueriesForSearchRow(url, { ...row, itineraryKey: "TPE-KIX-BR1-20270101|HND-NRT-JL2-20270101" }, true),
    ).toEqual([]);
    expect(fareQueryForSearchRow(url, { ...row, itineraryKey: "KIX-NRT-BR198-2027-01-01" }, true)).toBeNull();
  });
  it("supports compact Google itinerary dates and derives carrier priors from search rows", () => {
    expect(
      fareQueryForSearchRow(url, { itineraryKey: "TPE-NRT-BR198-20270101", currency: "USD", price: 200 }, true)
        ?.departureDate,
    ).toBe("2027-01-01");
    const routeOnly = btoa("\x1a\x25\x12\x0a2027-01-01\x6a\x07\x08\x01\x12\x03TPE\x72\x07\x08\x01\x12\x03NRT");
    const queries = marketQueriesForSearchRows(
      `https://www.google.com/travel/flights/search?tfs=${routeOnly}`,
      [{ itineraryKey: "TPE-NRT-BR198-20270101" }, { itineraryKey: "TPE-NRT-JL802-20270101" }],
      ["US", "JP"],
    );
    expect(queries.map((query) => query.carriers)).toEqual([["BR"], ["JL"]]);
  });
  it("supports return searches and rejects stale row identities", () => {
    const back = "\x0a\x03NRT\x12\x0a2027-01-10\x1a\x03TPE\x2a\x02BR\x32\x03197";
    const roundTrip = `https://www.google.com/travel/flights/search?curr=USD&tfs=${btoa(`\x1a${String.fromCharCode(segment.length)}${segment}\x1a${String.fromCharCode(back.length)}${back}`)}`;
    expect(
      fareQueriesForSearchRow(roundTrip, { itineraryKey: "TPE-NRT-BR198-20270101", currency: "USD", price: 800 }, true),
    ).toMatchObject([{ fare: { priceContext: "itinerary", origin: "TPE" } }]);
    expect(
      fareQueriesForSearchRow(
        roundTrip,
        { itineraryKey: "NRT-TPE-BR197-20270110", currency: "USD", price: 800 },
        false,
      ),
    ).toMatchObject([{ fare: { priceContext: "itinerary", origin: "NRT" } }]);
    expect(
      fareQueriesForSearchRow(roundTrip, { itineraryKey: "TPE-NRT-BR198-20270201", currency: "USD", price: 800 }, true),
    ).toEqual([]);
  });
  it("validates predictions as uncertain hints rather than confirmed labels", () => {
    expect(
      validatedFareEstimate({
        status: "historical-estimate",
        candidates: [{ bookingClass: "V", share: 0.8, sampleCount: 4 }],
      }).status,
    ).toBe("historical-estimate");
    expect(
      validatedFareEstimate({
        status: "historical-estimate",
        candidates: [{ bookingClass: "V", share: 2, sampleCount: 1 }],
      }).status,
    ).toBe("unknown");
  });
  it("restricts API URLs to HTTPS origins and local development origins", () => {
    expect(historyBaseUrl("https://api.example.com/")).toBe("https://api.example.com");
    expect(historyBaseUrl("http://localhost:48731")).toBe("http://localhost:48731");
    for (const value of [
      "http://example.com",
      "https://user:password@example.com",
      "https://example.com/other",
      "https://example.com?token=test",
    ])
      expect(historyBaseUrl(value)).toBe("");
  });
});
