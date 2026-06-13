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
  parseGoogleFlightsSearchResults,
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

  it("parses visible Google Flights search result rows with stable match keys", () => {
    document.body.innerHTML = `
      <ul>
        <li class="pIav2d">
          <div class="wtdjmc">7:00 AM - 10:30 AM</div>
          <div class="sSHqwe">STARLUX</div>
          <div class="gvkrdb">3 hr 30 min</div>
          <div class="EfT7Ae">Nonstop</div>
          <span aria-label="155 US dollars" role="text">$155</span>
        </li>
        <li class="pIav2d">
          <div class="wtdjmc">11:00 AM - 4:10 PM</div>
          <div class="sSHqwe">Cathay Pacific</div>
          <div class="gvkrdb">5 hr 10 min</div>
          <div class="EfT7Ae">1 stop</div>
          <span role="text">$142</span>
        </li>
      </ul>
    `;

    const result = parseGoogleFlightsSearchResults(document, "JP", "https://www.google.com/travel/flights?tfs=abc");

    expect(result.status).toBe("ready");
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      price: 155,
      priceText: "$155",
      carrierText: "STARLUX",
      durationText: "3 hr 30 min",
      stopsText: "Nonstop",
      matchConfidence: "high",
    });
    expect(result.results[0]?.matchKey).toContain("starlux");
    expect(result.results[0]?.matchKey).not.toContain("155");
  });

  it("strips aria-label currency phrases from Google Flights search match keys", () => {
    document.body.innerHTML = `
      <ul>
        <li class="pIav2d">
          <div class="JMc5Xc" role="link" aria-label="From 17328 Japanese yen. 1 stop flight with Jeju Air. Leaves Jeju International Airport at 8:00 PM on Wednesday, June 24 and arrives at Narita International Airport at 9:30 AM on Thursday, June 25. Total duration 13 hr 30 min. Select flight"></div>
          <span aria-label="17328 Japanese yen" role="text">¥17,328</span>
        </li>
      </ul>
    `;

    const result = parseGoogleFlightsSearchResults(document, "JP", "https://www.google.com/travel/flights?tfs=abc");

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.matchKey).toContain("jeju air");
    expect(result.results[0]?.matchKey).not.toContain("17328");
    expect(result.results[0]?.matchKey).not.toContain("japanese yen");
  });

  it("uses final arrival in search result time signatures", () => {
    document.body.innerHTML = `
      <ul>
        <li class="pIav2d">
          <div class="JMc5Xc" role="link" aria-label="From 27321 Japanese yen. 1 stop flight with Asiana Airlines and Korean Air. Leaves Jeju International Airport at 10:20 AM on Wednesday, June 24 and arrives at Narita International Airport at 5:15 PM on Wednesday, June 24. Total duration 6 hr 55 min. Select flight"></div>
          <span aria-label="27321 Japanese yen" role="text">¥27,321</span>
        </li>
        <li class="pIav2d">
          <div class="JMc5Xc" role="link" aria-label="From 26266 Japanese yen. 1 stop flight with Asiana Airlines. Leaves Jeju International Airport at 10:20 AM on Wednesday, June 24 and arrives at Narita International Airport at 6:25 PM on Wednesday, June 24. Total duration 8 hr 5 min. Select flight"></div>
          <span aria-label="26266 Japanese yen" role="text">¥26,266</span>
        </li>
      </ul>
    `;

    const result = parseGoogleFlightsSearchResults(document, "JP", "https://www.google.com/travel/flights?tfs=abc");

    expect(result.results[0]?.timeText).toBe("10:20-17:15");
    expect(result.results[1]?.timeText).toBe("10:20-18:25");
  });

  it("prefers English Select flight summaries over expanded flight details labels", () => {
    document.body.innerHTML = `
      <ul>
        <li class="pIav2d">
          <div class="JMc5Xc" role="link" aria-label="From 26670 Japanese yen. 1 stop flight with Asiana Airlines. Leaves Jeju International Airport at 2:30 PM on Wednesday, June 24 and arrives at Narita International Airport at 9:00 PM on Wednesday, June 24. Total duration 6 hr 30 min. Layover (1 of 1) is a 2 hr 45 min layover in Seoul. Select flight"></div>
          <button aria-label="Flight details. Leaves Jeju International Airport at 2:30 PM on Wednesday, June 24 and arrives at Narita International Airport at 9:00 PM on Wednesday, June 24." aria-expanded="true"></button>
          <span aria-label="26670 Japanese yen" role="text">¥26,670</span>
        </li>
      </ul>
    `;

    const result = parseGoogleFlightsSearchResults(document, "JP", "https://www.google.com/travel/flights?tfs=abc");

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.matchKey).toContain("1 stop flight with asiana airlines");
    expect(result.results[0]?.matchKey).toContain("total duration 6 hr 30 min");
    expect(result.results[0]?.matchKey).not.toContain("flight details");
    expect(result.results[0]?.matchKey).not.toContain("select flight");
  });

  it("parses localized Japanese Google Flights search aria labels", () => {
    document.body.innerHTML = `
      <ul>
        <li class="pIav2d">
          <div class="JMc5Xc" role="link" aria-label="28092 円～。 アシアナ航空 が運航する経由地 1 か所のフライト。 水曜日, 6月 24 10:20 済州国際空港発、水曜日, 6月 24 18:25 成田国際空港着。 合計時間 8時間 5分。 乗り継ぎ（1/1）は、ソウルでの 4時間 10分の乗り継ぎです。 フライトを選択"></div>
          <span aria-label="28092 円" role="text">28,092 円</span>
        </li>
      </ul>
    `;

    const result = parseGoogleFlightsSearchResults(document, "JP", "https://www.google.com/travel/flights?tfs=abc");

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      price: 28092,
      currency: "JPY",
      timeText: "10:20-18:25",
    });
    expect(result.results[0]?.matchKey).not.toContain("28092");
    expect(result.results[0]?.matchKey).not.toContain("円");
  });

  it("parses localized Chinese Google Flights search aria labels", () => {
    document.body.innerHTML = `
      <ul>
        <li class="pIav2d">
          <div class="JMc5Xc" role="link" aria-label="17552 日圓起。 搭乘濟州航空的航班，中途停留 1 次。 星期三, 6月 24 晚上8:00 於濟州國際機場出發，星期四, 6月 25 上午9:30 抵達成田國際機場。 總交通時間：13 小時 30 分鐘 預估碳排放量：158 公斤. 選擇航班"></div>
          <div data-travelimpactmodelwebsiteurl="https://www.travelimpactmodel.org/lookup/flight?itinerary=CJU-PUS-7C-514-20260624,PUS-NRT-7C-1151-20260625"></div>
          <span aria-label="17552 日圓" role="text">¥17,552</span>
        </li>
        <li class="pIav2d">
          <div class="JMc5Xc" role="link" aria-label="40103 日圓起。 搭乘大韓航空的直達航班。 星期三, 6月 24 中午12:55 於濟州國際機場出發，星期三, 6月 24 下午3:25 抵達成田國際機場。 總交通時間：2 小時 30 分鐘 預估碳排放量：132 公斤. 選擇航班"></div>
          <span aria-label="40103 日圓" role="text">¥40,103</span>
        </li>
      </ul>
    `;

    const result = parseGoogleFlightsSearchResults(document, "JP", "https://www.google.com/travel/flights?tfs=abc");

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toMatchObject({
      price: 17552,
      currency: "JPY",
      timeText: "20:00-09:30",
      itineraryKey: "CJU-PUS-7C514-20260624|PUS-NRT-7C1151-20260625",
    });
    expect(result.results[1]?.timeText).toBe("12:55-15:25");
    expect(result.results[0]?.matchKey).not.toContain("17552");
    expect(result.results[0]?.matchKey).not.toContain("日圓");
  });

  it("converts Chinese noon times after 12 PM", () => {
    document.body.innerHTML = `
      <ul>
        <li class="pIav2d">
          <div class="JMc5Xc" role="link" aria-label="17552 日圓起。 搭乘濟州航空的航班，中途停留 1 次。 星期三, 6月 24 中午1:30 於濟州國際機場出發，星期三, 6月 24 下午3:25 抵達成田國際機場。 總交通時間：1 小時 55 分鐘. 選擇航班"></div>
          <span aria-label="17552 日圓" role="text">¥17,552</span>
        </li>
      </ul>
    `;

    const result = parseGoogleFlightsSearchResults(document, "JP", "https://www.google.com/travel/flights?tfs=abc");

    expect(result.results[0]?.timeText).toBe("13:30-15:25");
  });

  it("parses all Google Flights search rows by default", () => {
    document.body.innerHTML = `
      <ul>
        ${Array.from({ length: 13 }, (_, index) => {
          const baseHour = 6 + index;
          const hour = ((baseHour + 11) % 12) + 1;
          const period = baseHour >= 12 ? "PM" : "AM";
          const price = 10000 + index;
          return `
            <li class="pIav2d">
              <div class="JMc5Xc" role="link" aria-label="From ${price} Japanese yen. Nonstop flight with Test Air ${index}. Leaves Jeju International Airport at ${hour}:00 ${period} on Wednesday, June 24 and arrives at Narita International Airport at ${hour}:30 ${period} on Wednesday, June 24. Total duration 30 min. Select flight"></div>
              <span aria-label="${price} Japanese yen" role="text">¥${price}</span>
            </li>
          `;
        }).join("")}
      </ul>
    `;

    const result = parseGoogleFlightsSearchResults(document, "JP", "https://www.google.com/travel/flights?tfs=abc");

    expect(result.results).toHaveLength(13);
  });

  it("uses Travel Impact itinerary metadata when available", () => {
    document.body.innerHTML = `
      <ul>
        <li class="pIav2d">
          <div class="JMc5Xc" role="link" aria-label="From 27321 Japanese yen. 1 stop flight with Asiana Airlines. Leaves Jeju International Airport at 10:20 AM on Wednesday, June 24 and arrives at Narita International Airport at 6:25 PM on Wednesday, June 24. Total duration 8 hr 5 min. Select flight"></div>
          <div data-travelimpactmodelwebsiteurl="https://www.travelimpactmodel.org/lookup/flight?itinerary=CJU-GMP-OZ-8920-20260624,ICN-NRT-OZ-106-20260624"></div>
          <span aria-label="27321 Japanese yen" role="text">¥27,321</span>
        </li>
      </ul>
    `;

    const result = parseGoogleFlightsSearchResults(document, "JP", "https://www.google.com/travel/flights?tfs=abc");

    expect(result.results[0]?.itineraryKey).toBe("CJU-GMP-OZ8920-20260624|ICN-NRT-OZ106-20260624");
  });

  it("ignores MooFlights search badges when parsing Google Flights search rows", () => {
    document.body.innerHTML = `
      <div class="pIav2d">
        <span data-moo-flights-search-badge>Best JP $120</span>
        <div class="wtdjmc">7:00 AM - 10:30 AM</div>
        <div class="sSHqwe">STARLUX</div>
        <div>3 hr 30 min</div>
        <div>Nonstop</div>
        <span aria-label="155 US dollars" role="text">$155</span>
      </div>
    `;

    const result = parseGoogleFlightsSearchResults(document, "US", "https://www.google.com/travel/flights?tfs=abc");

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.price).toBe(155);
    expect(result.results[0]?.matchKey).not.toContain("best jp");
    expect(result.results[0]?.matchKey).not.toContain("120");
  });

  it("ignores MooFlights search badges inside price containers", () => {
    document.body.innerHTML = `
      <div class="pIav2d">
        <div class="JMc5Xc" role="link" aria-label="From 40369 Japanese yen. Nonstop flight with Korean Air. Leaves Jeju International Airport at 12:55 PM on Wednesday, June 24 and arrives at Narita International Airport at 3:25 PM on Wednesday, June 24. Total duration 2 hr 30 min. Select flight"></div>
        <div class="YMlIz FpEdX" data-moo-flights-search-badge-target="1">
          <span aria-label="40369 Japanese yen" role="text">¥40,369</span>
          <span data-moo-flights-search-badge="1">Cheapest</span>
        </div>
      </div>
    `;

    const result = parseGoogleFlightsSearchResults(document, "JP", "https://www.google.com/travel/flights?tfs=abc");

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.price).toBe(40369);
    expect(result.results[0]?.priceText).toBe("¥40,369");
  });

  it("does not parse departure times as search result prices from mixed containers", () => {
    document.body.innerHTML = `
      <div class="pIav2d">
        <div>7:00 AM - 10:30 AM STARLUX 3 hr 30 min Nonstop $155</div>
        <div class="wtdjmc">7:00 AM - 10:30 AM</div>
        <div class="sSHqwe">STARLUX</div>
        <div>3 hr 30 min</div>
        <div>Nonstop</div>
        <span aria-label="155 US dollars" role="text">$155</span>
      </div>
    `;

    const result = parseGoogleFlightsSearchResults(document, "US", "https://www.google.com/travel/flights?tfs=abc");

    expect(result.results[0]?.price).toBe(155);
    expect(result.results[0]?.priceText).toBe("$155");
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

  it("does not treat unresolved top-level Google Flights tfs shells as panel pages", () => {
    const url =
      "https://www.google.com/travel/flights?tfs=CBwQARoeEgoyMDI2LTA2LTI0agcIARIDQ0pVcgcIARIDTlJUGh4SCjIwMjYtMDYtMzBqBwgBEgNOUlRyBwgBEgNDSlVAAUgBcAGCAQsI____________AZgBAQ&tfu=KgIIAw";

    expect(googleFlightsPanelPageKey(url, "US", true)).toBe("");
  });

  it("recognizes Google Flights search query pages before Google resolves tfs", () => {
    const url = "https://www.google.com/travel/flights?curr=USD&gl=KR&hl=en-US&q=Flights+from+CJU+to+NRT+on+2026-06-24";

    expect(googleFlightsPanelPageKey(url, "KR", true)).toBe(
      "/travel/flights?q=Flights+from+CJU+to+NRT+on+2026-06-24&curr=USD&gl=KR",
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
    expect(new URL(result?.matrixUrl || "").searchParams.get("mooFlightsAutoOpen")).toBe("1");
    expect(new URL(result?.matrixUrl || "").searchParams.get("mooFlightsAutoSearch")).toBe("1");
    const decoded = JSON.parse(atob(search));
    expect(decoded).toMatchObject({
      type: "one-way",
      mooFlightsAutoOpen: "1",
      mooFlightsAutoSearch: "1",
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

  it("parses route-only Google Flights tfs search URLs", () => {
    const result = parseGoogleFlightsMatrixSearch(
      "https://www.google.com/travel/flights/search?tfs=CBwQAhoeEgoyMDI2LTA2LTI0agcIARIDQ0pVcgcIARIDTlJUQAFIAXABggELCP___________wGYAQI",
      "TWD",
    );

    expect(result).toMatchObject({
      tripType: "one-way",
      currency: "TWD",
      carriers: [],
      slices: [
        {
          origin: "CJU",
          destination: "NRT",
          departureDate: "2026-06-24",
          segments: [
            {
              origin: "CJU",
              destination: "NRT",
              departureDate: "2026-06-24",
            },
          ],
        },
      ],
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
      mooFlightsAutoOpen: "1",
      mooFlightsAutoSearch: "1",
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
