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
    expect(urls.get("google-flights")).toContain("https://www.google.com/travel/flights?");
    expect(urls.has("ita-copy")).toBe(false);
    expect(urls.has("skyscanner")).toBe(false);
    expect(urls.get("expedia")).toContain("https://www.expedia.com/Flights-Search?");
    expect(urls.get("expedia")).toContain("trip=roundtrip");
    expect(urls.get("expedia")).toContain("leg1=from%3AJFK%2Cto%3ALHR%2Cdeparture%3A8%2F10%2F2026TANYT");
    expect(urls.get("where-to-credit")).toMatch(/^https:\/\/wheretocredit\.com\/en\/[A-Z0-9]{2,3}\/[A-Z]$/);
  });
});
