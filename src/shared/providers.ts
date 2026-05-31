import { buildValidatedWhereToCreditUrl } from "./mileageEarnings";
import type {
  ExtensionSettings,
  ItinerarySegment,
  LinkProvider,
  NormalizedItinerary,
  RankedProviderLink,
  RemoteProviderMetadata,
} from "./types";

export const PROVIDER_CONFIDENCE_THRESHOLDS = {
  high: 85,
  medium: 70,
} as const;

export const ALWAYS_SHOWN_PROVIDER_IDS = ["where-to-credit", "google-flights"] as const;

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
    supportedTripTypes: ["one-way", "round-trip", "multi-city"],
    buildUrl: kayakUrl,
  },
  {
    id: "momondo",
    label: "Momondo",
    category: "meta",
    reliabilityScore: 82,
    knownIssues: "Kayak-family search link; verify route, date, and fare before booking.",
    supportedTripTypes: ["one-way", "round-trip", "multi-city"],
    buildUrl: momondoUrl,
  },
  {
    id: "expedia",
    label: "Expedia",
    category: "ota",
    reliabilityScore: 78,
    knownIssues: "Search page link; verify price and flight details before booking.",
    supportedTripTypes: ["one-way", "round-trip", "multi-city"],
    buildUrl: expediaSearchUrl,
  },
  {
    id: "travelocity",
    label: "Travelocity",
    category: "ota",
    reliabilityScore: 74,
    knownIssues: "Expedia Group fallback; verify price and flight details before booking.",
    supportedTripTypes: ["one-way", "round-trip", "multi-city"],
    buildUrl: (itinerary) => expediaSearchUrl(itinerary, "www.travelocity.com"),
  },
  {
    id: "orbitz",
    label: "Orbitz",
    category: "ota",
    reliabilityScore: 73,
    knownIssues: "Expedia Group fallback; verify price and flight details before booking.",
    supportedTripTypes: ["one-way", "round-trip", "multi-city"],
    buildUrl: (itinerary) => expediaSearchUrl(itinerary, "www.orbitz.com"),
  },
  {
    id: "cheaptickets",
    label: "CheapTickets",
    category: "ota",
    reliabilityScore: 72,
    knownIssues: "Expedia Group fallback; verify price and flight details before booking.",
    supportedTripTypes: ["one-way", "round-trip", "multi-city"],
    buildUrl: (itinerary) => expediaSearchUrl(itinerary, "www.cheaptickets.com"),
  },
  {
    id: "edreams",
    label: "eDreams",
    category: "ota",
    reliabilityScore: 69,
    knownIssues: "Powertools-style OTA search link; may broaden or reprice the itinerary.",
    supportedTripTypes: ["one-way", "round-trip", "multi-city"],
    buildUrl: (itinerary) => odigeoUrl(itinerary, "www.edreams.com"),
  },
  {
    id: "opodo",
    label: "Opodo",
    category: "ota",
    reliabilityScore: 68,
    knownIssues: "Powertools-style OTA search link; may broaden or reprice the itinerary.",
    supportedTripTypes: ["one-way", "round-trip", "multi-city"],
    buildUrl: (itinerary) => odigeoUrl(itinerary, "www.opodo.com"),
  },
  {
    id: "travellink",
    label: "Travellink",
    category: "ota",
    reliabilityScore: 67,
    knownIssues: "Powertools-style OTA search link; may broaden or reprice the itinerary.",
    supportedTripTypes: ["one-way", "round-trip", "multi-city"],
    buildUrl: (itinerary) => odigeoUrl(itinerary, "www.travellink.com"),
  },
  {
    id: "skyscanner",
    label: "Skyscanner",
    category: "meta",
    reliabilityScore: 66,
    knownIssues: "Older route search format; may fall back to a broader search page.",
    supportedTripTypes: ["one-way", "round-trip", "multi-city"],
    buildUrl: skyscannerUrl,
  },
  {
    id: "priceline",
    label: "Priceline",
    category: "ota",
    reliabilityScore: 62,
    knownIssues: "Search fallback only; exact fare import requires private price-key data.",
    supportedTripTypes: ["one-way", "round-trip", "multi-city"],
    buildUrl: pricelineUrl,
  },
  {
    id: "cheapoair",
    label: "CheapOair",
    category: "ota",
    reliabilityScore: 58,
    knownIssues: "Legacy OTA link; often needs manual verification after opening.",
    supportedTripTypes: ["one-way", "round-trip", "multi-city"],
    buildUrl: cheapOairUrl,
  },
  {
    id: "trip-com",
    label: "Trip.com",
    category: "ota",
    reliabilityScore: 57,
    knownIssues: "Search fallback; omits Trip.com session and shopping tokens.",
    supportedTripTypes: ["one-way", "round-trip"],
    buildUrl: tripComUrl,
  },
  {
    id: "travelgo",
    label: "LY.com / TravelGo",
    category: "ota",
    reliabilityScore: 54,
    knownIssues: "TravelGo search fallback; verify date, cabin, and fare after opening.",
    supportedTripTypes: ["one-way", "round-trip"],
    buildUrl: travelGoUrl,
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
  const alwaysShown = new Set<string>(ALWAYS_SHOWN_PROVIDER_IDS);
  const hidden = new Set(settings.hiddenProviderIds.filter((providerId) => !alwaysShown.has(providerId)));
  const preferred = new Set([...ALWAYS_SHOWN_PROVIDER_IDS, ...settings.preferredProviderIds]);

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
        confidence: providerConfidence(provider.reliabilityScore),
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

export function providerConfidence(score: number): RankedProviderLink["confidence"] {
  if (score >= PROVIDER_CONFIDENCE_THRESHOLDS.high) return "high";
  if (score >= PROVIDER_CONFIDENCE_THRESHOLDS.medium) return "medium";
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

function momondoUrl(itinerary: NormalizedItinerary): string {
  const slices = routeSlices(itinerary);
  if (slices.length === 0) return "";
  const pax = itinerary.passengerCount && itinerary.passengerCount > 1 ? `/${itinerary.passengerCount}adults` : "";
  return `https://www.momondo.com/flight-search/${slices
    .map((slice) => `${slice.origin}-${slice.destination}/${slice.date}`)
    .join("/")}${pax}/${kayakFamilyCabin(itinerary)}`;
}

function skyscannerUrl(itinerary: NormalizedItinerary): string {
  const slices = routeSlices(itinerary);
  if (slices.length === 0) return "";

  const params = new URLSearchParams();
  params.set("adults", String(itinerary.passengerCount || 1));
  params.set("adultsv2", String(itinerary.passengerCount || 1));
  params.set("children", "0");
  params.set("childrenv2", "");
  params.set("infants", "0");
  params.set("cabinclass", skyscannerCabin(itinerary));
  params.set("ref", "day-view");
  params.set("market", "US");

  return `https://www.skyscanner.com/transport/d/${slices
    .map((slice) => `${slice.origin.toLowerCase()}/${slice.date}/${slice.destination.toLowerCase()}`)
    .join("/")}?${params.toString()}#results`;
}

function pricelineUrl(itinerary: NormalizedItinerary): string {
  const slices = routeSlices(itinerary);
  if (slices.length === 0) return "";
  const route = slices.map((slice) => `${slice.origin}-${slice.destination}-${dateCompact(slice.date)}`).join("/");
  const params = new URLSearchParams();
  params.set("adults", String(itinerary.passengerCount || 1));
  params.set("cabin-class", pricelineCabin(itinerary));
  return `https://www.priceline.com/m/fly/search/${route}?${params.toString()}`;
}

function cheapOairUrl(itinerary: NormalizedItinerary): string {
  const slices = itinerary.slices.filter((slice) => slice.segments.length > 0);
  if (slices.length === 0) return "";

  const params = new URLSearchParams({
    tabid: "1832",
    ulang: "en",
    ad: String(itinerary.passengerCount || 1),
    ch: "0",
    sr: "0",
    is: "0",
    il: "0",
    pos: "US",
    tt: cheapOairTripType(itinerary.tripType),
  });
  if (itinerary.totalPrice) params.set("dispr", String(itinerary.totalPrice));

  let segmentNumber = 0;
  for (const [sliceIndex, slice] of slices.entries()) {
    const sliceSegments: number[] = [];
    for (const segment of slice.segments) {
      const departureDate = segment.departure?.slice(0, 10) || slice.departureDate;
      if (!departureDate) continue;
      segmentNumber += 1;
      sliceSegments.push(segmentNumber);
      params.set(`cbn${segmentNumber}`, cheapOairCabin(segment.cabin));
      params.set(`carr${segmentNumber}`, segment.fareCarrier || segment.carrier);
      params.set(`dd${segmentNumber}`, dateCompact(departureDate));
      params.set(`og${segmentNumber}`, segment.origin);
      params.set(`dt${segmentNumber}`, segment.destination);
      if (segment.bookingClass) params.set(`fbc${segmentNumber}`, segment.bookingClass);
      if (segment.flightNumber) params.set(`fnum${segmentNumber}`, segment.flightNumber);
    }
    if (sliceSegments.length > 0) params.set(`Slice${sliceIndex + 1}`, sliceSegments.join(","));
  }

  return segmentNumber > 0 ? `https://www.cheapoair.com/default.aspx?${params.toString()}` : "";
}

function tripComUrl(itinerary: NormalizedItinerary): string {
  const slices = routeSlices(itinerary);
  const slice = slices[0];
  if (!slice) return "";

  const passengerCount = itinerary.passengerCount || 1;
  const cabinClass = tripComCabinClass(itinerary);
  const firstSegment = itinerary.slices[0]?.segments[0];
  const isRoundTrip = itinerary.tripType === "round-trip";
  const params = new URLSearchParams({
    flighttype: isRoundTrip ? "D" : "S",
    dcity: slice.origin,
    acity: slice.destination,
    ddate: slice.date,
    quantity: String(passengerCount),
    childqty: "0",
    babyqty: "0",
    curr: itinerary.currency || "USD",
    class: cabinClass.code,
    channel: "EnglishSite",
    country: "US",
    locale: "en-US",
  });
  if (isRoundTrip && slices[1]?.date) params.set("rdate", slices[1].date);
  if (firstSegment?.bookingClass) params.set("flightclass", firstSegment.bookingClass);
  params.set(
    "criteriatoken",
    [
      `tripType:${isRoundTrip ? "RT" : "OW"}`,
      `cabinClass:${cabinClass.token}`,
      `adult:${passengerCount}`,
      "child:0",
      "infant:0",
      "channel:EnglishSite",
      `currency:${itinerary.currency || "USD"}`,
      `date_1:${slice.date}`,
      `aCity_1:${slice.destination}`,
      `dCity_1:${slice.origin}`,
      ...(isRoundTrip && slices[1]?.date
        ? [`date_2:${slices[1].date}`, `aCity_2:${slice.origin}`, `dCity_2:${slice.destination}`]
        : []),
      "issuer:TRIP",
      "list:true",
    ].join("|"),
  );

  return `https://www.trip.com/flights/showfarefirst/?${params.toString()}`;
}

function travelGoUrl(itinerary: NormalizedItinerary): string {
  const slices = routeSlices(itinerary);
  const slice = slices[0];
  if (!slice) return "";
  const returnDate = itinerary.tripType === "round-trip" ? slices[1]?.date || "" : "";
  const params = new URLSearchParams({
    para: [
      itinerary.tripType === "round-trip" ? "1" : "0",
      slice.origin,
      slice.destination,
      slice.date,
      returnDate,
      travelGoCabin(itinerary),
      String(itinerary.passengerCount || 1),
      "0",
      "0",
    ].join("*"),
    orgAirCode: "",
    DesAirCode: "",
  });
  return `https://www.travelgo.com/en-us/iflight/book1.html?${params.toString()}`;
}

function odigeoUrl(itinerary: NormalizedItinerary, host: string): string {
  const slices = routeSlices(itinerary);
  if (slices.length === 0) return "";

  const deeplink = [
    "type=M",
    ...slices.flatMap((slice, index) => [
      `dep${index}=${slice.date}`,
      `from${index}=${slice.origin}`,
      `to${index}=${slice.destination}`,
    ]),
    `class=${odigeoCabin(itinerary)}`,
    `adults=${itinerary.passengerCount || 1}`,
    "children=0",
    "infants=0",
    "collectionmethod=false",
    "airlinescodes=false",
    "internalSearch=true",
  ].join(";");
  const segmentKeys = itinerary.slices
    .map((slice, index) => {
      const keys = slice.segments
        .map((segment) => `${segment.carrier}${segment.flightNumber || ""}`)
        .filter((key) => key.length > 2);
      return keys.length > 0 ? `segmentKey${index}=0,${keys.join(",")}` : "";
    })
    .filter(Boolean)
    .join("&");
  const searchId = Math.floor(new Date(itinerary.capturedAt).getTime() || Date.now());
  const query = [
    "landingPageType=TEST_AB",
    `searchId=${searchId}`,
    `deeplink=${deeplink}`,
    "fareItineraryKey=0,1A",
    segmentKeys,
    "searchMainProductTypeName=FLIGHT",
  ]
    .filter(Boolean)
    .join("&");

  return `https://${host}/travel/?${query}`;
}

function expediaSearchUrl(itinerary: NormalizedItinerary, host = "www.expedia.com"): string {
  if (itinerary.tripType === "multi-city") return expediaMultiCityDetailsUrl(itinerary, host);

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

  return `https://${host}/Flights-Search?${params.toString()}`;
}

function expediaMultiCityDetailsUrl(itinerary: NormalizedItinerary, host = "www.expedia.com"): string {
  const slices = itinerary.slices.filter((slice) => slice.segments.length > 0);
  if (slices.length === 0) return "";

  const params = new URLSearchParams();
  params.set("action", "dl");
  params.set("trip", "MultipleDestination");
  params.set("cabinClass", expediaCabin(itinerary));
  params.set("adults", String(itinerary.passengerCount || 1));

  for (const [sliceIndex, slice] of slices.entries()) {
    const firstSegment = slice.segments[0];
    const departureDate = slice.departureDate || firstSegment?.departure?.slice(0, 10);
    const origin = slice.origin || firstSegment?.origin;
    const destination = slice.destination || slice.segments.at(-1)?.destination;
    if (!origin || !destination || !departureDate) return "";

    params.set(`legs[${sliceIndex}].departureAirport`, origin);
    params.set(`legs[${sliceIndex}].arrivalAirport`, destination);
    params.set(`legs[${sliceIndex}].departureDate`, departureDate);

    for (const [segmentIndex, segment] of slice.segments.entries()) {
      const segmentDate = segment.departure?.slice(0, 10) || departureDate;
      const segmentValue = [
        segmentDate,
        expediaCabinForSegment(segment),
        segment.origin,
        segment.destination,
        segment.carrier,
        segment.flightNumber,
      ];
      if (segmentValue.some((part) => !part)) continue;
      params.set(`legs[${sliceIndex}].segments[${segmentIndex}]`, segmentValue.join("-").toLowerCase());
    }
  }

  return `https://${host}/Flight-Search-Details?${params.toString()}`;
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

function expediaCabinForSegment(segment: ItinerarySegment): string {
  return expediaDetailsCabinName(segment.cabin);
}

function expediaDetailsCabinName(cabin: string): string {
  if (cabin === "premium-economy") return "premium";
  if (cabin === "business") return "business";
  if (cabin === "first") return "first";
  return "coach";
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

function kayakFamilyCabin(itinerary: NormalizedItinerary): string {
  const cabin = lowestCabin(itinerary);
  if (cabin === "premium-economy") return "premium";
  if (cabin === "business") return "business";
  if (cabin === "first") return "first";
  return "economy";
}

function skyscannerCabin(itinerary: NormalizedItinerary): string {
  const cabin = lowestCabin(itinerary);
  if (cabin === "premium-economy") return "premiumeconomy";
  if (cabin === "business") return "business";
  if (cabin === "first") return "first";
  return "economy";
}

function pricelineCabin(itinerary: NormalizedItinerary): string {
  const cabin = lowestCabin(itinerary);
  if (cabin === "premium-economy") return "PEC";
  if (cabin === "business") return "BUS";
  if (cabin === "first") return "FST";
  return "ECO";
}

function cheapOairCabin(cabin: ItinerarySegment["cabin"]): string {
  if (cabin === "premium-economy") return "PremiumEconomy";
  if (cabin === "business") return "Business";
  if (cabin === "first") return "First";
  return "Economy";
}

function cheapOairTripType(tripType: NormalizedItinerary["tripType"]): string {
  if (tripType === "round-trip") return "RoundTrip";
  if (tripType === "multi-city") return "MultiCity";
  return "OneWay";
}

function tripComCabinClass(itinerary: NormalizedItinerary): { code: string; token: string } {
  const cabin = lowestCabin(itinerary);
  if (cabin === "business") return { code: "C", token: "Business" };
  if (cabin === "first") return { code: "F", token: "First" };
  if (cabin === "premium-economy") return { code: "S", token: "PremiumEconomy" };
  return { code: "Y", token: "Economy" };
}

function travelGoCabin(itinerary: NormalizedItinerary): string {
  const cabin = lowestCabin(itinerary);
  if (cabin === "business" || cabin === "first") return "C";
  return "Y";
}

function odigeoCabin(itinerary: NormalizedItinerary): string {
  const cabin = lowestCabin(itinerary);
  if (cabin === "premium-economy") return "PREMIUM_ECONOMY";
  if (cabin === "business") return "BUSINESS";
  if (cabin === "first") return "FIRST";
  return "TOURIST";
}

function dateCompact(date: string): string {
  return date.replaceAll("-", "");
}
