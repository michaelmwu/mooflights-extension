import mileageCarriers from "./data/mileage-carriers.json";

const MILEAGE_CARRIERS = mileageCarriers as Record<string, string>;

export function mileageCarrierName(carrier: string): string | undefined {
  return MILEAGE_CARRIERS[carrier.trim().toUpperCase()];
}
