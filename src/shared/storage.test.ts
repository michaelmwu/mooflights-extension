import { DEFAULT_SETTINGS, mergeSettings } from "./storage";

describe("settings", () => {
  it("merges partial stored settings with safe defaults", () => {
    expect(
      mergeSettings({
        affiliateOptOut: true,
        backend: {
          enabled: true,
        },
      }),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      affiliateOptOut: true,
      backend: {
        ...DEFAULT_SETTINGS.backend,
        enabled: true,
      },
    });
  });

  it("normalizes invalid stored settings back to safe values", () => {
    expect(
      mergeSettings({
        hiddenProviderIds: null,
        preferredProviderIds: "kayak",
        preferredFrequentFlyerPrograms: ["Air Canada Aeroplan", 123, "British Airways Club"],
        affiliateOptOut: "yes",
        debugMode: 1,
        googleFlights: {
          countryCodes: ["jp", "MY", "not-a-country", null, "JP"],
        },
        airportHelper: {
          region: 7,
          continent: 123,
          countries: [null, "US"],
          alliance: false,
          airlines: "AS",
          exclusions: ["JFK", 123],
        },
        backend: {
          enabled: "true",
          baseUrl: 123,
        },
      }),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      preferredFrequentFlyerPrograms: ["Air Canada Aeroplan", "British Airways Club"],
      googleFlights: {
        countryCodes: ["JP", "MY"],
      },
      airportHelper: {
        ...DEFAULT_SETTINGS.airportHelper,
        countries: ["US"],
        exclusions: ["JFK"],
      },
    });
  });
});
