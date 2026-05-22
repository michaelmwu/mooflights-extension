import fixture from "./fixtures/itaRoundTrip.json";
import { parseItaBookingDetails } from "./itinerary";
import { rankProviderLinks } from "./providers";
import { DEFAULT_SETTINGS } from "./storage";

describe("provider ranking", () => {
  it("keeps miles-credit and reliable links above weaker OTA links", () => {
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
      [{ providerId: "expedia", reliabilityScore: 95 }],
    );

    expect(links.some((link) => link.provider.id === "kayak")).toBe(false);
    expect(links.findIndex((link) => link.provider.id === "expedia")).toBeLessThan(
      links.findIndex((link) => link.provider.id === "skyscanner"),
    );
  });

  it("builds provider-specific deep links from ITA itinerary details", () => {
    const itinerary = parseItaBookingDetails(fixture);
    const links = rankProviderLinks(itinerary, DEFAULT_SETTINGS);
    const urls = new Map(links.map((link) => [link.provider.id, link.url]));

    expect(urls.get("kayak")).toBe("https://www.kayak.com/flights/JFK-LHR/2026-08-10/LHR-JFK/2026-08-20/business");
    expect(urls.get("skyscanner")).toContain(
      "https://www.skyscanner.com/transport/d/jfk/2026-08-10/lhr/lhr/2026-08-20/jfk?",
    );
    expect(urls.get("expedia")).toContain("https://www.expedia.com/Flight-Search-Details?");
    expect(urls.get("expedia")).toContain("trip=MultipleDestination");
    expect(urls.get("where-to-credit")).toMatch(/^https:\/\/wheretocredit\.com\/en\/[A-Z0-9]{2,3}\/[A-Z]$/);
  });
});
