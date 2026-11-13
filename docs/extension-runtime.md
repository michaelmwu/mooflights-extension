# Extension Runtime

## Manifests

The Chrome build targets Manifest V3. The Firefox build is generated from the same source manifest as a Firefox MV2
event-page extension so it can run on Firefox versions that do not support Chrome-style MV3 background service workers.

Both generated manifests request:

- `storage`
- `clipboardWrite`
- required host access for `https://matrix.itasoftware.com/*`
- required host access for Google Flights pages on `https://www.google.com/travel/flights*` and
  `https://google.com/travel/flights*`
- required host access for daily cached public USD FX rates from `https://cdn.jsdelivr.net/*` and
  `https://api.fxratesapi.com/*`

The Firefox build also requests `tabs` because its background script reads active tab URLs while coordinating ITA Matrix
auto-open handoffs.

Dev builds also add required host access for `http://localhost/*` and `http://127.0.0.1/*` so local backend metadata
debugging can work without runtime permission prompts. Production builds do not fetch hosted backend metadata.

## Content Script

`src/content/itaMatrixContent.ts` injects a Shadow DOM panel into ITA Matrix. It:

- Preserves an F8 shortcut for clearing active ITA airport chips.
- Captures ITA Matrix JSON via Copy as JSON when possible.
- Supports manual JSON paste fallback.
- Renders ranked provider links.
- Provides airport-code filtering, insert, and copy actions.
- Auto-submits ITA Matrix `/search` only when a MooFlights handoff URL includes `mooFlightsAutoSearch=1` and the
  prefilled form has enabled the native Search button.
- Attempts to open the first visible ITA Matrix `/flights` result only when a MooFlights handoff URL includes
  `mooFlightsAutoOpen=1`.

`src/content/googleFlightsContent.ts` runs on Google Flights pages so it can survive Google Flights SPA navigation. It
injects the visible panel on booking pages and on ITA Matrix handoff itinerary pages with `source=ita_matrix`. It:

- Parses visible booking options, prices, and direct-airline markers from the current booking page.
- Lets the user start an opt-in country price comparison.
- Builds ITA Matrix `/search?search=...&mooFlightsAutoSearch=1&mooFlightsAutoOpen=1` handoff URLs from Google Flights
  booking-page data.
- Asks the background service worker to open temporary inactive Google Flights tabs with different `gl` country codes
  while preserving the current itinerary URL and currency. If the URL omits `curr`, the content script infers the
  visible currency from Google Flights price text before falling back to USD.
- Shows the cheapest offer, direct-airline offer, option count, and sparse-result retry status by country.

`src/background/serviceWorker.ts` is bundled as the Chrome MV3 service worker and as the Firefox MV2 event-page
background script. It runs the country checks with bounded concurrency, retries sparse country results once when the
baseline page is dense, and closes temporary tabs after parsing.

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
MooTravel reference data. Where to Credit should be treated as an outbound lookup destination, not as the source copied
into the extension. Snapshot refresh automation is tracked in GitHub issue #7.

## Comparison Lifecycle And Rendering

The background acknowledges a comparison immediately. Results and completion arrive through progress messages; a content-side watchdog clears an idle run after 120 seconds without progress, including recovery on focus after timer throttling. Renderer messages have five-second deadlines and can be aborted with their run.

The worker records temporary tab ownership in `chrome.storage.session`, with local-storage fallback where session storage is unavailable. Each temporary tab starts at a uniquely marked blank URL, is registered, and then navigates to its marked destination. Startup sweeps recorded leftovers, validating markers before closing tabs so reused IDs cannot close unrelated pages. Removing a source tab cancels its run. Comparison tabs answer parse/expansion messages without installing the panel, observers, navigation polling or historical-fare requests; expansion cannot re-enable UI work.

The worker serializes read-modify-write operations for comparison caches and Matrix auto-open tickets, and skips unchanged ticket writes. Provider-metadata fetches have a five-second deadline and a persisted five-minute retry interval. Local feature behavior remains the fallback.

Google Flights rendering uses a debounce with a one-second maximum wait, a cheap URL-change poll for isolated-world SPA navigation, and one parsed search snapshot per render tick. Badges, historical previews and cache restoration reuse that snapshot. Cache misses are memoized and invalidated by relevant storage changes. Debug-detail factories do no work when debugging is disabled. The stylesheet and delegated root handlers survive content renders.

## Worker Bundle Boundary

The background imports consent settings through `communitySettings.ts`; importing the complete settings/provider registry would pull airport and mileage datasets into every worker wake. Keep those datasets in content/UI entrypoints that need them.

Use `bun run build -- --metafile` (or add `--metafile` to a dev build) to write esbuild input metadata next to each generated JavaScript entry as `.meta.json`. Inspect the worker inputs when changing shared imports. In the reviewed development build, removing the heavy settings import reduced the worker from 910,189 to 79,630 bytes; neither `airports.json` nor `mileage-earning.json` is a worker input.

## FX Network Fallback

Each public FX source has a five-second fetch deadline. Same-page callers share an in-flight request, and a persisted last-attempt timestamp suppresses another attempt for 30 minutes after an unsuccessful refresh, including across page loads. Fresh cached rates still use the existing one-day TTL; a valid stale snapshot remains the fallback when both sources fail. No mileage UI waits indefinitely on a rate fetch.
