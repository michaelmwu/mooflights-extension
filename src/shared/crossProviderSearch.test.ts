import { describe, expect, it } from "vitest";
import { googleFlightsSearchUrlFromSkyscanner, skyscannerSearchUrlFromGoogleFlights } from "./crossProviderSearch";

describe("crossProviderSearch", () => {
  it("builds a Skyscanner search from a Google Flights tfs URL", () => {
    const url = skyscannerSearchUrlFromGoogleFlights(
      "https://www.google.com/travel/flights?tfs=CDIQAho_EgoyMDI2LTA4LTI3Ih8KA0hLRxIKMjAyNi0wOC0yNxoDVFBFKgJKWDIDMjM2agcIARIDSEtHcgcIARIDVFBFQAFIAZgBAg&curr=hkd&gl=KR&hl=zh-TW",
    );

    const parsed = new URL(url);
    expect(parsed.hostname).toBe("www.skyscanner.co.kr");
    expect(parsed.pathname).toBe("/transport/d/hkg/2026-08-27/tpe");
    expect(parsed.searchParams.get("currency")).toBe("HKD");
    expect(parsed.searchParams.get("locale")).toBe("zh-TW");
    expect(parsed.searchParams.get("market")).toBe("KR");
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
    expect(parsed.searchParams.get("q")).toBe("Flights from CJU to NRT on 2026-06-24");
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
