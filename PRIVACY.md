# Privacy Policy

Last updated: May 31, 2026

This policy applies to the current Mu Travel Flights browser extension.

## Data The Extension Handles

Mu Travel Flights processes flight-search and itinerary information in the browser so it can show mileage estimates,
booking links, airport-code helpers, and Google Flights country price comparisons.

Depending on the page and features you use, this can include:

- ITA Matrix itinerary details, such as airports, dates, cabins, carriers, flight numbers, booking classes, fare basis
  codes, prices, currencies, passenger counts, and derived route distances.
- Google Flights booking-page offers visible in your browser, including prices, booking options, selected country
  markets, and temporary comparison results.
- Extension settings, such as preferred providers, hidden providers, frequent-flyer program preferences, Google Flights
  country selections, airport-helper filters, debug settings, and affiliate opt-out state.

The extension may write text to your clipboard when you use copy actions. It does not read your clipboard.

## How The Data Is Used

The extension uses this data to:

- Render the ITA Matrix and Google Flights companion panels.
- Estimate mileage earnings from local extension data.
- Build prefilled links to booking, search, and mileage-crediting websites.
- Compare selected Google Flights country pages.
- Save your extension preferences locally.

Mu Travel Flights does not use the current production extension build for analytics, advertising profiles, or user
tracking.

## Storage And Retention

Extension settings and short-lived helper caches are stored locally with Chrome extension storage on your device.
Cached data is used to keep the extension responsive and avoid repeated page work. You can remove locally stored
extension data by clearing the extension's site/app data in Chrome or uninstalling the extension.

## Network Requests And Sharing

The current production extension build does not send your itinerary details, booking options, or saved preferences to Mu
Travel servers.

The extension does make normal browser requests needed for its current features:

- It runs on ITA Matrix and Google Flights pages you visit and may open temporary Google Flights tabs for selected
  country comparisons.
- It fetches public foreign-exchange rate data from `https://cdn.jsdelivr.net/*` and `https://api.fxratesapi.com/*` to
  support approximate currency conversion in mileage estimates.
- When you choose to open generated provider, airline, online-travel-agency, ITA Matrix, Google Flights, or mileage
  crediting links, those destination websites receive the URL and request information needed to load their pages.

Mu Travel LLC does not sell the personal data handled by the extension. Mu Travel LLC does not share that data with third
parties except when you choose to open a third-party website from the extension, or when Chrome and the websites you
visit necessarily process normal browser requests.

Third-party websites are governed by their own privacy policies.

## Permissions

The extension requests only the permissions needed for the current feature set:

- `storage` for local settings and caches.
- `clipboardWrite` for user-triggered copy actions.
- `tabs` for opening and managing comparison tabs.
- Host access for ITA Matrix, Google Flights, public FX-rate sources, and bundled runtime pages listed in the extension
  manifest.

## Contact

For privacy questions about Mu Travel Flights, use the support or contact channel listed for the extension in the Chrome
Web Store, or open an issue in this repository.
