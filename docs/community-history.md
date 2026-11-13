# Community flight history

Community history is an optional shared dataset in the separate MooFlights backend. It is disabled by default and is not required for country comparisons, ITA parsing, mileage estimates, or booking links.

In Options, enable the single **Help improve MooFlights** control. It covers flight contributions and basic feature usage together, with a short explanation and privacy link. It is off by default; earlier flight-only consent must be confirmed again for `community-v2`. Chrome asks for access to `https://app.mooflights.com` only. Dev builds also expose an API-origin override; HTTP is accepted for localhost development. Once configured, disable sharing and delete history before changing the service origin, so the deletion credential stays usable.

## Country and OTA history

Only completed, fresh Google Flights booking comparisons are contributed. Cancelled runs and results restored from the short-lived comparison cache are not uploaded. Each observation contains every itinerary slice and date, carrier codes, cabin, currency, baseline country, and country results. Each country includes the provider name, price and direct-airline flag for each valid offer. Booking links, Google URLs, page text and account details are excluded. Mixed-currency offers are excluded rather than converted.

Before a comparison, the extension asks for historical country recommendations for the route, carrier set, cabin and trip type. Recommendations reorder the countries the user selected; they do not add countries or skip the rest. The backend compares relative prices within each historical comparison, considers the last 90 days, and limits influence to one recent vote per country and contributor credential. At least three distinct contributor credentials must support a country before it is recommended. OTA names are retained separately from carrier codes, and provider summaries also require three contributor credentials.

Recommendation queries need a Google Flights `tfs` route and carrier codes. For one-way search pages without carriers in the URL, up to three carrier combinations are read from exact result-row itinerary identities and their recommendations are averaged. Pages lacking these identities retain their existing country order. Search-page rows do not contribute country-price training data in v1: booking pages provide the known itinerary and OTA details needed for comparable samples. Skyscanner is unchanged.

## Booking-class estimates

ITA captures contribute confirmed, single-letter booking classes and available fare bases. The first version accepts only single-passenger, one-way itineraries with one segment, known cabin, currency and total price. It avoids allocating round-trip or connection totals to individual segments. Predictions are never submitted as training labels.

Google Flights search rows show an estimated-class label and a mileage range for the preferred frequent-flyer program. Equal earnings across plausible classes collapse to one amount; missing class data is shown as unavailable rather than zero. The row must expose exact airports, carrier, flight number and departure date through its itinerary identity. The page must also expose an explicit single-adult/passenger label in English. Missing identity, unsupported passenger context, connections, round trips, or insufficient history produce no hint.

The backend matches route, carrier, cabin and currency, within 5% of the observed price and 14 days of comparable booking lead time. It considers observations received in the last 90 days, with one vote per contributor credential. Returned candidates need at least three supporting credentials. These are descriptive historical shares, not calibrated probabilities or verified booking classes. Verify the class and fare rules before booking or relying on mileage earnings.

“Compare classes” opens a keyboard-accessible panel with the plausible classes, their earnings for one consistent program, and local class/program selectors. A most-likely label indicates historical ordering; the UI does not show historical agreement as a calibrated probability. Manual selections are marked as previews and stay on that flight's page instance. They do not change saved preferences, historical predictions, or training data. Named interaction events can be sent under the community opt-in, without the selected class or program values. Escape closes the panel and restores focus; turning off sharing removes both row hints and open previews.

The preview reuses the extension's local mileage rules and selected program tiers. It never treats Google's tax-inclusive total as an eligible base fare for revenue-based earning. Such programs display “Eligible fare needed.” “Check in ITA Matrix” prefills the exact flight, cabin and date without assuming the previewed booking class is confirmed.

The extension limits concurrent fare requests to three and queries at most 20 distinct fares per page. Responses are cached in memory; there is no persistent upload queue. API failures leave local features usable.

## Consent and deletion

The background worker owns networking and contributor credentials. Each credential maps to a stable server-side contributor UUID shared by flight observations and usage events. This identifies an installation, not a verified person. It can be associated with an account later only through verified sign-in and an explicit linking choice; there is no client-supplied account-ID field. After opt-in, it obtains a random contributor credential from the backend and stores it locally, separate from account identity. It does not require Google or MooTravel sign-in. The backend stores an HMAC digest of the credential.

Disabling sharing stops new history requests and cancels outstanding requests. The delete action also disables sharing, revokes the credential and deletes the contributor's raw market observations, fare observations and usage events. If deletion fails, the extension keeps the credential so the user can retry. Clearing extension storage or uninstalling removes the credential; delete shared history first if you want the server-side data removed. Raw observations are retained until deleted; recommendation queries use a 90-day lookback.

## Deployment

The API lives in the private `michaelmwu/mooflights-backend` repository. Apply its Alembic migrations and configure `DATABASE_URL` and a production `CONTRIBUTOR_TOKEN_PEPPER` on the server. The extension receives neither value. The extension's API URL is independent of the existing dev-only provider-metadata settings.

A working HTTPS hostname is required before enabling shared history for users. The default service origin is `https://app.mooflights.com`; dev builds can override it.

## Product usage

The same opt-in covers comparison start/completion, requested/completed/ready country counts, duration/outcome, and fare-preview opens, class/program changes and ITA verification clicks. Events include a fresh comparison-run ID, extension version and browser family. They exclude routes, country codes, prices, selected preview values, account identifiers and page text. Analytics failures never block a feature, and events have no durable upload queue. The contributor ID is resolved by the server from the credential, rather than supplied as a claimed identity in event bodies.

Firefox declares optional website content, search terms and technical/interaction collection. Its built-in data permissions are requested with the host permission when the user enables sharing, and checked before data requests. Older Firefox versions use the same default-off in-product consent. Revoking native collection permission stops contributions even if the local setting is still enabled. See [Mozilla’s built-in consent documentation](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/) for the taxonomy and runtime feature detection.
