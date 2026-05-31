import {
  AIRPORTS,
  airportAreaFromSearchValue,
  airportAreaSearchValue,
  airportCodes,
  countryCodeFromSearchValue,
  countrySearchValue,
  filterAirports,
  parseAirportCodes,
  uniqueAirportRegions,
} from "./airports";
import airportData from "./data/airports.json";
import { DEFAULT_SETTINGS } from "./storage";

describe("airport helper", () => {
  it("filters airport codes by continent, country, and exclusions", () => {
    const filters = {
      ...DEFAULT_SETTINGS.airportHelper,
      continent: "North America",
      countries: ["US"],
      exclusions: ["JFK"],
    };

    const codes = airportCodes(filters);

    expect(codes).toContain("DFW");
    expect(codes).toContain("LAX");
    expect(codes).not.toContain("JFK");
    expect(codes).not.toContain("LHR");
  });

  it("uses curated region presets for ITA search airport lists", () => {
    const filters = {
      ...DEFAULT_SETTINGS.airportHelper,
      region: "tokyo",
    };

    expect(airportCodes(filters)).toEqual(["HND", "NRT"]);
    expect(uniqueAirportRegions().map((region) => region.id)).toContain("tokyo");
  });

  it("uses US state region presets for broader airport searches", () => {
    const codes = airportCodes({ ...DEFAULT_SETTINGS.airportHelper, region: "us-ca" });

    expect(codes).toEqual(expect.arrayContaining(["LAX", "SFO", "SAN", "SMF"]));
    expect(codes).not.toContain("JFK");
    expect(uniqueAirportRegions().map((region) => region.id)).toContain("us-ca");
  });

  it("excludes airport codes that ITA Matrix does not resolve", () => {
    const unsupportedCodes = new Set(
      (airportData as { excluded_unsupported_ita_matrix_codes?: string[] }).excluded_unsupported_ita_matrix_codes || [],
    );
    const supportedCodes = new Set(AIRPORTS.map((airport) => airport.code));

    expect(unsupportedCodes.size).toBeGreaterThan(0);
    expect([...unsupportedCodes].some((code) => supportedCodes.has(code))).toBe(false);
  });

  it("returns full airport records for matching filters", () => {
    const airports = filterAirports({ ...DEFAULT_SETTINGS.airportHelper, countries: ["JP"] });

    expect(airports.map((airport) => airport.code)).toEqual(expect.arrayContaining(["HND", "NRT"]));
    expect(airports.every((airport) => airport.country === "JP")).toBe(true);
  });

  it("parses user-entered airport exclusions", () => {
    expect(parseAirportCodes("jfk, lga;ewr")).toEqual(["EWR", "JFK", "LGA"]);
  });

  it("maps searchable country labels back to airport filter country codes", () => {
    expect(countrySearchValue("US")).toBe("United States (US)");
    expect(countryCodeFromSearchValue("United States (US)")).toBe("US");
    expect(countryCodeFromSearchValue("Japan")).toBe("JP");
    expect(countryCodeFromSearchValue("XX")).toBe("");
  });

  it("maps universal airport area search values to one active filter scope", () => {
    expect(airportAreaFromSearchValue("Tokyo Area (region)")).toEqual({
      region: "tokyo",
      continent: "",
      countries: [],
    });
    expect(airportAreaFromSearchValue("North America (continent)")).toEqual({
      region: "",
      continent: "North America",
      countries: [],
    });
    expect(airportAreaFromSearchValue("Japan (JP)")).toEqual({
      region: "",
      continent: "",
      countries: ["JP"],
    });
    expect(airportAreaFromSearchValue("jap")).toEqual({
      region: "",
      continent: "",
      countries: ["JP"],
    });
    expect(airportAreaFromSearchValue("")).toEqual({
      region: "",
      continent: "",
      countries: [],
    });
  });

  it("formats the active airport area filter for search inputs", () => {
    expect(airportAreaSearchValue({ ...DEFAULT_SETTINGS.airportHelper, region: "tokyo" })).toBe("Tokyo Area (region)");
    expect(airportAreaSearchValue({ ...DEFAULT_SETTINGS.airportHelper, continent: "Asia" })).toBe("Asia (continent)");
    expect(airportAreaSearchValue({ ...DEFAULT_SETTINGS.airportHelper, countries: ["JP"] })).toBe("Japan (JP)");
  });

  it("falls back to country codes when Intl.DisplayNames labels are unavailable", () => {
    expect(countrySearchValue("XX")).toBe("XX (XX)");
  });
});
