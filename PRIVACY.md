# Privacy Policy

Last updated: November 13, 2026

This policy applies to the current MooFlights browser extension.

## Data The Extension Handles

MooFlights processes flight-search and itinerary information in the browser so it can show mileage estimates,
booking links, airport-code helpers, and Google Flights country price comparisons.

Depending on the page and features you use, this can include:

- ITA Matrix itinerary details, such as airports, dates, cabins, carriers, flight numbers, booking classes, fare basis
  codes, prices, currencies, passenger counts, and derived route distances.
- Google Flights booking-page offers visible in your browser, including prices, booking options, selected country
  markets, and temporary comparison results.
- Extension settings, such as preferred providers, hidden providers, frequent-flyer program preferences, Google Flights
  country selections, airport-helper filters, and debug settings.

The extension may write text to your clipboard when you use copy actions. It does not read your clipboard.

## How The Data Is Used

The extension uses this data to:

- Render the ITA Matrix and Google Flights companion panels.
- Estimate mileage earnings from local extension data.
- Build prefilled links to booking, search, and mileage-crediting websites.
- Compare selected Google Flights country pages.
- Save your extension preferences locally.
- When you explicitly enable Community flight history, contribute flight observations to the configured service and use shared history to prioritize country searches and estimate booking classes.

MooFlights does not use this data for advertising profiles or cross-site tracking. Optional first-party usage analytics helps improve the extension, under the same “Help improve MooFlights” consent as flight contributions.

MooFlights' use of user data complies with the Chrome Web Store User Data Policy, including the Limited Use
requirements.

## Storage And Retention

Extension settings and short-lived helper caches are stored locally with Chrome extension storage on your device.
Cached data is used to keep the extension responsive and avoid repeated page work. You can remove locally stored
extension data by clearing the extension's site/app data in Chrome or uninstalling the extension.

## Network Requests And Sharing

“Help improve MooFlights” is disabled by default. When you enable it and grant access to the MooFlights service, the extension sends completed Google Flights booking comparisons (routes, travel dates, carriers, cabin, country markets, currency, prices and booking-provider names) and confirmed ITA fare examples (including flight number, booking class and optional fare basis). It also sends flight context to request country recommendations and historical booking-class estimates. These payloads exclude Google URLs, booking links, account data and page text. The same consent also covers basic feature-usage events: comparison start/completion, requested/completed/ready country counts, timings and outcomes, preview opens, class/program changes and ITA verification clicks. Usage events include extension version and browser family, but not the selected class/program, route, travel date, prices or country codes.

The service assigns a pseudonymous contributor ID and issues a random contributor credential, which the extension stores locally. This is separate from Google or MooTravel account identity; the backend stores a digest rather than the credential. Raw contributions remain until deleted; recommendations use a 90-day lookback. Disable sharing to stop requests. Use “Turn off sharing and delete my contributions” to revoke the credential and delete your flight and usage contributions together. If deletion fails, the extension keeps the credential so you can retry. Delete shared history before clearing extension data or uninstalling, which removes your local deletion credential.

Without this opt-in, the extension sends neither flight observations nor usage events. Earlier consent for flight-only sharing must be confirmed again before this expanded sharing begins. A future verified sign-in could link contributions to an account only with your agreement; the extension does not send email addresses or claimed account IDs in these payloads.

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

- `storage` for local settings, caches and optional contributor credentials.
- Optional host access to the history API origin you explicitly configure and approve.
- `clipboardWrite` for user-triggered copy actions.
- Host access for ITA Matrix, Google Flights, public FX-rate sources, and bundled runtime pages listed in the extension
  manifest.

## Contact

For privacy questions about MooFlights, use the support or contact channel listed for the extension in the Chrome
Web Store, or open an issue in this repository.
