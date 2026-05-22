import { airportCoordinate } from "./airports";

const EARTH_RADIUS_MI = 3958.7613;

export function airportDistanceMiles(origin: string, destination: string): number | undefined {
  const from = airportCoordinate(origin);
  const to = airportCoordinate(destination);
  if (!from || !to) return undefined;

  const fromLat = degreesToRadians(from.latitude);
  const toLat = degreesToRadians(to.latitude);
  const deltaLat = degreesToRadians(to.latitude - from.latitude);
  const deltaLon = degreesToRadians(to.longitude - from.longitude);
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLon / 2) ** 2;
  const centralAngle = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_MI * centralAngle;
}

function degreesToRadians(value: number): number {
  return (value * Math.PI) / 180;
}
