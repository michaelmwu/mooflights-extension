import fixture from "./fixtures/itaRoundTrip.json";
import { parseItaBookingDetails } from "./itinerary";
import { rankProviderLinks } from "./providers";
import { DEFAULT_SETTINGS } from "./storage";

describe("provider ranking", () => {
  it("keeps miles-credit links above booking links", () => {
    const itinerary = parseItaBookingDetails(fixture);
    const links = rankProviderLinks(itinerary, DEFAULT_SETTINGS);

    expect(links[0]?.provider.id).toBe("where-to-credit");
    expect(links.findIndex((link) => link.provider.id === "kayak")).toBeLessThan(
      links.findIndex((link) => link.provider.id === "expedia"),
    );
  });

  it("honors hidden providers and remote reliability metadata", () => {
    const itinerary = parseItaBookingDetails(fixture);
    const links = rankProviderLinks(
      itinerary,
      { ...DEFAULT_SETTINGS, hiddenProviderIds: ["kayak"], preferredProviderIds: [] },
      [{ providerId: "google-flights", reliabilityScore: 70 }],
    );

    expect(links.some((link) => link.provider.id === "kayak")).toBe(false);
    expect(links.find((link) => link.provider.id === "google-flights")?.confidence).toBe("medium");
  });

  it("ignores malformed remote reliability metadata", () => {
    const itinerary = parseItaBookingDetails(fixture);
    const links = rankProviderLinks(itinerary, DEFAULT_SETTINGS, [
      { providerId: "google-flights", reliabilityScore: "90" } as never,
      { providerId: "kayak", reliabilityScore: 72 },
    ]);

    expect(links.find((link) => link.provider.id === "google-flights")?.provider.reliabilityScore).toBe(96);
    expect(links.find((link) => link.provider.id === "google-flights")?.confidence).toBe("high");
    expect(links.find((link) => link.provider.id === "kayak")?.provider.reliabilityScore).toBe(72);
    expect(links.find((link) => link.provider.id === "kayak")?.confidence).toBe("medium");
  });

  it("builds reliable provider links from ITA itinerary details", () => {
    const itinerary = parseItaBookingDetails(fixture);
    const links = rankProviderLinks(itinerary, DEFAULT_SETTINGS);
    const urls = new Map(links.map((link) => [link.provider.id, link.url]));

    expect(urls.get("kayak")).toBe("https://www.kayak.com/flights/JFK-LHR/2026-08-10/LHR-JFK/2026-08-20");
    expect(urls.get("momondo")).toBe(
      "https://www.momondo.com/flight-search/JFK-LHR/2026-08-10/LHR-JFK/2026-08-20/business",
    );
    expect(urls.get("google-flights")).toContain("https://www.google.com/travel/flights?");
    expect(urls.has("ita-copy")).toBe(false);
    expect(urls.get("skyscanner")).toContain("https://www.skyscanner.com/transport/d/jfk/2026-08-10/lhr");
    expect(urls.get("skyscanner")).toContain("lhr/2026-08-20/jfk");
    expect(urls.get("expedia")).toContain("https://www.expedia.com/Flights-Search?");
    expect(urls.get("travelocity")).toContain("https://www.travelocity.com/Flights-Search?");
    expect(urls.get("orbitz")).toContain("https://www.orbitz.com/Flights-Search?");
    expect(urls.get("cheaptickets")).toContain("https://www.cheaptickets.com/Flights-Search?");
    expect(urls.get("edreams")).toContain("https://www.edreams.com/travel/?");
    expect(urls.get("edreams")).toContain("from0=JFK");
    expect(urls.get("opodo")).toContain("https://www.opodo.com/travel/?");
    expect(urls.get("travellink")).toContain("https://www.travellink.com/travel/?");
    expect(urls.get("expedia")).toContain("trip=roundtrip");
    expect(urls.get("expedia")).toContain("leg1=from%3AJFK%2Cto%3ALHR%2Cdeparture%3A8%2F10%2F2026TANYT");
    expect(urls.get("priceline")).toBe(
      "https://www.priceline.com/m/fly/search/JFK-LHR-20260810/LHR-JFK-20260820?adults=1&cabin-class=BUS",
    );
    expect(urls.get("cheapoair")).toContain("https://www.cheapoair.com/default.aspx?");
    expect(urls.get("cheapoair")).toContain("tt=RoundTrip");
    expect(urls.get("cheapoair")).toContain("carr1=AA");
    expect(urls.get("cheapoair")).toContain("carr2=BA");
    expect(urls.get("where-to-credit")).toMatch(/^https:\/\/wheretocredit\.com\/en\/[A-Z0-9]{2,3}\/[A-Z]$/);
  });

  it("builds multi-city provider links from ITA itinerary hops", () => {
    const itinerary = parseItaBookingDetails(multiCityFixture());
    const links = rankProviderLinks(itinerary, DEFAULT_SETTINGS);
    const urls = new Map(links.map((link) => [link.provider.id, link.url]));

    expect(itinerary.tripType).toBe("multi-city");
    expect(urls.has("google-flights")).toBe(false);
    expect(urls.get("kayak")).toBe("https://www.kayak.com/flights/TPE-ICN/2026-06-12/CJU-NRT/2026-06-24");
    expect(urls.get("momondo")).toBe(
      "https://www.momondo.com/flight-search/TPE-ICN/2026-06-12/CJU-NRT/2026-06-24/economy",
    );
    expect(urls.get("skyscanner")).toContain("tpe/2026-06-12/icn");
    expect(urls.get("edreams")).toContain("dep1=2026-06-24");
    expect(urls.get("opodo")).toContain("segmentKey1=0,ZH642,ZH651");
    expect(urls.get("priceline")).toContain("TPE-ICN-20260612/CJU-NRT-20260624");

    const expedia = new URL(urls.get("expedia") || "");
    expect(expedia.origin + expedia.pathname).toBe("https://www.expedia.com/Flight-Search-Details");
    expect(expedia.searchParams.get("trip")).toBe("MultipleDestination");
    expect(expedia.searchParams.get("legs[0].departureAirport")).toBe("TPE");
    expect(expedia.searchParams.get("legs[0].arrivalAirport")).toBe("ICN");
    expect(expedia.searchParams.get("legs[0].departureDate")).toBe("2026-06-12");
    expect(expedia.searchParams.get("legs[0].segments[0]")).toBe("2026-06-12-coach-tpe-mfm-nx-631");
    expect(expedia.searchParams.get("legs[0].segments[1]")).toBe("2026-06-12-coach-mfm-icn-nx-826");
    expect(expedia.searchParams.get("legs[1].departureAirport")).toBe("CJU");
    expect(expedia.searchParams.get("legs[1].arrivalAirport")).toBe("NRT");
    expect(expedia.searchParams.get("legs[1].segments[0]")).toBe("2026-06-24-coach-cju-szx-zh-642");
    expect(expedia.searchParams.get("legs[1].segments[1]")).toBe("2026-06-25-coach-szx-nrt-zh-651");

    const travelocity = new URL(urls.get("travelocity") || "");
    expect(travelocity.origin + travelocity.pathname).toBe("https://www.travelocity.com/Flight-Search-Details");

    const cheapOair = new URL(urls.get("cheapoair") || "");
    expect(cheapOair.searchParams.get("tt")).toBe("MultiCity");
    expect(cheapOair.searchParams.get("Slice1")).toBe("1,2");
    expect(cheapOair.searchParams.get("Slice2")).toBe("3,4");
    expect(cheapOair.searchParams.get("carr1")).toBe("NX");
    expect(cheapOair.searchParams.get("dd4")).toBe("20260625");
  });
});

