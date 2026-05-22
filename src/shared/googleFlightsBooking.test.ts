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

  it("changes only the Google Flights country parameter", () => {
    const url = googleFlightsCountryUrl("https://www.google.com/travel/flights/booking?tfs=abc&curr=USD&gl=TW", "MY");

    expect(url).toBe("https://www.google.com/travel/flights/booking?tfs=abc&curr=USD&gl=MY");
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
    expect(new URL(result?.matrixUrl || "").pathname).toBe("/flights");
    expect(new URL(result?.matrixUrl || "").searchParams.get("muTravelAutoOpen")).toBe("1");
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

  it("keeps connected Google Flights segments in one Matrix slice", () => {
    const result = parseGoogleFlightsMatrixSearch(
      "https://www.google.com/travel/flights/booking?tfs=CBwQAhpuEgoyMDI2LTA1LTI5IiAKA0hORBIKMjAyNi0wNS0yORoDR01QKgJPWjIEMTA3NSIfCgNJQ04SCjIwMjYtMDUtMzAaA0hLRyoCT1oyAzcyMUAKSBNQAFgXagwIAxIIL20vMDdkZmtyBwgBEgNIS0dAAUgBcAGCAQsI____________AZgBAg&tfu=CnRDalJJVlRsNlIwa3hhRTlXVmxsQlJIaGljVUZDUnkwdExTMHRMUzB0TFhSc2Myb3lNa0ZCUVVGQlIyOVJhRXRaVDNoUlVuVkJFZ3hQV2pFd056VjhUMW8zTWpFYUN3anIvUUVRQWhvRFZWTkVPQnh3Ni8wQhICCAAiAA&gl=JP&curr=USD",
    );

    expect(result).toMatchObject({
      tripType: "one-way",
      carriers: ["OZ"],
      slices: [
        {
          origin: "HND",
          destination: "HKG",
          departureDate: "2026-05-29",
          segments: [
            {
              origin: "HND",
              destination: "GMP",
              carrier: "OZ",
              flightNumber: "1075",
            },
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
    expect(decoded.slices[0]).toMatchObject({
      origin: ["HND"],
      dest: ["HKG"],
      routing: "OZ1075 OZ721",
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
