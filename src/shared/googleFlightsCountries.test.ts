import { describe, expect, it } from "vitest";
import { DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES } from "./googleFlightsBooking";
import {
  allGoogleFlightsCountryCodes,
  filterAvailableGoogleFlightsCountryCodes,
  isAllGoogleFlightsCountryCodes,
} from "./googleFlightsCountries";

describe("google flights countries", () => {
  it("detects the all useful countries preset by set equality", () => {
    const allCountries = allGoogleFlightsCountryCodes();

    expect(isAllGoogleFlightsCountryCodes(allCountries)).toBe(true);
    expect(isAllGoogleFlightsCountryCodes([...allCountries].reverse())).toBe(true);
    expect(isAllGoogleFlightsCountryCodes(DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES)).toBe(false);
    expect(isAllGoogleFlightsCountryCodes([...allCountries, "US"])).toBe(true);
    expect(isAllGoogleFlightsCountryCodes(allCountries.filter((code) => code !== "US"))).toBe(false);
  });

  it("filters pasted countries to the Google Flights available set", () => {
    expect(filterAvailableGoogleFlightsCountryCodes(["us", "AQ", "JP", "XX", "US"])).toEqual(["US", "JP"]);
  });
});
