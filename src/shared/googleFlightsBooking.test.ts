import {
  googleFlightsCountryUrl,
  normalizeGoogleFlightsCountryCodes,
  parseGoogleFlightsBookingOptions,
  parseGoogleFlightsCountryInput,
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

  it("normalizes country code defaults for Google Flights comparisons", () => {
    expect(normalizeGoogleFlightsCountryCodes(["us", "JP", "jp", "bad", 123])).toEqual(["US", "JP"]);
    expect(parseGoogleFlightsCountryInput("us, jp MY")).toEqual(["US", "JP", "MY"]);
  });
});
