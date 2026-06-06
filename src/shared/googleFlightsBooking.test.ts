import {
  DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES,
  googleFlightsCountryUrl,
  googleFlightsPanelPageKey,
  inferGoogleFlightsCurrency,
  normalizeGoogleFlightsCountryCodes,
  normalizeGoogleFlightsCurrency,
  parseGoogleFlightsBookingOptions,
  parseGoogleFlightsCountryInput,
  parseGoogleFlightsMatrixSearch,
} from "./googleFlightsBooking";
import { allGoogleFlightsCountryCodes, googleFlightsAvailableCountryOptions } from "./googleFlightsCountries";

describe("Google Flights booking option parser", () => {
  it("parses direct and OTA booking options from Google Flights markup", () => {
    document.body.innerHTML = `
      <div class="gN1nAc">
        <div class="ogfYpf">Book with STARLUX Airlines<div class="EA71Tc">Airline</div></div>
        <span aria-label="155 US dollars" role="text">$155</span>
      </div>
      <div class="gN1nAc">
        <div class="ogfYpf">Book with Agoda</div>
        <span aria-label="142 US dollars" role="text">$142</span>
      </div>
      <div class="gN1nAc">
        <div class="ogfYpf">Book with Mytrip</div>
        <span role="text">$140</span>
      </div>
    `;

    const result = parseGoogleFlightsBookingOptions(document, "JP", "https://www.google.com/travel/flights/booking");

    expect(result.status).toBe("ready");
    expect(result.options.map((option) => `${option.provider}:${option.price}`)).toEqual([
      "Mytrip:140",
      "Agoda:142",
      "STARLUX Airlines:155",
    ]);
    expect(result.cheapest?.provider).toBe("Mytrip");
    expect(result.direct).toMatchObject({
      provider: "STARLUX Airlines",
      price: 155,
      isDirect: true,
    });
  });

  it("captures booking links when Google exposes provider anchors", () => {
    document.body.innerHTML = `
      <div class="gN1nAc">
        <a href="/travel/flights/booking/redirect/cheap">
          <div class="ogfYpf">Book with Mytrip</div>
          <span role="text">$140</span>
        </a>
      </div>
      <div class="gN1nAc">
        <div class="ogfYpf">Book with STARLUX Airlines<div class="EA71Tc">Airline</div></div>
        <a href="https://www.google.com/travel/flights/booking/redirect/direct">
          <span aria-label="155 US dollars" role="text">$155</span>
        </a>
      </div>
    `;

    const result = parseGoogleFlightsBookingOptions(document, "JP", "https://www.google.com/travel/flights/booking");

    expect(result.cheapest).toMatchObject({
      provider: "Mytrip",
      bookingUrl: "https://www.google.com/travel/flights/booking/redirect/cheap",
    });
    expect(result.direct).toMatchObject({
      provider: "STARLUX Airlines",
      bookingUrl: "https://www.google.com/travel/flights/booking/redirect/direct",
    });
  });

  it("does not surface non-http booking links", () => {
    document.body.innerHTML = `
      <div class="gN1nAc">
        <a href="javascript:alert('x')">
          <div class="ogfYpf">Book with Mytrip</div>
          <span role="text">$140</span>
        </a>
      </div>
    `;

    const result = parseGoogleFlightsBookingOptions(document, "JP", "https://www.google.com/travel/flights/booking");

    expect(result.cheapest).toMatchObject({
      provider: "Mytrip",
    });
    expect(result.cheapest?.bookingUrl).toBeUndefined();
  });

  it("changes only the Google Flights country parameter", () => {
    const url = googleFlightsCountryUrl("https://www.google.com/travel/flights/booking?tfs=abc&curr=USD&gl=TW", "MY");

    expect(url).toBe("https://www.google.com/travel/flights/booking?tfs=abc&curr=USD&gl=MY");
  });

  it("adds a default currency when building comparable country URLs", () => {
    const url = googleFlightsCountryUrl("https://www.google.com/travel/flights/booking?tfs=abc&gl=TW", "MY");

    expect(url).toBe("https://www.google.com/travel/flights/booking?tfs=abc&gl=MY&curr=USD");
  });

  it("uses inferred currency when building comparable country URLs without curr", () => {
    const url = googleFlightsCountryUrl("https://www.google.com/travel/flights/booking?tfs=abc&gl=TW", "MY", "HKD");

    expect(url).toBe("https://www.google.com/travel/flights/booking?tfs=abc&gl=MY&curr=HKD");
  });

  it("keeps explicit URL currency ahead of inferred currency", () => {
    const url = googleFlightsCountryUrl(
      "https://www.google.com/travel/flights/booking?tfs=abc&curr=TWD&gl=TW",
      "MY",
      "HKD",
    );

    expect(url).toBe("https://www.google.com/travel/flights/booking?tfs=abc&curr=TWD&gl=MY");
  });

  it("normalizes invalid URL currency before building comparable country URLs", () => {
    const url = googleFlightsCountryUrl(
      "https://www.google.com/travel/flights/booking?tfs=abc&curr=&gl=TW",
      "MY",
      "hkd",
    );

    expect(url).toBe("https://www.google.com/travel/flights/booking?tfs=abc&curr=HKD&gl=MY");
  });

  it("recognizes ITA Matrix handoff itinerary pages as Google Flights panel pages", () => {
    const url =
      "https://www.google.com/travel/flights?tfs=CDIQAho_EgoyMDI2LTA4LTI3Ih8KA0hLRxIKMjAyNi0wOC0yNxoDVFBFKgJKWDIDMjM2agcIARIDSEtHcgcIARIDVFBFQAFIAZgBAg&source=ita_matrix";

    expect(googleFlightsPanelPageKey(url, "HK", true)).toBe(
      "/travel/flights?tfs=CDIQAho_EgoyMDI2LTA4LTI3Ih8KA0hLRxIKMjAyNi0wOC0yNxoDVFBFKgJKWDIDMjM2agcIARIDSEtHcgcIARIDVFBFQAFIAZgBAg&curr=USD&gl=HK",
    );
    expect(parseGoogleFlightsMatrixSearch(url)).toMatchObject({
      tripType: "one-way",
      carriers: ["JX"],
      slices: [
        {
          origin: "HKG",
          destination: "TPE",
          departureDate: "2026-08-27",
          segments: [
            {
              carrier: "JX",
              flightNumber: "236",
            },
          ],
        },
      ],
    });
  });

  it("recognizes ITA Matrix handoff itinerary pages with trailing path segments", () => {
    const url =
      "https://www.google.com/travel/flights/?tfs=CDIQAho_EgoyMDI2LTA4LTI3Ih8KA0hLRxIKMjAyNi0wOC0yNxoDVFBFKgJKWDIDMjM2agcIARIDSEtHcgcIARIDVFBFQAFIAZgBAg&source=ita_matrix&curr=hkd";

    expect(googleFlightsPanelPageKey(url, "HK", true)).toBe(
      "/travel/flights/?tfs=CDIQAho_EgoyMDI2LTA4LTI3Ih8KA0hLRxIKMjAyNi0wOC0yNxoDVFBFKgJKWDIDMjM2agcIARIDSEtHcgcIARIDVFBFQAFIAZgBAg&curr=HKD&gl=HK",
    );
  });

  it("uses inferred currency in Google Flights panel page keys", () => {
    const url = "https://www.google.com/travel/flights/booking?tfs=abc&gl=TW";

    expect(googleFlightsPanelPageKey(url, "TW", true, "HKD")).toBe("/travel/flights/booking?tfs=abc&curr=HKD&gl=TW");
  });

  it("normalizes invalid URL currency in Google Flights panel page keys", () => {
    const url = "https://www.google.com/travel/flights/booking?tfs=abc&curr=&gl=TW";

    expect(googleFlightsPanelPageKey(url, "TW", true, "HKD")).toBe("/travel/flights/booking?tfs=abc&curr=HKD&gl=TW");
  });

  it("infers the visible Google Flights currency from price text", () => {
    document.body.innerHTML = `
      <div>
        <span role="text">HKG to TPE 3 hr 50 min</span>
        <span aria-label="1,230 Hong Kong dollars" role="text">HK$1,230</span>
      </div>
    `;

    expect(inferGoogleFlightsCurrency(document)).toBe("HKD");
  });

  it("does not infer currency from route labels with currency-code airport collisions", () => {
    document.body.innerHTML = `
      <div>
        <span role="text">MAD to JFK 8 hr</span>
        <span role="text">BOB to PPT 5 hr</span>
        <span role="text">AED 1,230</span>
      </div>
    `;

    expect(inferGoogleFlightsCurrency(document)).toBe("AED");
  });

  it("infers trailing currency codes from price-shaped text", () => {
    document.body.innerHTML = `
      <div>
        <span role="text">1,230 VND</span>
      </div>
    `;

    expect(inferGoogleFlightsCurrency(document)).toBe("VND");
  });

  it("does not infer USD from ambiguous dollar prices with unmapped aria currency names", () => {
    document.body.innerHTML = `
      <div>
        <span aria-label="4,000 Mexican pesos" role="text">MX$4,000</span>
      </div>
    `;

    expect(inferGoogleFlightsCurrency(document)).toBe("");
  });

  it("infers Canadian dollars from CA-prefixed dollar prices", () => {
    document.body.innerHTML = `
      <div>
        <span role="text">CA$1,230</span>
      </div>
    `;

    expect(inferGoogleFlightsCurrency(document)).toBe("CAD");
  });

  it("infers New Zealand dollars from NZ-prefixed dollar prices", () => {
    document.body.innerHTML = `
      <div>
        <span role="text">NZ$1,230</span>
      </div>
    `;

    expect(inferGoogleFlightsCurrency(document)).toBe("NZD");
  });

  it("falls back to visible ISO price text when aria currency names are unmapped", () => {
    document.body.innerHTML = `
      <div>
        <span aria-label="155 Swiss francs" role="text">CHF 155</span>
      </div>
    `;

    expect(inferGoogleFlightsCurrency(document)).toBe("CHF");
  });

  it("normalizes Google Flights currency codes", () => {
    expect(normalizeGoogleFlightsCurrency(" hkd ")).toBe("HKD");
    expect(normalizeGoogleFlightsCurrency("AED")).toBe("AED");
    expect(normalizeGoogleFlightsCurrency("vnd")).toBe("VND");
    expect(normalizeGoogleFlightsCurrency("HKG")).toBe("");
    expect(normalizeGoogleFlightsCurrency("TPE")).toBe("");
    expect(normalizeGoogleFlightsCurrency("HK")).toBe("");
    expect(normalizeGoogleFlightsCurrency("123")).toBe("");
  });

  it("parses non-USD booking prices while preserving visible price text", () => {
    document.body.innerHTML = `
      <div class="gN1nAc">
        <div class="ogfYpf">Book with Mytrip</div>
        <span aria-label="140 euros" role="text">€140</span>
      </div>
      <div class="gN1nAc">
        <div class="ogfYpf">Book with Airline JP<div class="EA71Tc">Airline</div></div>
        <span aria-label="21,000 Japanese yen" role="text">¥21,000</span>
      </div>
    `;

    const result = parseGoogleFlightsBookingOptions(document, "JP", "https://www.google.com/travel/flights/booking");

    expect(result.options).toEqual([
      {
        provider: "Mytrip",
        price: 140,
        currency: "EUR",
        priceText: "€140",
        isDirect: false,
      },
      {
        provider: "Airline JP",
        price: 21000,
        currency: "JPY",
        priceText: "¥21,000",
        isDirect: true,
      },
    ]);
  });

  it("keeps localized direct markers and unmapped currency prices", () => {
    document.body.innerHTML = `
      <div class="gN1nAc">
        <div class="ogfYpf">Book with Swiss<div class="EA71Tc">Fluggesellschaft</div></div>
        <span aria-label="155 Swiss francs" role="text">CHF 155</span>
      </div>
      <div class="gN1nAc">
        <div class="ogfYpf">Book with Nordic OTA</div>
        <span aria-label="1,240 Norwegian kroner" role="text">NOK 1,240</span>
      </div>
    `;

    const result = parseGoogleFlightsBookingOptions(document, "CH", "https://www.google.com/travel/flights/booking");

    expect(result.options).toEqual([
      {
        provider: "Swiss",
        price: 155,
        currency: "CHF",
        priceText: "CHF 155",
        isDirect: true,
      },
      {
        provider: "Nordic OTA",
        price: 1240,
        currency: "NOK",
        priceText: "NOK 1,240",
        isDirect: false,
      },
    ]);
  });

  it("treats US$ as USD instead of Singapore dollars", () => {
    document.body.innerHTML = `
      <div class="gN1nAc">
        <div class="ogfYpf">Book with Mytrip</div>
        <span role="text">US$140</span>
      </div>
      <div class="gN1nAc">
        <div class="ogfYpf">Book with Singapore OTA</div>
        <span role="text">S$150</span>
      </div>
    `;

    const result = parseGoogleFlightsBookingOptions(document, "SG", "https://www.google.com/travel/flights/booking");

    expect(result.options.map((option) => `${option.provider}:${option.currency}`)).toEqual([
      "Mytrip:USD",
      "Singapore OTA:SGD",
    ]);
  });

  it("parses prefixed dollar currencies atomically", () => {
    document.body.innerHTML = `
      <div class="gN1nAc">
        <div class="ogfYpf">Book with Canada OTA</div>
        <span role="text">CA$1,230</span>
      </div>
      <div class="gN1nAc">
        <div class="ogfYpf">Book with Australia OTA</div>
        <span role="text">A$1,250</span>
      </div>
      <div class="gN1nAc">
        <div class="ogfYpf">Book with Unknown OTA</div>
        <span role="text">MX$1,200</span>
      </div>
    `;

    const result = parseGoogleFlightsBookingOptions(document, "CA", "https://www.google.com/travel/flights/booking");

    expect(result.options.map((option) => `${option.provider}:${option.currency}`)).toEqual([
      "Unknown OTA:UNKNOWN",
      "Canada OTA:CAD",
      "Australia OTA:AUD",
    ]);
  });

  it("parses localized booking labels and locale-formatted prices", () => {
    document.body.innerHTML = `
      <div class="gN1nAc">
        <div class="ogfYpf">Reservar con Mytrip</div>
        <span aria-label="1.234 euros" role="text">1.234 €</span>
      </div>
      <div class="gN1nAc">
        <div class="ogfYpf">Agoda で予約</div>
        <span aria-label="1.234,56 euros" role="text">1.234,56 €</span>
      </div>
    `;

    const result = parseGoogleFlightsBookingOptions(document, "DE", "https://www.google.com/travel/flights/booking");

    expect(result.options).toEqual([
      {
        provider: "Mytrip",
        price: 1234,
        currency: "EUR",
        priceText: "1.234 €",
        isDirect: false,
      },
      {
        provider: "Agoda",
        price: 1234.56,
        currency: "EUR",
        priceText: "1.234,56 €",
        isDirect: false,
      },
    ]);
  });

  it("normalizes country code defaults for Google Flights comparisons", () => {
    expect(normalizeGoogleFlightsCountryCodes(["us", "JP", "jp", "bad", 123])).toEqual(["US", "JP"]);
    expect(parseGoogleFlightsCountryInput("us, jp MY")).toEqual(["US", "JP", "MY"]);
  });

  it("builds a useful all-country list with recommended countries first", () => {
    const countries = allGoogleFlightsCountryCodes();

    expect(countries.slice(0, DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES.length)).toEqual(
      DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES,
    );
    expect(countries).toContain("FR");
    expect(countries).toContain("BR");
    expect(countries).not.toContain("AQ");
    expect(countries).not.toContain("AF");
    expect(countries).not.toContain("AO");
    expect(countries).not.toContain("CU");
    expect(countries).not.toContain("EU");
    expect(countries).not.toContain("IR");
    expect(countries).not.toContain("UK");
    expect(countries).not.toContain("ZZ");
    expect(countries.length).toBeGreaterThan(DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES.length);
    expect(new Set(countries).size).toBe(countries.length);
  });

  it("keeps the searchable country catalog broader than the useful preset", () => {
    const countries = googleFlightsAvailableCountryOptions();

    expect(countries.map((country) => country.code)).toContain("AF");
    expect(countries.map((country) => country.code)).toContain("AO");
    expect(countries.map((country) => country.code)).not.toContain("AQ");
  });

  it("builds an ITA Matrix search from Google Flights tfs data", () => {
    const result = parseGoogleFlightsMatrixSearch(
      "https://www.google.com/travel/flights/booking?tfs=CBwQAhpOEgoyMDI2LTA2LTAyIh8KA0hLRxIKMjAyNi0wNi0wMhoDVFBFKgJKWDIDMjM0KABACkgTUABYF2oHCAESA0hLR3IMCAMSCC9tLzBmdGt4QAFIAXABggELCP___________wGYAQI&curr=USD&gl=JP",
    );

    expect(result).toMatchObject({
      tripType: "one-way",
      carriers: ["JX"],
      slices: [
        {
          origin: "HKG",
          destination: "TPE",
          departureDate: "2026-06-02",
          segments: [
            {
              origin: "HKG",
              destination: "TPE",
              carrier: "JX",
              flightNumber: "234",
            },
          ],
        },
      ],
    });

    const search = new URL(result?.matrixUrl || "").searchParams.get("search") || "";
    expect(new URL(result?.matrixUrl || "").pathname).toBe("/search");
    expect(new URL(result?.matrixUrl || "").searchParams.get("muTravelAutoOpen")).toBe("1");
    expect(new URL(result?.matrixUrl || "").searchParams.get("muTravelAutoSearch")).toBe("1");
    const decoded = JSON.parse(atob(search));
    expect(decoded).toMatchObject({
      type: "one-way",
      muTravelAutoOpen: "1",
      muTravelAutoSearch: "1",
      slices: [
        {
          origin: ["HKG"],
          dest: ["TPE"],
          routing: "F:JX234",
          dates: {
            departureDate: "2026-06-02",
          },
        },
      ],
      options: {
        cabin: "COACH",
        currency: {
          code: "USD",
        },
      },
    });
  });

  it("preserves Google Flights cabin and currency in ITA Matrix handoff URLs", () => {
    const result = parseGoogleFlightsMatrixSearch(
      "https://www.google.com/travel/flights/booking?tfs=CBwQAhplEgoyMDI2LTA4LTI3Ih8KA0FLTBIKMjAyNi0wOC0yNxoDTkFOKgJGSjIDNDEwIh8KA05BThIKMjAyNi0wOC0yOBoDTlJUKgJGSjIDMzUxagcIARIDQUtMcgwIAxIIL20vMDdkZmsadxIKMjAyNy0wNC0xNCIfCgNOUlQSCjIwMjctMDQtMTRaA05BTioCRkoyAzM1MCIfCgNOQU4SCjIwMjctMDQtMTUaA01FTCoCRkoyAzkzNWoMCAMSCC9tLzA3ZGZrcgcIARIDTUVMcgcIARIDU1lEcgcIARIDQUtMQAFIA3ABggELCP___________wGYAQM&tfu=CnhDalJJY1hKSE5XUjRhWEE0ZEUxQlJEQjJSMEZDUnkwdExTMHRMUzB0TFMxMGJHOXlNMEZCUVVGQlIyOXBNelZaUlVsSllUQkJFZzFHU2pNMU1IeEdTamt6TlNNeEdnc0k3NndQRUFJYUExVlRSRGdjY08rc0R3PT0SBggAIAIoASIA&curr=USD",
    );

    expect(result).toMatchObject({
      tripType: "multi-city",
      cabin: "BUSINESS",
      currency: "USD",
      slices: [
        {
          origin: "AKL",
          destination: "NRT",
          departureDate: "2026-08-27",
          segments: [
            {
              origin: "AKL",
              destination: "NAN",
              carrier: "FJ",
              flightNumber: "410",
            },
            {
              origin: "NAN",
              destination: "NRT",
              carrier: "FJ",
              flightNumber: "351",
            },
          ],
        },
        {
          origin: "NRT",
          destination: "MEL",
          departureDate: "2027-04-14",
          segments: [
            {
              origin: "NRT",
              destination: "NAN",
              carrier: "FJ",
              flightNumber: "350",
            },
            {
              origin: "NAN",
              destination: "MEL",
              carrier: "FJ",
              flightNumber: "935",
            },
          ],
        },
      ],
    });

    const search = new URL(result?.matrixUrl || "").searchParams.get("search") || "";
    const decoded = JSON.parse(atob(search));
    expect(decoded).toMatchObject({
      type: "multi-city",
      muTravelAutoOpen: "1",
      muTravelAutoSearch: "1",
      options: {
        cabin: "BUSINESS",
        currency: {
          code: "USD",
        },
      },
      slices: [
        {
          origin: ["AKL"],
          dest: ["NRT"],
          routing: "FJ410 FJ351",
        },
        {
          origin: ["NRT"],
          dest: ["MEL"],
          routing: "FJ350 FJ935",
        },
      ],
    });
  });

  it("uses inferred Google Flights currency in ITA Matrix handoff URLs when curr is absent", () => {
    const result = parseGoogleFlightsMatrixSearch(
      `https://www.google.com/travel/flights/booking?tfs=${encodeTfsText([
        tfsSlice(tfsSegment("2026-06-03", "HKG", "TPE", "CI", "922")),
      ])}`,
      "HKD",
    );

    expect(result).toMatchObject({
      currency: "HKD",
    });

    const search = new URL(result?.matrixUrl || "").searchParams.get("search") || "";
    const decoded = JSON.parse(atob(search));
    expect(decoded.options.currency).toEqual({ code: "HKD" });
  });

  it("returns null for invalid Matrix search input URLs", () => {
    expect(parseGoogleFlightsMatrixSearch("not a url")).toBeNull();
  });

  it("splits Google Flights airport-change segments into Matrix multi-city slices", () => {
    const result = parseGoogleFlightsMatrixSearch(
      "https://www.google.com/travel/flights/booking?tfs=CBwQAhpuEgoyMDI2LTA1LTI5IiAKA0hORBIKMjAyNi0wNS0yORoDR01QKgJPWjIEMTA3NSIfCgNJQ04SCjIwMjYtMDUtMzAaA0hLRyoCT1oyAzcyMUAKSBNQAFgXagwIAxIIL20vMDdkZmtyBwgBEgNIS0dAAUgBcAGCAQsI____________AZgBAg&tfu=CnRDalJJVlRsNlIwa3hhRTlXVmxsQlJIaGljVUZDUnkwdExTMHRMUzB0TFhSc2Myb3lNa0ZCUVVGQlIyOVJhRXRaVDNoUlVuVkJFZ3hQV2pFd056VjhUMW8zTWpFYUN3anIvUUVRQWhvRFZWTkVPQnh3Ni8wQhICCAAiAA&gl=JP&curr=USD",
    );

    expect(result).toMatchObject({
      tripType: "multi-city",
      carriers: ["OZ"],
      slices: [
        {
          origin: "HND",
          destination: "GMP",
          departureDate: "2026-05-29",
          segments: [
            {
              origin: "HND",
              destination: "GMP",
              carrier: "OZ",
              flightNumber: "1075",
            },
          ],
        },
        {
          origin: "ICN",
          destination: "HKG",
          departureDate: "2026-05-30",
          segments: [
            {
              origin: "ICN",
              destination: "HKG",
              carrier: "OZ",
              flightNumber: "721",
            },
          ],
        },
      ],
    });

    const search = new URL(result?.matrixUrl || "").searchParams.get("search") || "";
    const decoded = JSON.parse(atob(search));
    expect(decoded).toMatchObject({
      type: "multi-city",
      slices: [
        {
          origin: ["HND"],
          dest: ["GMP"],
          routing: "F:OZ1075",
          dates: {
            departureDate: "2026-05-29",
          },
        },
        {
          origin: ["ICN"],
          dest: ["HKG"],
          routing: "F:OZ721",
          dates: {
            departureDate: "2026-05-30",
          },
        },
      ],
    });
  });

  it("keeps return-leg connections in their own Matrix slice", () => {
    const result = parseGoogleFlightsMatrixSearch(
      `https://www.google.com/travel/flights/booking?tfs=${encodeTfsText([
        tfsSlice(
          tfsSegment("2026-05-29", "HND", "ICN", "OZ", "1075"),
          tfsSegment("2026-05-29", "ICN", "HKG", "OZ", "721"),
        ),
        tfsSlice(
          tfsSegment("2026-06-03", "HKG", "TPE", "CI", "922"),
          tfsSegment("2026-06-03", "TPE", "HND", "CI", "220"),
        ),
      ])}`,
    );

    expect(result).toMatchObject({
      tripType: "round-trip",
      slices: [
        {
          origin: "HND",
          destination: "HKG",
          departureDate: "2026-05-29",
        },
        {
          origin: "HKG",
          destination: "HND",
          departureDate: "2026-06-03",
        },
      ],
    });

    const search = new URL(result?.matrixUrl || "").searchParams.get("search") || "";
    const decoded = JSON.parse(atob(search));
    expect(decoded).toMatchObject({
      type: "round-trip",
      slices: [
        {
          origin: ["HND"],
          dest: ["HKG"],
          routing: "OZ1075 OZ721",
          routingRet: "CI922 CI220",
          dates: {
            departureDate: "2026-05-29",
            returnDate: "2026-06-03",
          },
        },
      ],
    });
  });

  it("treats same-day reciprocal slices as round trips", () => {
    const result = parseGoogleFlightsMatrixSearch(
      `https://www.google.com/travel/flights/booking?tfs=${encodeTfsText([
        tfsSlice(tfsSegment("2026-06-03", "HKG", "TPE", "CI", "922")),
        tfsSlice(tfsSegment("2026-06-03", "TPE", "HKG", "CI", "921")),
      ])}`,
    );

    expect(result?.tripType).toBe("round-trip");
    const search = new URL(result?.matrixUrl || "").searchParams.get("search") || "";
    const decoded = JSON.parse(atob(search));
    expect(decoded).toMatchObject({
      type: "round-trip",
      slices: [
        {
          origin: ["HKG"],
          dest: ["TPE"],
          routing: "F:CI922",
          routingRet: "F:CI921",
          dates: {
            departureDate: "2026-06-03",
            returnDate: "2026-06-03",
          },
        },
      ],
    });
  });
});

function tfsSegment(
  departureDate: string,
  origin: string,
  destination: string,
  carrier: string,
  flightNumber: string,
): string {
  return `\x0a\x03${origin}\x12\x0a${departureDate}\x1a\x03${destination}\x2a\x02${carrier}\x32${String.fromCharCode(
    flightNumber.length,
  )}${flightNumber}`;
}

function tfsSlice(...segments: string[]): string {
  const value = segments.join("");
  return `\x1a${String.fromCharCode(value.length)}${value}`;
}

function encodeTfsText(parts: string[]): string {
  return btoa(parts.join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
