import { googleFlightsCountryUrl, isGoogleFlightsPanelPageUrl } from "./googleFlightsBooking";
import { isSkyscannerFlightsPageUrl, skyscannerCountryUrl } from "./skyscannerBooking";

export type BookingOption = {
  provider: string;
  price: number;
  currency: string;
  priceText: string;
  isDirect: boolean;
  bookingUrl?: string;
};

export type CountryResult = {
  country: string;
  url: string;
  options: BookingOption[];
  cheapest?: BookingOption;
  direct?: BookingOption;
  status: "ready" | "sparse" | "empty" | "error";
  refreshed?: boolean;
  error?: string;
};

export type SearchResult = {
  rowKey: string;
  matchKey: string;
  rowIndex: number;
  price: number;
  currency: string;
  priceText: string;
  summaryText: string;
  carrierText?: string;
  timeText?: string;
  durationText?: string;
  stopsText?: string;
  itineraryKey?: string;
  matchConfidence: "high" | "medium";
};

export type SearchCountryResult = {
  country: string;
  url: string;
  results: SearchResult[];
  status: "ready" | "empty" | "error";
  error?: string;
};

export function countryComparisonUrl(baseUrl: string, country: string, currency?: string): string {
  return isSkyscannerFlightsPageUrl(baseUrl)
    ? skyscannerCountryUrl(baseUrl, country, currency)
    : googleFlightsCountryUrl(baseUrl, country, currency);
}

export function isCountryComparisonPageUrl(url: string): boolean {
  return isSkyscannerFlightsPageUrl(url) || isGoogleFlightsPanelPageUrl(url);
}
