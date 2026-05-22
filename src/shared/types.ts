export type TripType = "one-way" | "round-trip" | "multi-city";

export type Cabin = "economy" | "premium-economy" | "business" | "first" | "unknown";

export type ItinerarySegment = {
  origin: string;
  destination: string;
  distance?: number;
  carrier: string;
  carrierName?: string;
  flightNumber?: string;
  bookingClass?: string;
  fareBasis?: string;
  fareCarrier?: string;
  duration?: number;
  cabin: Cabin;
  departure?: string;
  arrival?: string;
};

export type ItinerarySlice = {
  origin: string;
  destination: string;
  departureDate?: string;
  arrivalDate?: string;
  segments: ItinerarySegment[];
};

export type NormalizedItinerary = {
  source: "ita-matrix";
  capturedAt: string;
  tripType: TripType;
  currency?: string;
  totalPrice?: number;
  totalDistance?: number;
  passengerCount?: number;
  carriers: string[];
  fareBases: string[];
  slices: ItinerarySlice[];
};

export type LinkCategory = "miles" | "airline" | "ota" | "meta" | "utility";

export type LinkProvider = {
  id: string;
  label: string;
  category: LinkCategory;
  reliabilityScore: number;
  knownIssues?: string;
  supportedTripTypes: TripType[];
  buildUrl: (itinerary: NormalizedItinerary) => string;
};

export type RankedProviderLink = {
  provider: LinkProvider;
  url: string;
  rankScore: number;
  confidence: "high" | "medium" | "low";
};

export type ExtensionSettings = {
  hiddenProviderIds: string[];
  preferredProviderIds: string[];
  affiliateOptOut: boolean;
  debugMode: boolean;
  airportHelper: {
    continent: string;
    countries: string[];
    alliance: string;
    airlines: string[];
    exclusions: string[];
  };
  backend: {
    enabled: boolean;
    baseUrl: string;
  };
};

export type Airport = {
  code: string;
  name: string;
  city: string;
  country: string;
  continent: string;
  alliance: string[];
  airlines: string[];
};

export type AirportFilters = ExtensionSettings["airportHelper"];

export type RemoteProviderMetadata = {
  providerId: string;
  reliabilityScore?: number;
  knownIssues?: string;
  disabled?: boolean;
};
