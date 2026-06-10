import { googleFlightsCountryUrl, isGoogleFlightsPanelPageUrl } from "./googleFlightsBooking";
import { isSkyscannerFlightsPageUrl, skyscannerCountryUrl } from "./skyscannerBooking";

export type GoogleFlightsBookingOption = {
  provider: string;
  price: number;
  currency: string;
  priceText: string;
  isDirect: boolean;
  bookingUrl?: string;
};

export type GoogleFlightsCountryResult = {
  country: string;
  url: string;
  options: GoogleFlightsBookingOption[];
  cheapest?: GoogleFlightsBookingOption;
  direct?: GoogleFlightsBookingOption;
  status: "ready" | "sparse" | "empty" | "error";
  refreshed?: boolean;
  error?: string;
};

export type GoogleFlightsSearchResult = {
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

export type GoogleFlightsSearchCountryResult = {
  country: string;
  url: string;
  results: GoogleFlightsSearchResult[];
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
