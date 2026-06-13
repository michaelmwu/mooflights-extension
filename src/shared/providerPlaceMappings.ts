export type SearchProvider = "googleFlights" | "skyscanner" | "kayak" | "momondo";

export type ProviderPlaceCode = {
  code: string;
  airportFallback?: boolean;
};

type ProviderPlaceMapping = {
  label: string;
  codes: Partial<Record<SearchProvider, ProviderPlaceCode>>;
};

const PROVIDER_PLACE_MAPPINGS: ProviderPlaceMapping[] = [
  place("Tokyo", { googleFlights: "/m/07dfk", skyscanner: "TYOA" }),
  place("London", { googleFlights: "/m/04jpl", skyscanner: "LOND" }),
  place("New York City", { googleFlights: "/m/02_286", skyscanner: "NYCA", kayak: "NYC" }),
  place("Paris", { googleFlights: "/m/05qtj", skyscanner: "PARI" }),
  place("Los Angeles", { googleFlights: "/m/030qb3t", skyscanner: "LAXA" }),
  place("San Diego", { googleFlights: "/m/071vr", skyscanner: "SANA" }),
  place("Sao Paulo", { googleFlights: "/m/022pfm", skyscanner: "SAOA" }),
  place("Washington DC", { googleFlights: "/m/0rh6k", skyscanner: "WASA", kayak: "WAS" }),
  place("Chicago", { googleFlights: "/m/01_d4", skyscanner: "CHIA" }),
  place("Milan", { googleFlights: "/m/0947l", skyscanner: "MILA" }),
  place("Rome", { googleFlights: "/m/06c62", skyscanner: "ROME" }),
  place("Beijing", { googleFlights: "/m/01914", skyscanner: "BJSA" }),
  place("Bangkok", { googleFlights: "/m/0fn2g", skyscanner: "BKKT" }),
  place("Seoul", { googleFlights: "/m/0hsqf", skyscanner: "SELA", kayak: "SEL" }),
  place("Shanghai", { googleFlights: "/m/06wjf", skyscanner: "CSHA" }),
  place("Osaka", { googleFlights: "/m/0dqyw", skyscanner: "OSAA" }),
  place("Dubai", { googleFlights: "/m/01f08r", skyscanner: "DXBA" }),
  place("Istanbul", { googleFlights: "/m/09949m", skyscanner: "ISTA" }),
  place("Buenos Aires", { googleFlights: "/m/01ly5m", skyscanner: "BUEA" }),
  place("San Jose", { googleFlights: "/m/0f04v", skyscanner: "SJCA" }),
  place("Dallas", { googleFlights: "/m/0f2rq", skyscanner: "DFWA" }),
  place("Houston", { googleFlights: "/m/03l2n", skyscanner: "HOUA" }),
  place("Miami", { googleFlights: "/m/0f2v0", skyscanner: "MIAA" }),
  place("Toronto", { googleFlights: "/m/0h7h6", skyscanner: "YTOA" }),
  place("Montreal", { googleFlights: "/m/052p7", skyscanner: "YMQA" }),
  place("Vancouver", { googleFlights: "/m/080h2", skyscanner: "YVRA" }),
  place("Mexico City", { googleFlights: "/m/04sqj", skyscanner: "MEXA" }),
  place("Stockholm", { googleFlights: "/m/06mxs", skyscanner: "STOC" }),
  place("Oslo", { googleFlights: "/m/05l64", skyscanner: "OSLO" }),
  place("Rio de Janeiro", { googleFlights: "/m/06gmr", skyscanner: "RIOA" }),
  place("Colombo", { googleFlights: "/m/0fn7r", skyscanner: "CMBA" }),
  place("Moscow", { googleFlights: "/m/04swd", skyscanner: "MOSC" }),
  place("Kuala Lumpur", { googleFlights: "/m/049d1", skyscanner: "KULM" }),
  place("Jakarta", { googleFlights: "/m/044rv", skyscanner: "CGKI" }),
  place("Melbourne", { googleFlights: "/m/0chgzm", skyscanner: "MELA" }),
  place("Taipei", { googleFlights: "/m/0ftkx", skyscanner: "TPET" }),
  place("Brussels", { googleFlights: "/m/0177z", skyscanner: "BRUS" }),
  place("Frankfurt", { googleFlights: "/m/02z0j", skyscanner: "FRAN" }),
  place("Amsterdam", { googleFlights: "/m/0k3p", skyscanner: fallback("AMS") }),
  place("Athens", { googleFlights: "/m/0n2z", skyscanner: fallback("ATH") }),
  place("Auckland", { googleFlights: "/m/012ts", skyscanner: fallback("AKL") }),
  place("Bengaluru", { googleFlights: "/m/09c17", skyscanner: fallback("BLR") }),
  place("Boston", { googleFlights: "/m/01cx_", skyscanner: fallback("BOS") }),
  place("Brisbane", { googleFlights: "/m/01b8jj", skyscanner: fallback("BNE") }),
  place("Cairo", { googleFlights: "/m/01w2v", skyscanner: fallback("CAI") }),
  place("Cape Town", { googleFlights: "/m/01yj2", skyscanner: fallback("CPT") }),
  place("Casablanca", { googleFlights: "/m/022b_", skyscanner: fallback("CMN") }),
  place("Copenhagen", { googleFlights: "/m/01lfy", skyscanner: fallback("CPH") }),
  place("Delhi", { googleFlights: "/m/0dlv0", skyscanner: fallback("DEL") }),
  place("Doha", { googleFlights: "/m/0f2yw", skyscanner: fallback("DOH") }),
  place("Dublin", { googleFlights: "/m/02cft", skyscanner: fallback("DUB") }),
  place("Hanoi", { googleFlights: "/m/0fnff", skyscanner: fallback("HAN") }),
  place("Helsinki", { googleFlights: "/m/03khn", skyscanner: fallback("HEL") }),
  place("Ho Chi Minh City", { googleFlights: "/m/0hn4h", skyscanner: fallback("SGN") }),
  place("Hong Kong", { googleFlights: "/m/03h64", skyscanner: fallback("HKG") }),
  place("Johannesburg", { googleFlights: "/m/0g284", skyscanner: fallback("JNB") }),
  place("Lisbon", { googleFlights: "/m/04llb", skyscanner: fallback("LIS") }),
  place("Manila", { googleFlights: "/m/0195pd", skyscanner: fallback("MNL") }),
  place("Mumbai", { googleFlights: "/m/04vmp", skyscanner: fallback("BOM") }),
  place("Munich", { googleFlights: "/m/02h6_6p", skyscanner: fallback("MUC") }),
  place("Prague", { googleFlights: "/m/05ywg", skyscanner: fallback("PRG") }),
  place("San Francisco", { googleFlights: "/m/0d6lp", skyscanner: fallback("SFO") }),
  place("Seattle", { googleFlights: "/m/0d9jr", skyscanner: fallback("SEA") }),
  place("Singapore", { googleFlights: "/m/06t2t", skyscanner: fallback("SIN") }),
  place("Sydney", { googleFlights: "/m/06y57", skyscanner: fallback("SYD") }),
  place("Tel Aviv", { googleFlights: "/m/07qzv", skyscanner: fallback("TLV") }),
  place("Vienna", { googleFlights: "/m/0fhp9", skyscanner: fallback("VIE") }),
  place("Zurich", { googleFlights: "/m/08966", skyscanner: fallback("ZRH") }),
  place("Berlin", { googleFlights: "/m/0156q", skyscanner: fallback("BER") }),
  place("Barcelona", { googleFlights: "/m/01f62", skyscanner: fallback("BCN") }),
  place("Madrid", { googleFlights: "/m/056_y", skyscanner: fallback("MAD") }),
  place("San Francisco Bay Area", { kayak: "2243fr" }),
];

