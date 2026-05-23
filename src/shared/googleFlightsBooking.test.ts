import {
  googleFlightsCountryUrl,
  normalizeGoogleFlightsCountryCodes,
  parseGoogleFlightsBookingOptions,
  parseGoogleFlightsCountryInput,
  parseGoogleFlightsMatrixSearch,
} from "./googleFlightsBooking";

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

  it("changes only the Google Flights country parameter", () => {
    const url = googleFlightsCountryUrl("https://www.google.com/travel/flights/booking?tfs=abc&curr=USD&gl=TW", "MY");

    expect(url).toBe("https://www.google.com/travel/flights/booking?tfs=abc&curr=USD&gl=MY");
  });

  it("adds a default currency when building comparable country URLs", () => {
    const url = googleFlightsCountryUrl("https://www.google.com/travel/flights/booking?tfs=abc&gl=TW", "MY");

    expect(url).toBe("https://www.google.com/travel/flights/booking?tfs=abc&gl=MY&curr=USD");
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
    expect(new URL(result?.matrixUrl || "").searchParams.get("muTravelAutoOpen")).toBeNull();
    expect(new URL(result?.matrixUrl || "").searchParams.get("muTravelAutoSearch")).toBe("1");
    const decoded = JSON.parse(atob(search));
    expect(decoded).toMatchObject({
      type: "one-way",
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
      },
    });
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
