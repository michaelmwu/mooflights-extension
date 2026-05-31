import { DEFAULT_SETTINGS, mergeSettings } from "./storage";

describe("settings", () => {
  it("merges partial stored settings with safe defaults", () => {
    expect(
      mergeSettings({
        backend: {
          enabled: true,
        },
      }),
    ).toEqual({
      ...DEFAULT_SETTINGS,
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
        frequentFlyerProgramTiers: {
          "United MileagePlus": "United MileagePlus Premier Gold",
          bad: 123,
        },
        debugMode: 1,
        googleFlights: {
          countryCodes: ["jp", "MY", "AQ", "not-a-country", null, "JP"],
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
      frequentFlyerProgramTiers: {
        "United MileagePlus": "United MileagePlus Premier Gold",
      },
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

  it("preserves an intentionally empty Google Flights country list", () => {
    expect(
      mergeSettings({
        googleFlights: {
          countryCodes: [],
        },
      }).googleFlights.countryCodes,
    ).toEqual([]);
  });

  it("restores Google Flights country defaults when a stored list has no valid codes", () => {
    expect(
      mergeSettings({
        googleFlights: {
          countryCodes: ["bad", 123],
        },
      }).googleFlights.countryCodes,
    ).toEqual(DEFAULT_SETTINGS.googleFlights.countryCodes);
  });

  it("removes unsupported Google Flights countries from stored settings", () => {
    expect(
      mergeSettings({
        googleFlights: {
          countryCodes: ["US", "AQ", "JP"],
        },
      }).googleFlights.countryCodes,
    ).toEqual(["US", "JP"]);
  });

  it("migrates the legacy recommended Google Flights countries to current defaults", () => {
    expect(
      mergeSettings({
        googleFlights: {
          countryCodes: ["US", "CA", "GB", "JP", "TW", "HK", "SG", "KR", "AU", "MY"],
        },
      }).googleFlights.countryCodes,
    ).toEqual(DEFAULT_SETTINGS.googleFlights.countryCodes);
  });

  it("migrates legacy recommended variants to current Google Flights defaults", () => {
    expect(
      mergeSettings({
        googleFlights: {
          countryCodes: ["US", "CA", "GB", "JP", "TW", "HK", "SG", "KR", "AU", "MY", "VN"],
        },
      }).googleFlights.countryCodes,
    ).toEqual(DEFAULT_SETTINGS.googleFlights.countryCodes);
  });

  it("preserves custom Google Flights country selections", () => {
    expect(
      mergeSettings({
        googleFlights: {
          countryCodes: ["US", "CA", "BR"],
        },
      }).googleFlights.countryCodes,
    ).toEqual(["US", "CA", "BR"]);
  });

  it("removes always-shown providers from stored provider preferences", () => {
    expect(
      mergeSettings({
        hiddenProviderIds: ["where-to-credit", "google-flights", "kayak"],
        preferredProviderIds: ["where-to-credit", "google-flights", "momondo"],
      }),
    ).toMatchObject({
      hiddenProviderIds: ["kayak"],
      preferredProviderIds: ["momondo"],
    });
  });
});
