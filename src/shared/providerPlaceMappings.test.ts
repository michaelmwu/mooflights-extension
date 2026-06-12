import { describe, expect, it } from "vitest";
import {
  googleFlightsPlaceToSkyscannerCode,
  providerPlaceCode,
  providerPlaceCodeWithMetadata,
  skyscannerPlaceToGoogleFlightsCode,
} from "./providerPlaceMappings";

describe("providerPlaceMappings", () => {
  it("maps Google city place IDs to Skyscanner city/all-airport place codes", () => {
    expect(googleFlightsPlaceToSkyscannerCode("/m/080h2")?.code).toBe("YVRA");
    expect(googleFlightsPlaceToSkyscannerCode("/m/02_286")?.code).toBe("NYCA");
    expect(googleFlightsPlaceToSkyscannerCode("/m/06wjf")?.code).toBe("CSHA");
    expect(googleFlightsPlaceToSkyscannerCode("/m/0ftkx")?.code).toBe("TPET");
  });

  it("does not include protobuf field markers in Google place IDs", () => {
    expect(googleFlightsPlaceToSkyscannerCode("/m/0ftkxr")).toBeUndefined();
  });

  it("tracks airport fallbacks separately from provider city mappings", () => {
    expect(providerPlaceCodeWithMetadata("/m/0156q", "googleFlights", "skyscanner")).toEqual({
      code: "BER",
      airportFallback: true,
    });
    expect(providerPlaceCodeWithMetadata("/m/0k3p", "googleFlights", "skyscanner")).toEqual({
      code: "AMS",
      airportFallback: true,
    });
  });

  it("maps Skyscanner city/all-airport codes back to Google Flights city codes", () => {
    expect(skyscannerPlaceToGoogleFlightsCode("YVRA")).toBe("YVR");
    expect(skyscannerPlaceToGoogleFlightsCode("NYCA")).toBe("NYC");
  });

  it("can hold future Kayak place codes without scraping Kayak", () => {
    expect(providerPlaceCode("NYCA", "skyscanner", "kayak")).toBe("NYC");
    expect(providerPlaceCode("SELA", "skyscanner", "kayak")).toBe("SEL");
    expect(providerPlaceCode("WASA", "skyscanner", "kayak")).toBe("WAS");
    expect(providerPlaceCode("2243fr", "kayak", "skyscanner")).toBeUndefined();
  });
});
