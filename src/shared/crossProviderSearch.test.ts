import { describe, expect, it } from "vitest";
import {
  googleFlightsSearchUrlFromSkyscanner,
  routeSpecificCrossProviderSearchUrl,
  skyscannerSearchUrlFromGoogleFlights,
} from "./crossProviderSearch";

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

  it("builds a Skyscanner one-way search from route-only Google Flights tfs URLs with IATA endpoints", () => {
    const url = routeSpecificCrossProviderSearchUrl(
      "https://www.google.com/travel/flights/search?tfs=CBwQAhoeEgoyMDI2LTA3LTA3agcIARIDVFBFcgcIARIDTlJUQAFIAXABggELCP___________wGYAQI&tfu=EgYIABAAGAA&curr=TWD&gl=TW&hl=en-US",
    );

    const parsed = new URL(url);
    expect(parsed.hostname).toBe("www.skyscanner.com.tw");
    expect(parsed.pathname).toBe("/transport/flights/tpe/nrt/260707/");
    expect(parsed.searchParams.get("currency")).toBe("TWD");
    expect(parsed.searchParams.get("locale")).toBe("en-US");
    expect(parsed.searchParams.get("market")).toBe("TW");
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

  it("normalizes Skyscanner city codes before building Google Flights searches", () => {
    const taipeiUrl = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.id/transport/flights/tpet/nrt/260624/?adultsv2=1&cabinclass=economy&currency=USD&locale=en-US&market=ID",
    );
    expect(new URL(taipeiUrl).searchParams.get("q")).toBe("Flights from TPE to NRT on 2026-06-24 one way");

    const londonUrl = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.uk/transport/flights/lond/nrt/260624/?adultsv2=1&cabinclass=economy&currency=GBP&locale=en-GB&market=UK",
    );
    expect(new URL(londonUrl).searchParams.get("q")).toBe("Flights from LON to NRT on 2026-06-24 one way");

    const laUrl = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.com/transport/flights/laxa/nrt/260624/?adultsv2=1&cabinclass=economy&currency=USD&locale=en-US&market=US",
    );
    expect(new URL(laUrl).searchParams.get("q")).toBe("Flights from LAX to NRT on 2026-06-24 one way");

    const newYorkParisUrl = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.id/transport/flights/nyca/pari/260624/?adultsv2=1&cabinclass=economy&currency=USD&locale=en-US&market=ID",
    );
    expect(new URL(newYorkParisUrl).searchParams.get("q")).toBe("Flights from NYC to PAR on 2026-06-24 one way");

    const sanDiegoSaoPauloUrl = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.id/transport/flights/sana/saoa/260624/?adultsv2=1&cabinclass=economy&currency=USD&locale=en-US&market=ID",
    );
    expect(new URL(sanDiegoSaoPauloUrl).searchParams.get("q")).toBe("Flights from SAN to SAO on 2026-06-24 one way");

    const washingtonChicagoUrl = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.id/transport/flights/wasa/chia/260624/?adultsv2=1&cabinclass=economy&currency=USD&locale=en-US&market=ID",
    );
    expect(new URL(washingtonChicagoUrl).searchParams.get("q")).toBe("Flights from WAS to CHI on 2026-06-24 one way");

    const milanRomeUrl = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.id/transport/flights/mila/rome/260624/?adultsv2=1&cabinclass=economy&currency=USD&locale=en-US&market=ID",
    );
    expect(new URL(milanRomeUrl).searchParams.get("q")).toBe("Flights from MIL to ROM on 2026-06-24 one way");

    const shanghaiSeoulUrl = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.id/transport/flights/csha/sela/260624/?adultsv2=1&cabinclass=economy&currency=USD&locale=en-US&market=ID",
    );
    expect(new URL(shanghaiSeoulUrl).searchParams.get("q")).toBe("Flights from SHA to SEL on 2026-06-24 one way");

    const beijingBangkokUrl = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.id/transport/flights/bjsa/bkkt/260624/?adultsv2=1&cabinclass=economy&currency=USD&locale=en-US&market=ID",
    );
    expect(new URL(beijingBangkokUrl).searchParams.get("q")).toBe("Flights from BJS to BKK on 2026-06-24 one way");

    const osakaDubaiUrl = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.id/transport/flights/osaa/dxba/260624/?adultsv2=1&cabinclass=economy&currency=USD&locale=en-US&market=ID",
    );
    expect(new URL(osakaDubaiUrl).searchParams.get("q")).toBe("Flights from OSA to DXB on 2026-06-24 one way");

    const istanbulBuenosAiresUrl = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.id/transport/flights/ista/buea/260624/?adultsv2=1&cabinclass=economy&currency=USD&locale=en-US&market=ID",
    );
    expect(new URL(istanbulBuenosAiresUrl).searchParams.get("q")).toBe("Flights from IST to BUE on 2026-06-24 one way");

    const sanJoseDallasUrl = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.id/transport/flights/sjca/dfwa/260624/?adultsv2=1&cabinclass=economy&currency=USD&locale=en-US&market=ID",
    );
    expect(new URL(sanJoseDallasUrl).searchParams.get("q")).toBe("Flights from SJC to DFW on 2026-06-24 one way");

    const houstonMiamiUrl = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.id/transport/flights/houa/miaa/260624/?adultsv2=1&cabinclass=economy&currency=USD&locale=en-US&market=ID",
    );
    expect(new URL(houstonMiamiUrl).searchParams.get("q")).toBe("Flights from HOU to MIA on 2026-06-24 one way");

    const torontoMontrealUrl = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.id/transport/flights/ytoa/ymqa/260624/?adultsv2=1&cabinclass=economy&currency=USD&locale=en-US&market=ID",
    );
    expect(new URL(torontoMontrealUrl).searchParams.get("q")).toBe("Flights from YTO to YMQ on 2026-06-24 one way");

    const vancouverMexicoCityUrl = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.id/transport/flights/yvra/mexa/260624/?adultsv2=1&cabinclass=economy&currency=USD&locale=en-US&market=ID",
    );
    expect(new URL(vancouverMexicoCityUrl).searchParams.get("q")).toBe("Flights from YVR to MEX on 2026-06-24 one way");

    const stockholmOsloUrl = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.id/transport/flights/stoc/oslo/260624/?adultsv2=1&cabinclass=economy&currency=USD&locale=en-US&market=ID",
    );
    expect(new URL(stockholmOsloUrl).searchParams.get("q")).toBe("Flights from STO to OSL on 2026-06-24 one way");

    const rioColomboUrl = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.id/transport/flights/rioa/cmba/260624/?adultsv2=1&cabinclass=economy&currency=USD&locale=en-US&market=ID",
    );
    expect(new URL(rioColomboUrl).searchParams.get("q")).toBe("Flights from RIO to CMB on 2026-06-24 one way");

    const moscowKualaLumpurUrl = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.id/transport/flights/mosc/kulm/260624/?adultsv2=1&cabinclass=economy&currency=USD&locale=en-US&market=ID",
    );
    expect(new URL(moscowKualaLumpurUrl).searchParams.get("q")).toBe("Flights from MOW to KUL on 2026-06-24 one way");

    const jakartaMelbourneUrl = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.co.id/transport/flights/cgki/mela/260624/?adultsv2=1&cabinclass=economy&currency=USD&locale=en-US&market=ID",
    );
    expect(new URL(jakartaMelbourneUrl).searchParams.get("q")).toBe("Flights from CGK to MEL on 2026-06-24 one way");
  });

  it("preserves broader BCP 47 locale tags in cross-provider links", () => {
    const url = googleFlightsSearchUrlFromSkyscanner(
      "https://www.skyscanner.com.br/transport/flights/gru/eze/260624/?adultsv2=1&cabinclass=economy&currency=BRL&locale=zh-Hant-TW&market=BR",
    );

    expect(new URL(url).searchParams.get("hl")).toBe("zh-Hant-TW");
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

  it("omits route-specific cross-provider links for unsupported Skyscanner multi-city routes", () => {
    const url = routeSpecificCrossProviderSearchUrl(
      "https://www.skyscanner.co.kr/transport/d/cju/2026-06-24/tyoa/tyoa/2026-06-27/sela/?currency=USD&locale=en-US&market=KR",
    );

    expect(url).toBe("");
  });

  it("falls back to a normal Skyscanner search page when Google route data is unavailable", () => {
    const url = skyscannerSearchUrlFromGoogleFlights("https://www.google.com/travel/flights/booking?gl=TW&curr=TWD");

    const parsed = new URL(url);
    expect(parsed.hostname).toBe("www.skyscanner.com.tw");
    expect(parsed.pathname).toBe("/transport/flights/");
    expect(parsed.searchParams.get("currency")).toBe("TWD");
    expect(parsed.searchParams.get("market")).toBe("TW");
  });

  it("maps known Google city locations to Skyscanner all-airport route codes", () => {
    const taipeiUrl = routeSpecificCrossProviderSearchUrl(
      "https://www.google.com/travel/flights/search?tfs=CBwQAhojEgoyMDI2LTA3LTA4agwIAhIIL20vMGZ0a3hyBwgBEgNOUlRAAUgBcAGCAQsI____________AZgBAg&tfu=EgoIABAAGAAgAigB&curr=TWD&gl=TW&hl=en-US",
    );
    expect(new URL(taipeiUrl).pathname).toBe("/transport/flights/tpet/nrt/260708/");

    const londonUrl = routeSpecificCrossProviderSearchUrl(
      "https://www.google.com/travel/flights/search?tfs=CBwQAhosEgoyMDI2LTA2LTI0MgdTS1lURUFNagwIAxIIL20vMDRqcGxyBwgBEgNOUlRAAUgBcAGCAQsI____________AZgBAg&tfu=EgIIACIA&hl=en-US&gl=KR&curr=USD",
    );
    expect(new URL(londonUrl).pathname).toBe("/transport/flights/lond/nrt/260624/");

    const laUrl = routeSpecificCrossProviderSearchUrl(
      "https://www.google.com/travel/flights/search?tfs=CBwQAhouEgoyMDI2LTA2LTI0MgdTS1lURUFNag4IAxIKL20vMDMwcWIzdHIHCAESA05SVEABSAFwAYIBCwj___________8BmAEC&tfu=EgIIACIA&hl=en-US&gl=KR&curr=USD",
    );
    expect(new URL(laUrl).pathname).toBe("/transport/flights/laxa/nrt/260624/");

    const newYorkParisUrl = routeSpecificCrossProviderSearchUrl(
      "https://www.google.com/travel/flights/search?tfs=CBwQAhoyEgoyMDI2LTA2LTI0MgdTS1lURUFNag0IAxIJL20vMDJfMjg2cgwIAxIIL20vMDVxdGpAAUgBcAGCAQsI____________AZgBAg&tfu=EgIIACIA&hl=en-US&gl=KR&curr=USD",
    );
    expect(new URL(newYorkParisUrl).pathname).toBe("/transport/flights/nyca/pari/260624/");

    const sanDiegoSaoPauloUrl = routeSpecificCrossProviderSearchUrl(
      "https://www.google.com/travel/flights/search?tfs=CBwQAhoyEgoyMDI2LTA2LTI0MgdTS1lURUFNagwIAxIIL20vMDcxdnJyDQgDEgkvbS8wMjJwZm1AAUgBcAGCAQsI____________AZgBAg&tfu=EgIIACIA&hl=en-US&gl=KR&curr=USD",
    );
    expect(new URL(sanDiegoSaoPauloUrl).pathname).toBe("/transport/flights/sana/saoa/260624/");

    const washingtonChicagoUrl = routeSpecificCrossProviderSearchUrl(
      "https://www.google.com/travel/flights/search?tfs=CBwQAhoxEgoyMDI2LTA2LTI0MgdTS1lURUFNagwIAxIIL20vMHJoNmtyDAgDEggvbS8wMV9kNEABSAFwAYIBCwj___________8BmAEC&tfu=EgIIACIA&hl=en-US&gl=KR&curr=USD",
    );
    expect(new URL(washingtonChicagoUrl).pathname).toBe("/transport/flights/wasa/chia/260624/");

    const milanRomeUrl = routeSpecificCrossProviderSearchUrl(
      "https://www.google.com/travel/flights/search?tfs=CBwQAhoxEgoyMDI2LTA2LTI0MgdTS1lURUFNagwIAxIIL20vMDk0N2xyDAgDEggvbS8wNmM2MkABSAFwAYIBCwj___________8BmAEC&tfu=EgIIACIA&hl=en-US&gl=KR&curr=USD",
    );
    expect(new URL(milanRomeUrl).pathname).toBe("/transport/flights/mila/rome/260624/");

    const beijingBangkokUrl = routeSpecificCrossProviderSearchUrl(
      "https://www.google.com/travel/flights/search?tfs=CBwQAhoxEgoyMDI2LTA2LTI0MgdTS1lURUFNagwIAxIIL20vMDE5MTRyDAgDEggvbS8wZm4yZ0ABSAFwAYIBCwj___________8BmAEC&tfu=EgIIACIA&hl=en-US&gl=KR&curr=USD",
    );
    expect(new URL(beijingBangkokUrl).pathname).toBe("/transport/flights/bjsa/bkkt/260624/");

    const osakaDubaiUrl = routeSpecificCrossProviderSearchUrl(
      "https://www.google.com/travel/flights/search?tfs=CBwQAhoyEgoyMDI2LTA2LTI0MgdTS1lURUFNagwIAxIIL20vMGRxeXdyDQgDEgkvbS8wMWYwOHJAAUgBcAGCAQsI____________AZgBAg&tfu=EgIIACIA&hl=en-US&gl=KR&curr=USD",
    );
    expect(new URL(osakaDubaiUrl).pathname).toBe("/transport/flights/osaa/dxba/260624/");

    const istanbulBuenosAiresUrl = routeSpecificCrossProviderSearchUrl(
      "https://www.google.com/travel/flights/search?tfs=CBwQAhozEgoyMDI2LTA2LTI0MgdTS1lURUFNag0IAxIJL20vMDk5NDltcg0IAxIJL20vMDFseTVtQAFIAXABggELCP___________wGYAQI&tfu=EgIIACIA&hl=en-US&gl=KR&curr=USD",
    );
    expect(new URL(istanbulBuenosAiresUrl).pathname).toBe("/transport/flights/ista/buea/260624/");

    const sanJoseDallasUrl = routeSpecificCrossProviderSearchUrl(
      "https://www.google.com/travel/flights/search?tfs=CBwQAhoxEgoyMDI2LTA2LTI0MgdTS1lURUFNagwIAxIIL20vMGYwNHZyDAgDEggvbS8wZjJycUABSAFwAYIBCwj___________8BmAEC&tfu=EgIIACIA&hl=en-US&gl=KR&curr=USD",
    );
    expect(new URL(sanJoseDallasUrl).pathname).toBe("/transport/flights/sjca/dfwa/260624/");

    const houstonMiamiUrl = routeSpecificCrossProviderSearchUrl(
      "https://www.google.com/travel/flights/search?tfs=CBwQAhoxEgoyMDI2LTA2LTI0MgdTS1lURUFNagwIAxIIL20vMDNsMm5yDAgDEggvbS8wZjJ2MEABSAFwAYIBCwj___________8BmAEC&tfu=EgIIACIA&hl=en-US&gl=KR&curr=USD",
    );
    expect(new URL(houstonMiamiUrl).pathname).toBe("/transport/flights/houa/miaa/260624/");

    const torontoMontrealUrl = routeSpecificCrossProviderSearchUrl(
      "https://www.google.com/travel/flights/search?tfs=CBwQAhoxEgoyMDI2LTA2LTI0MgdTS1lURUFNagwIAxIIL20vMGg3aDZyDAgDEggvbS8wNTJwN0ABSAFwAYIBCwj___________8BmAEC&tfu=EgIIACIA&hl=en-US&gl=KR&curr=USD",
    );
    expect(new URL(torontoMontrealUrl).pathname).toBe("/transport/flights/ytoa/ymqa/260624/");

    const vancouverMexicoCityUrl = routeSpecificCrossProviderSearchUrl(
      "https://www.google.com/travel/flights/search?tfs=CBwQAhooEgoyMDI2LTA2LTI0agwIAxIIL20vMDgwaDJyDAgDEggvbS8wNHNxakABSAFwAYIBCwj___________8BmAEC&tfu=EgIIACIA&hl=en-US&gl=KR&curr=USD",
    );
    expect(new URL(vancouverMexicoCityUrl).pathname).toBe("/transport/flights/yvra/mexa/260624/");

    const stockholmOsloUrl = routeSpecificCrossProviderSearchUrl(
      "https://www.google.com/travel/flights/search?tfs=CBwQAhooEgoyMDI2LTA2LTI0agwIAxIIL20vMDZteHNyDAgDEggvbS8wNWw2NEABSAFwAYIBCwj___________8BmAEC&tfu=EgIIACIA&hl=en-US&gl=KR&curr=USD",
    );
    expect(new URL(stockholmOsloUrl).pathname).toBe("/transport/flights/stoc/oslo/260624/");

    const rioColomboUrl = routeSpecificCrossProviderSearchUrl(
      "https://www.google.com/travel/flights/search?tfs=CBwQAhooEgoyMDI2LTA2LTI0agwIAxIIL20vMDZnbXJyDAgDEggvbS8wZm43ckABSAFwAYIBCwj___________8BmAEC&tfu=EgIIACIA&hl=en-US&gl=KR&curr=USD",
    );
    expect(new URL(rioColomboUrl).pathname).toBe("/transport/flights/rioa/cmba/260624/");

    const moscowKualaLumpurUrl = routeSpecificCrossProviderSearchUrl(
      "https://www.google.com/travel/flights/search?tfs=CBwQAhooEgoyMDI2LTA2LTI0agwIAxIIL20vMDRzd2RyDAgDEggvbS8wNDlkMUABSAFwAYIBCwj___________8BmAEC&tfu=EgIIACIA&hl=en-US&gl=KR&curr=USD",
    );
    expect(new URL(moscowKualaLumpurUrl).pathname).toBe("/transport/flights/mosc/kulm/260624/");

    const jakartaMelbourneUrl = routeSpecificCrossProviderSearchUrl(
      "https://www.google.com/travel/flights/search?tfs=CBwQAhopEgoyMDI2LTA2LTI0agwIAxIIL20vMDQ0cnZyDQgDEgkvbS8wY2hnem1AAUgBcAGCAQsI____________AZgBAg&tfu=EgIIACIA&hl=en-US&gl=KR&curr=USD",
    );
    expect(new URL(jakartaMelbourneUrl).pathname).toBe("/transport/flights/cgki/mela/260624/");
  });

  it("omits route-specific cross-provider links when one Google city endpoint is unmapped", () => {
    const berlinSeoulUrl =
      "https://www.google.com/travel/flights/search?tfs=CBwQAhoxEgoyMDI2LTA2LTI0MgdTS1lURUFNagwIAxIIL20vMDE1NnFyDAgDEggvbS8waHNxZkABSAFwAYIBCwj___________8BmAEC&tfu=EgIIACIA&hl=en-US&gl=KR&curr=USD";

    expect(routeSpecificCrossProviderSearchUrl(berlinSeoulUrl)).toBe("");
  });

  it("omits route-specific cross-provider links when Google tfs has unmapped city endpoints", () => {
    const currentUrl =
      "https://www.google.com/travel/flights/search?tfs=CBwQAhojEgoyMDI2LTA3LTA4agwIAhIIL20venp6enp6BwgBEgNOUlRAAUgBcAGCAQsI____________AZgBAg&tfu=EgoIABAAGAAgAigB";

    expect(routeSpecificCrossProviderSearchUrl(currentUrl, "TWD")).toBe("");
    expect(new URL(skyscannerSearchUrlFromGoogleFlights(currentUrl, "TWD")).pathname).toBe("/transport/flights/");
  });
});
