import { airportCodes, filterAirports, parseAirportCodes, uniqueAirportRegions } from "./airports";
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

  it("uses curated region presets for ITA search insertion", () => {
    const filters = {
      ...DEFAULT_SETTINGS.airportHelper,
      region: "tokyo",
    };

    expect(airportCodes(filters)).toEqual(["HND", "NRT"]);
    expect(uniqueAirportRegions().map((region) => region.id)).toContain("tokyo");
  });

  it("returns full airport records for matching filters", () => {
    const airports = filterAirports({ ...DEFAULT_SETTINGS.airportHelper, countries: ["JP"] });

    expect(airports.map((airport) => airport.code)).toEqual(expect.arrayContaining(["HND", "NRT"]));
    expect(airports.every((airport) => airport.country === "JP")).toBe(true);
  });

  it("parses user-entered airport exclusions", () => {
    expect(parseAirportCodes("jfk, lga;ewr")).toEqual(["EWR", "JFK", "LGA"]);
  });
});
