import { buildWhereToCreditUrl } from "./itinerary";
import type {
  ExtensionSettings,
  LinkProvider,
  NormalizedItinerary,
  RankedProviderLink,
  RemoteProviderMetadata,
} from "./types";

export const LOCAL_PROVIDERS: LinkProvider[] = [
  {
    id: "where-to-credit",
    label: "Where to Credit",
    category: "miles",
    reliabilityScore: 98,
    supportedTripTypes: ["one-way", "round-trip", "multi-city"],
    buildUrl: buildWhereToCreditUrl,
  },
  {
    id: "google-flights",
    label: "Google Flights",
    category: "meta",
    reliabilityScore: 96,
    supportedTripTypes: ["one-way", "round-trip"],
    buildUrl: googleFlightsUrl,
  },
  {
    id: "kayak",
    label: "Kayak",
    category: "meta",
    reliabilityScore: 88,
    supportedTripTypes: ["one-way", "round-trip"],
    buildUrl: kayakUrl,
  },
  {
    id: "ita-copy",
    label: "Copy ITA Summary",
    category: "utility",
    reliabilityScore: 100,
    supportedTripTypes: ["one-way", "round-trip", "multi-city"],
    buildUrl: () => "#copy-summary",
  },
];

export function rankProviderLinks(
  itinerary: NormalizedItinerary,
  settings: ExtensionSettings,
  remoteMetadata: RemoteProviderMetadata[] = [],
): RankedProviderLink[] {
  const metadataById = new Map(remoteMetadata.map((metadata) => [metadata.providerId, metadata]));
  const hidden = new Set(settings.hiddenProviderIds);
  const preferred = new Set(settings.preferredProviderIds);

  return LOCAL_PROVIDERS.map((provider) => {
    const metadata = metadataById.get(provider.id);
    return {
      ...provider,
      reliabilityScore: metadata?.reliabilityScore ?? provider.reliabilityScore,
      knownIssues: metadata?.knownIssues ?? provider.knownIssues,
      disabled: metadata?.disabled ?? false,
    };
  })
    .filter((provider) => !provider.disabled)
    .filter((provider) => !hidden.has(provider.id))
    .filter((provider) => provider.supportedTripTypes.includes(itinerary.tripType))
    .map((provider): RankedProviderLink | null => {
      const url = provider.buildUrl(itinerary);
      if (!url) return null;
      const { disabled: _disabled, ...linkProvider } = provider;
      const preferenceBoost = preferred.has(provider.id) ? 20 : 0;
      const categoryBoost = provider.category === "miles" ? 10 : provider.category === "utility" ? -5 : 0;
      const rankScore = provider.reliabilityScore + preferenceBoost + categoryBoost;
      return {
        provider: linkProvider,
        url,
        rankScore,
        confidence: confidence(provider.reliabilityScore),
      };
    })
    .filter((link): link is RankedProviderLink => Boolean(link))
    .sort((a, b) => b.rankScore - a.rankScore || a.provider.label.localeCompare(b.provider.label));
}

export function summarizeItinerary(itinerary: NormalizedItinerary): string {
  return itinerary.slices
    .map((slice) =>
      slice.segments
        .map((segment) => {
          const flight = [segment.carrier, segment.flightNumber].filter(Boolean).join("");
          const booking = segment.bookingClass ? ` ${segment.bookingClass}` : "";
          return `${segment.origin}-${segment.destination} ${flight}${booking}`.trim();
        })
        .join(" / "),
    )
    .join(" // ");
}

function confidence(score: number): RankedProviderLink["confidence"] {
  if (score >= 85) return "high";
  if (score >= 70) return "medium";
  return "low";
}

function googleFlightsUrl(itinerary: NormalizedItinerary): string {
  const firstSlice = itinerary.slices[0];
  const lastSlice = itinerary.slices.at(-1);
  const params = new URLSearchParams();
  params.set("utm_source", "mu-travel-extension");
  if (firstSlice?.origin) params.set("origin", firstSlice.origin);
  if (firstSlice?.destination) params.set("destination", firstSlice.destination);
  if (firstSlice?.departureDate) params.set("depart", firstSlice.departureDate);
  if (itinerary.tripType === "round-trip" && lastSlice?.departureDate) params.set("return", lastSlice.departureDate);
  if (itinerary.passengerCount) params.set("passengers", String(itinerary.passengerCount));
  if (itinerary.carriers.length) params.set("carriers", itinerary.carriers.join(","));
  return `https://www.google.com/travel/flights?${params.toString()}`;
}

function kayakUrl(itinerary: NormalizedItinerary): string {
  const slices = routeSlices(itinerary);
  if (slices.length === 0) return "";
  const cabin = kayakCabin(itinerary);
  const pax = itinerary.passengerCount && itinerary.passengerCount > 1 ? `/${itinerary.passengerCount}adults` : "";
  return `https://www.kayak.com/flights/${slices
    .map((slice) => `${slice.origin}-${slice.destination}/${slice.date}`)
    .join("/")}${pax}/${cabin}`;
}

function routeSlices(itinerary: NormalizedItinerary): Array<{ origin: string; destination: string; date: string }> {
  return itinerary.slices
    .map(routeSlice)
    .filter((slice): slice is { origin: string; destination: string; date: string } => Boolean(slice));
}

function routeSlice(
  slice: NormalizedItinerary["slices"][number],
): { origin: string; destination: string; date: string } | null {
  const origin = slice.origin || slice.segments[0]?.origin;
  const destination = slice.destination || slice.segments.at(-1)?.destination;
  const date = slice.departureDate || slice.segments[0]?.departure?.slice(0, 10);
  if (!origin || !destination || !date) return null;
  return { origin, destination, date };
}

function lowestCabin(itinerary: NormalizedItinerary): string {
  const cabins = itinerary.slices.flatMap((slice) => slice.segments.map((segment) => segment.cabin));
  return cabins.sort((a, b) => cabinRank(a) - cabinRank(b))[0] || "economy";
}

function cabinRank(cabin: string): number {
  const order = ["economy", "premium-economy", "business", "first"];
  const index = order.indexOf(cabin);
  return index === -1 ? order.length : index;
}

function kayakCabin(itinerary: NormalizedItinerary): string {
  const cabin = lowestCabin(itinerary);
  if (cabin === "premium-economy") return "premium";
  if (cabin === "business") return "business";
  if (cabin === "first") return "first";
  return "economy";
}