function multiCityFixture(): unknown {
  return {
    displayTotal: "USD671.30",
    passengerCount: 1,
    itinerary: {
      distance: { value: 4735 },
      slices: [
        {
          origin: { code: "TPE" },
          destination: { code: "ICN" },
          segments: [
            {
              origin: { code: "TPE" },
              destination: { code: "MFM" },
              carrier: { code: "NX" },
              flight: { number: 631 },
              bookingInfos: [{ bookingCode: "R", cabin: "COACH" }],
              legs: [
                {
                  origin: { code: "TPE" },
                  destination: { code: "MFM" },
                  departure: "2026-06-12T09:10+08:00",
                  arrival: "2026-06-12T11:00+08:00",
                  duration: 110,
                },
              ],
            },
            {
              origin: { code: "MFM" },
              destination: { code: "ICN" },
              carrier: { code: "NX" },
              flight: { number: 826 },
              bookingInfos: [{ bookingCode: "R", cabin: "COACH" }],
              legs: [
                {
                  origin: { code: "MFM" },
                  destination: { code: "ICN" },
                  departure: "2026-06-12T18:10+08:00",
                  arrival: "2026-06-12T22:45+09:00",
                  duration: 215,
                },
              ],
            },
          ],
        },
        {
          origin: { code: "CJU" },
          destination: { code: "NRT" },
          segments: [
            {
              origin: { code: "CJU" },
              destination: { code: "SZX" },
              carrier: { code: "ZH" },
              flight: { number: 642 },
              bookingInfos: [{ bookingCode: "S", cabin: "COACH" }],
              legs: [
                {
                  origin: { code: "CJU" },
                  destination: { code: "SZX" },
                  departure: "2026-06-24T14:00+09:00",
                  arrival: "2026-06-24T16:15+08:00",
                  duration: 195,
                },
              ],
            },
            {
              origin: { code: "SZX" },
              destination: { code: "NRT" },
              carrier: { code: "ZH" },
              flight: { number: 651 },
              bookingInfos: [{ bookingCode: "T", cabin: "COACH" }],
              legs: [
                {
                  origin: { code: "SZX" },
                  destination: { code: "NRT" },
                  departure: "2026-06-25T12:30+08:00",
                  arrival: "2026-06-25T18:00+09:00",
                  duration: 270,
                },
              ],
            },
          ],
        },
      ],
    },
  };
}
