import { describe, expect, it } from "vitest";
import { googleFlightsSearchUrlFromSkyscanner, skyscannerSearchUrlFromGoogleFlights } from "./crossProviderSearch";

describe("crossProviderSearch", () => {
  it("builds a Skyscanner search from a Google Flights tfs URL", () => {
    const url = skyscannerSearchUrlFromGoogleFlights(
      "https://www.google.com/travel/flights?tfs=CDIQAho_EgoyMDI2LTA4LTI3Ih8KA0hLRxIKMjAyNi0wOC0yNxoDVFBFKgJKWDIDMjM2agcIARIDSEtHcgcIARIDVFBFQAFIAZgBAg&curr=hkd&gl=KR&hl=zh-TW",
    );

    const parsed = new URL(url);
    expect(parsed.hostname).toBe("www.skyscanner.co.kr");
    expect(parsed.pathname).toBe("/transport/flights/hkg/tpe/260827/");
    expect(parsed.searchParams.get("currency")).toBe("HKD");
    expect(parsed.searchParams.get("locale")).toBe("zh-TW");
    expect(parsed.searchParams.get("market")).toBe("KR");
  });

  it("builds a Skyscanner one-way search from route-only Google Flights tfs URLs", () => {
    const url = skyscannerSearchUrlFromGoogleFlights(
      "https://www.google.com/travel/flights/search?tfs=CBwQAhoeEgoyMDI2LTA2LTI0agcIARIDQ0pVcgcIARIDTlJUQAFIAXABggELCP___________wGYAQI&curr=TWD&hl=en-US",
    );

    const parsed = new URL(url);
    expect(parsed.hostname).toBe("www.skyscanner.com");
    expect(parsed.pathname).toBe("/transport/flights/cju/nrt/260624/");
    expect(parsed.searchParams.get("currency")).toBe("TWD");
    expect(parsed.searchParams.get("locale")).toBe("en-US");
    expect(parsed.searchParams.get("market")).toBe("US");
    expect(parsed.searchParams.get("rtn")).toBe("0");
  });

  it("builds a valid one-way Skyscanner URL from a Google Flights query URL", () => {
    const url = skyscannerSearchUrlFromGoogleFlights(
      "https://www.google.com/travel/flights?curr=USD&gl=KR&hl=en-US&q=Flights+from+CJU+to+NRT+on+2026-06-24",
    );

    const parsed = new URL(url);
    expect(parsed.hostname).toBe("www.skyscanner.co.kr");
    expect(parsed.pathname).toBe("/transport/flights/cju/nrt/260624/");
    expect(parsed.searchParams.get("currency")).toBe("USD");
    expect(parsed.searchParams.get("locale")).toBe("en-US");
    expect(parsed.searchParams.get("market")).toBe("KR");
    expect(parsed.searchParams.get("rtn")).toBe("0");
  });

  it("builds a Google Flights search from a Skyscanner route URL", () => {
    const url = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.za/transport/flights/cju/nrt/260624/?adultsv2=1&cabinclass=economy&currency=USD&locale=en-US&market=ZA",
    );

    const parsed = new URL(url);
    expect(parsed.hostname).toBe("www.google.com");
    expect(parsed.pathname).toBe("/travel/flights");
    expect(parsed.searchParams.get("curr")).toBe("USD");
    expect(parsed.searchParams.get("gl")).toBe("ZA");
    expect(parsed.searchParams.get("hl")).toBe("en-US");
    expect(parsed.searchParams.get("q")).toBe("Flights from CJU to NRT on 2026-06-24 one way");
  });

  it("normalizes Skyscanner all-airport codes before building Google Flights searches", () => {
    const url = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.kr/transport/flights/cju/tyoa/260624/?adultsv2=1&cabinclass=economy&currency=USD&locale=en-US&market=KR",
    );

    const parsed = new URL(url);
    expect(parsed.searchParams.get("q")).toBe("Flights from CJU to TYO on 2026-06-24 one way");
  });

  it("derives the Google Flights country from localized Skyscanner hosts and UK market aliases", () => {
    const hostUrl = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.kr/transport/flights/cju/nrt/260624/?adultsv2=1&cabinclass=economy&currency=USD&locale=en-US",
    );
    expect(new URL(hostUrl).searchParams.get("gl")).toBe("KR");

    const ukUrl = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.uk/transport/flights/lhr/jfk/260624/?adultsv2=1&cabinclass=economy&currency=GBP&locale=en-GB&market=UK",
    );
    expect(new URL(ukUrl).searchParams.get("gl")).toBe("GB");
  });

  it("includes return dates from standard Skyscanner round-trip flight URLs", () => {
    const url = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.kr/transport/flights/cju/nrt/260624/260628/?adultsv2=1&cabinclass=economy&currency=USD&locale=en-US&market=KR",
    );

    const parsed = new URL(url);
    expect(parsed.searchParams.get("q")).toBe("Flights from CJU to NRT on 2026-06-24 returning 2026-06-28");
  });

  it("falls back to a normal Google Flights page for true Skyscanner multi-city routes", () => {
    const url = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.kr/transport/d/cju/2026-06-24/tyoa/tyoa/2026-06-27/sela/?currency=USD&locale=en-US&market=KR",
    );

    const parsed = new URL(url);
    expect(parsed.hostname).toBe("www.google.com");
    expect(parsed.pathname).toBe("/travel/flights");
    expect(parsed.searchParams.get("curr")).toBe("USD");
    expect(parsed.searchParams.get("gl")).toBe("KR");
    expect(parsed.searchParams.get("hl")).toBe("en-US");
    expect(parsed.searchParams.has("q")).toBe(false);
  });

  it("falls back to a normal Skyscanner search page when Google route data is unavailable", () => {
    const url = skyscannerSearchUrlFromGoogleFlights("https://www.google.com/travel/flights/booking?gl=TW&curr=TWD");

    const parsed = new URL(url);
    expect(parsed.hostname).toBe("www.skyscanner.com.tw");
    expect(parsed.pathname).toBe("/transport/flights/");
    expect(parsed.searchParams.get("currency")).toBe("TWD");
    expect(parsed.searchParams.get("market")).toBe("TW");
  });
});
