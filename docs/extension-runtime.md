# Extension Runtime

## Manifest

The extension targets Manifest V3 and currently requests:

- `storage`
- `clipboardWrite`
- required host access for `https://matrix.itasoftware.com/*`
- required host access for Google Flights pages on `https://www.google.com/travel/flights*` and
  `https://google.com/travel/flights*`
- required host access for daily cached public USD FX rates from `https://cdn.jsdelivr.net/*` and
  `https://api.fxratesapi.com/*`

Dev builds also add required host access for `http://localhost/*` and `http://127.0.0.1/*` so local backend metadata
debugging can work without runtime permission prompts. Production builds do not fetch hosted backend metadata.

## Content Script

`src/content/itaMatrixContent.ts` injects a Shadow DOM panel into ITA Matrix. It:

- Preserves an F8 shortcut for clearing active ITA airport chips.
- Captures ITA Matrix JSON via Copy as JSON when possible.
- Supports manual JSON paste fallback.
- Renders ranked provider links.
- Provides airport-code filtering, insert, and copy actions.
- Auto-submits ITA Matrix `/search` only when a Mu Travel handoff URL includes `muTravelAutoSearch=1` and the
  prefilled form has enabled the native Search button.
- Attempts to open the first visible ITA Matrix `/flights` result only when a Mu Travel handoff URL includes
  `muTravelAutoOpen=1`.

`src/content/googleFlightsContent.ts` runs on Google Flights pages so it can survive Google Flights SPA navigation. It
injects the visible panel on booking pages and on ITA Matrix handoff itinerary pages with `source=ita_matrix`. It:

- Parses visible booking options, prices, and direct-airline markers from the current booking page.
- Lets the user start an opt-in country price comparison.
- Builds ITA Matrix `/search?search=...&muTravelAutoSearch=1&muTravelAutoOpen=1` handoff URLs from Google Flights
  booking-page data.
- Asks the background service worker to open temporary inactive Google Flights tabs with different `gl` country codes
  while preserving the current itinerary URL and currency. If the URL omits `curr`, the content script infers the
  visible currency from Google Flights price text before falling back to USD.
- Shows the cheapest offer, direct-airline offer, option count, and sparse-result retry status by country.

`src/background/serviceWorker.ts` runs the country checks with bounded concurrency, retries sparse country results once
when the baseline page is dense, and closes temporary tabs after parsing.

## Popup

`src/popup/` shows quick status and links to ITA Matrix/options.

## Options

`src/options/` manages local settings.

## Shared Modules

- `itinerary.ts`: parse and normalize ITA Matrix booking details.
- `providers.ts`: local provider registry and ranking.
- `airports.ts`: airport filtering helpers.
- `storage.ts`: settings defaults and persistence.
- `backendClient.ts`: optional hosted metadata client with silent fallback.
- `currencyRates.ts`: public USD FX-rate fetch/cache helper for approximate revenue-based mileage conversion.
- `mileageEarnings.ts`: compact offline earnings estimates plus outbound Where to Credit link helpers.

## Mileage Earning Snapshot

The extension bundles a compact generated snapshot at `src/shared/data/mileage-earning.json`.

It is used to show rough earning estimates such as:

- distance x earning percentage
- fare x revenue multiplier, with non-USD base fares converted through a one-day cached public FX snapshot and labeled
  as approximate
- fixed miles

This snapshot should be generated only from approved airline/program public earning charts, licensed datasets, or curated
Mu Travel reference data. Where to Credit should be treated as an outbound lookup destination, not as the source copied
into the extension. Snapshot refresh automation is tracked in GitHub issue #7.
