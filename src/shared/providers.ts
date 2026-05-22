import type {
  ExtensionSettings,
  LinkProvider,
  NormalizedItinerary,
  RankedProviderLink,
  RemoteProviderMetadata,
} from "./types";
import { buildValidatedWhereToCreditUrl } from "./wheretocredit";

export const LOCAL_PROVIDERS: LinkProvider[] = [
  {
    id: "where-to-credit",
    label: "Where to Credit",
    category: "miles",
    reliabilityScore: 98,
    supportedTripTypes: ["one-way", "round-trip", "multi-city"],
    buildUrl: buildValidatedWhereToCreditUrl,
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
    id: "expedia",
    label: "Expedia",
    category: "ota",
    reliabilityScore: 78,
    knownIssues: "Search page link; verify price and flight details before booking.",
    supportedTripTypes: ["one-way", "round-trip"],
    buildUrl: expediaSearchUrl,
  },
];

export function rankProviderLinks(
  itinerary: NormalizedItinerary,
  settings: ExtensionSettings,
  remoteMetadata: RemoteProviderMetadata[] = [],
): RankedProviderLink[] {
  const metadataById = new Map(
    remoteMetadata
      .map(normalizeRemoteProviderMetadata)
      .filter((metadata): metadata is RemoteProviderMetadata => Boolean(metadata))
      .map((metadata) => [metadata.providerId, metadata]),
  );
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
      const categoryBoost = provider.category === "miles" ? 10 : 0;
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

function normalizeRemoteProviderMetadata(metadata: unknown): RemoteProviderMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;
  const rawMetadata = metadata as Record<string, unknown>;
  const providerId = typeof rawMetadata.providerId === "string" ? rawMetadata.providerId : "";
  if (!providerId) return null;

  const normalized: RemoteProviderMetadata = { providerId };
  if (
    typeof rawMetadata.reliabilityScore === "number" &&
    Number.isFinite(rawMetadata.reliabilityScore) &&
    rawMetadata.reliabilityScore >= 0 &&
    rawMetadata.reliabilityScore <= 100
  ) {
    normalized.reliabilityScore = rawMetadata.reliabilityScore;
  }
  if (typeof rawMetadata.knownIssues === "string") normalized.knownIssues = rawMetadata.knownIssues;
  if (typeof rawMetadata.disabled === "boolean") normalized.disabled = rawMetadata.disabled;
  return normalized;
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
  const pax = itinerary.passengerCount && itinerary.passengerCount > 1 ? `/${itinerary.passengerCount}adults` : "";
  return `https://www.kayak.com/flights/${slices
    .map((slice) => `${slice.origin}-${slice.destination}/${slice.date}`)
    .join("/")}${pax}`;
}

function expediaSearchUrl(itinerary: NormalizedItinerary): string {
  const slices = routeSlices(itinerary);
  if (slices.length === 0) return "";

  const params = new URLSearchParams();
  const isRoundTrip = itinerary.tripType === "round-trip" && slices.length >= 2;
  params.set("flight-type", "on");
  params.set("mode", "search");
  params.set("trip", isRoundTrip ? "roundtrip" : "oneway");
  params.set("leg1", expediaLeg(slices[0]));
  params.set("options", `cabinclass:${expediaCabin(itinerary)}`);
  params.set("fromDate", expediaSlashedDate(slices[0].date));
  params.set("d1", expediaLooseDate(slices[0].date));
  params.set("passengers", `adults:${itinerary.passengerCount || 1},infantinlap:N`);

  if (isRoundTrip) {
    params.set("leg2", expediaLeg(slices[1]));
    params.set("toDate", expediaSlashedDate(slices[1].date));
    params.set("d2", expediaLooseDate(slices[1].date));
  }

  return `https://www.expedia.com/Flights-Search?${params.toString()}`;
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

function expediaCabin(itinerary: NormalizedItinerary): string {
  const cabin = lowestCabin(itinerary);
  if (cabin === "premium-economy") return "premium";
  if (cabin === "business") return "business";
  if (cabin === "first") return "first";
  return "economy";
}

function expediaLeg(slice: { origin: string; destination: string; date: string }): string {
  return [
    `from:${slice.origin}`,
    `to:${slice.destination}`,
    `departure:${expediaSlashedDate(slice.date)}TANYT`,
    "fromType:AIRPORT",
    "toType:AIRPORT",
  ].join(",");
}

function expediaSlashedDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}/${year}`;
}

function expediaLooseDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${year}-${Number(month)}-${Number(day)}`;
}
