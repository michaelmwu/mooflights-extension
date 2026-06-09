# MooFlights Extension

MooFlights is a Chromium-compatible browser extension for mileage earning estimates, Google Flights country price checks, and ITA Matrix workflows.

It helps with:

- Show estimated mileage earnings in the ITA companion panel and first-page search results.
- Compare Google Flights booking-page offers across selected countries while keeping currency fixed.
- Open prefilled Where to Credit links for fare-class lookup.
- Rank curated booking links by local confidence.
- Filter and insert airport codes on ITA search pages.

The extension is AGPL-3.0-only open-source software owned by Mu Travel LLC. The optional hosted MooTravel backend is separate closed-source infrastructure.

## Google Flights Country Comparison

On Google Flights booking pages, the extension can compare booking offers across your selected country markets while keeping the displayed currency fixed. This helps surface cases where the same itinerary is cheaper from another country page, while still showing the direct airline price for comparison.

![MooFlights Google Flights country comparison panel](./docs/assets/google-flights-country-comparison.png)

## ITA Matrix Mileage Earnings

On ITA Matrix itinerary pages, the extension estimates mileage earning from the captured booking class, fare, and local earning snapshot. Revenue-based programs can use FX estimates when ITA prices the fare in a non-USD currency.

![MooFlights ITA Matrix mileage earnings panel](./docs/assets/ita-matrix-mileage-earnings.png)

## Quickstart

For manual Chrome installation, check the [latest release](../../releases/latest) and download the packaged extension.

```sh
bun install --frozen-lockfile
bun run build
```

Load `dist/` as an unpacked extension from `chrome://extensions`.

For development:

```sh
bun run dev
```

Reload the unpacked extension after rebuilds.

For browser-extension E2E tests:

```sh
bunx playwright install chromium
bun run test:e2e
```

The default Playwright suite builds and loads `dist/` into Playwright's bundled Chromium, then uses routed ITA Matrix and Google Flights fixture pages so CI does not hit real travel sites. During local development, prefer these Playwright tests for repeatable extension QA before falling back to manual Chrome checks.

To smoke-test real sites locally, run:

```sh
bun run test:e2e:real
MU_TRAVEL_REAL_GOOGLE_FLIGHTS_BOOKING_URL="https://www.google.com/travel/flights/booking/..." bun run test:e2e:real
MU_TRAVEL_REAL_COMPARE_E2E=1 bun run test:e2e:real
```

The Google Flights smoke test defaults to a generated future-dated one-way TPE-NRT booking URL. Set `MU_TRAVEL_REAL_GOOGLE_FLIGHTS_BOOKING_URL` to override it with a copied booking URL. The real compare-flow smoke starts from US and opens CA and ZA comparison tabs only when `MU_TRAVEL_REAL_COMPARE_E2E=1` is set. Real-site tests are opt-in because Google/ITA can change markup, rate-limit, or show bot-detection interstitials.

## Common Commands

```sh
bun run check
bun run typecheck
bun run test
bun run test:e2e
bun run package
bun run release:package:next-patch
bun run release:package:next-minor
```

## Docs

- [Development](./DEVELOPMENT.md)
- [Architecture](./ARCHITECTURE.md)
- [Contributing](./CONTRIBUTING.md)
- [Privacy policy](./PRIVACY.md)
- [Security policy](./SECURITY.md)
- [Backend contract](./docs/backend-contract.md)
- [Data imports](./docs/data-imports.md)
- [Extension runtime](./docs/extension-runtime.md)
- [Dependency supply chain](./docs/supply-chain.md)
- [Deferred issues](./docs/deferred-issues.md)
