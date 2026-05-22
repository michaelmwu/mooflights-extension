import { airportDistanceMiles } from "./airportCoordinates";

describe("airport coordinate distances", () => {
  it("calculates symmetric great-circle distances from the compact snapshot", () => {
    expect(Math.round(airportDistanceMiles("DPS", "NRT") || 0)).toBe(3487);
    expect(Math.round(airportDistanceMiles("NRT", "DPS") || 0)).toBe(3487);
  });

  it("returns undefined when a coordinate is missing", () => {
    expect(airportDistanceMiles("XXX", "NRT")).toBeUndefined();
  });
});