const GOOGLE_FLIGHTS_PLACE_INDEX = providerPlaceIndex("googleFlights");
const SKYSCANNER_TO_GOOGLE_FLIGHTS_SEARCH_CODE: Record<string, string> = {
  BJSA: "BJS",
  BKKT: "BKK",
  BRUS: "BRU",
  BUEA: "BUE",
  CGKI: "CGK",
  CHIA: "CHI",
  CMBA: "CMB",
  CSHA: "SHA",
  DFWA: "DFW",
  DXBA: "DXB",
  FRAN: "FRA",
  HOUA: "HOU",
  MEXA: "MEX",
  ISTA: "IST",
  KULM: "KUL",
  LAXA: "LAX",
  LOND: "LON",
  MELA: "MEL",
  MILA: "MIL",
  MOSC: "MOW",
  MIAA: "MIA",
  NYCA: "NYC",
  OSAA: "OSA",
  OSLO: "OSL",
  PARI: "PAR",
  RIOA: "RIO",
  ROME: "ROM",
  SANA: "SAN",
  SAOA: "SAO",
  SELA: "SEL",
  SJCA: "SJC",
  STOC: "STO",
  TPET: "TPE",
  TYOA: "TYO",
  WASA: "WAS",
  YMQA: "YMQ",
  YTOA: "YTO",
  YVRA: "YVR",
};

export function providerPlaceCode(
  code: string,
  fromProvider: SearchProvider,
  toProvider: SearchProvider,
): string | undefined {
  return providerPlaceCodeWithMetadata(code, fromProvider, toProvider)?.code;
}

export function providerPlaceCodeWithMetadata(
  code: string,
  fromProvider: SearchProvider,
  toProvider: SearchProvider,
): ProviderPlaceCode | undefined {
  const mapping = providerPlaceIndex(fromProvider).get(normalizeProviderCode(code));
  return mapping?.codes[toProvider];
}

export function googleFlightsPlaceToSkyscannerCode(code: string): ProviderPlaceCode | undefined {
  return GOOGLE_FLIGHTS_PLACE_INDEX.get(normalizeProviderCode(code))?.codes.skyscanner;
}

export function skyscannerPlaceToGoogleFlightsCode(code: string): string | undefined {
  return SKYSCANNER_TO_GOOGLE_FLIGHTS_SEARCH_CODE[normalizeProviderCode(code)];
}

function place(
  label: string,
  codes: Partial<Record<SearchProvider, string | ProviderPlaceCode>>,
): ProviderPlaceMapping {
  return {
    label,
    codes: Object.fromEntries(
      Object.entries(codes).map(([provider, value]) => [provider, typeof value === "string" ? { code: value } : value]),
    ) as Partial<Record<SearchProvider, ProviderPlaceCode>>,
  };
}

function fallback(code: string): ProviderPlaceCode {
  return { code, airportFallback: true };
}

function providerPlaceIndex(provider: SearchProvider): Map<string, ProviderPlaceMapping> {
  const index = new Map<string, ProviderPlaceMapping>();
  for (const mapping of PROVIDER_PLACE_MAPPINGS) {
    const code = mapping.codes[provider]?.code;
    if (code) index.set(normalizeProviderCode(code), mapping);
  }
  return index;
}

function normalizeProviderCode(code: string): string {
  return code.trim().toUpperCase();
}
