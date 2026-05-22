import { airportCodes, filterAirports, parseAirportCodes } from "./airports";
import { DEFAULT_SETTINGS } from "./storage";

describe("airport helper", () => {
  it("filters airport codes by continent, alliance, airline, and exclusions", () => {
    const filters = {
      ...DEFAULT_SETTINGS.airportHelper,
      continent: "North America",
      alliance: "Oneworld",
      airlines: ["American Airlines"],
      exclusions: ["JFK"],
    };

    const codes = airportCodes(filters);

    expect(codes).toContain("DFW");
    expect(codes).toContain("LAX");
    expect(codes).not.toContain("JFK");
    expect(codes).not.toContain("LHR");
  });

  it("returns full airport records for matching filters", () => {
    const airports = filterAirports({ ...DEFAULT_SETTINGS.airportHelper, countries: ["Japan"] });

    expect(airports.map((airport) => airport.code)).toEqual(["HND", "NRT"]);
  });

  it("parses user-entered airport exclusions", () => {
    expect(parseAirportCodes("jfk, lga;ewr")).toEqual(["EWR", "JFK", "LGA"]);
  });
});
