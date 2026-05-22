import fixture from "./fixtures/itaRoundTrip.json";
import { parseItaBookingDetails } from "./itinerary";
import { rankProviderLinks } from "./providers";
import { DEFAULT_SETTINGS } from "./storage";

describe("provider ranking", () => {
  it("keeps miles-credit links above booking links", () => {
    const itinerary = parseItaBookingDetails(fixture);
    const links = rankProviderLinks(itinerary, DEFAULT_SETTINGS);

    expect(links[0]?.provider.id).toBe("where-to-credit");
    expect(links.some((link) => link.provider.id === "kayak")).toBe(true);
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

  it("builds reliable provider links from ITA itinerary details", () => {
    const itinerary = parseItaBookingDetails(fixture);
    const links = rankProviderLinks(itinerary, DEFAULT_SETTINGS);
    const urls = new Map(links.map((link) => [link.provider.id, link.url]));

    expect(urls.get("kayak")).toBe("https://www.kayak.com/flights/JFK-LHR/2026-08-10/LHR-JFK/2026-08-20/business");
    expect(urls.get("google-flights")).toContain("https://www.google.com/travel/flights?");
    expect(urls.has("skyscanner")).toBe(false);
    expect(urls.has("expedia")).toBe(false);
    expect(urls.get("where-to-credit")).toMatch(/^https:\/\/wheretocredit\.com\/en\/[A-Z0-9]{2,3}\/[A-Z]$/);
  });
});
