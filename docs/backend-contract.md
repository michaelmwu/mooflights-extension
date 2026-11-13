# Backend Contract

The extension is offline-first. Backend APIs are optional enhancements.

## Do Not Expose Database Credentials

Do not pass Neon/Postgres URLs, service-role keys, or SQL credentials to the extension. RLS is useful as backend defense-in-depth, but the browser extension should talk to HTTPS API endpoints only.

## Local Backend Debugging

Dev builds expose hidden developer options for pointing the extension at a local API server, for example:

- `http://localhost:48731`
- `http://localhost:3000`
- `http://localhost:8787`
- `http://127.0.0.1:48731`
- `http://127.0.0.1:3000`

This is still an API base URL. It must not be a direct Postgres URL. Use:

```sh
bun run build:dev
```

or:

```sh
bun run dev
```

Production builds hide these controls from normal users.

## Preference Sync Model

The Chrome options page remains the local/offline preference sheet. Future hosted preferences are an authenticated Mu
Travel account surface, not a replacement for local settings.

Merge direction:

- Load local `chrome.storage.local` settings immediately.
- If the user is signed in and the API is reachable, fetch hosted preferences.
- Apply hosted values only for syncable/account-level fields such as preferred frequent-flyer programs, provider
  preferences, and premium feature toggles.
- Keep local-only fields such as dev backend URL, debug controls, and immediate privacy opt-outs on the device.

The extension should continue working if preference sync fails.

## Initial Endpoint

```http
GET /api/extension/v1/providers
```

Purpose: allow the closed MooTravel backend to override public provider metadata without shipping a new extension version.

Response:

```json
{
  "providers": [
    {
      "providerId": "kayak",
      "reliabilityScore": 88,
      "knownIssues": "Optional public note",
      "disabled": false
    }
  ]
}
```

Rules:

- Missing providers keep local defaults.
- Invalid or unreachable responses are ignored.
- `disabled: true` hides that provider.
- Scores are public confidence hints, not private scoring internals.

## Future Endpoints

- `GET /api/extension/v1/me`
- `GET /api/extension/v1/settings`
- `PUT /api/extension/v1/settings`
- `POST /api/extension/v1/provider-feedback`
- `GET /api/extension/v1/entitlements`

These are intentionally deferred from the first reviewable extension release.

## Community Flight History

Community history has a separate, explicit opt-in setting, defaults to `https://app.mooflights.com`, and supports an API-origin override in dev builds. It is available in production builds only after host permission is granted. The background worker owns all requests, timeouts and the local contributor credential; it falls back to existing local behavior on failure.

Endpoints in the private backend:

- `POST /api/extension/v1/contributor-sessions` with `consentVersion: "community-v2"`, both purpose flags enabled, and `analyticsConsentVersion: "analytics-v1"` returns a random `contributorToken` and stable `contributorId`.
- `POST /api/extension/v1/market-observations` accepts a `v1` completed Google Flights booking comparison. Country results include normalized `options` with `provider`, `price` and `isDirect`, in the observation's currency.
- `POST /api/extension/v1/market-recommendations` accepts route `slices` (origin/destination), `carriers`, `cabin`, `tripType`, and selected `countries`. It returns `recommendations` containing `country`, `relativePrice`, `sampleCount` and supported `providers`.
- `POST /api/extension/v1/fare-observations` accepts `v1` confirmed ITA examples with route, carrier, cabin, departure date, currency, price, `tripType: "one-way"`, `passengerCount: 1`, flight number, booking class, and optional fare basis.
- `POST /api/extension/v1/fare-estimates` accepts the same fare context without training labels, flight number, source, version or idempotency key. It returns `status: "unknown"` and empty candidates, or `status: "historical-estimate"` with candidates containing `bookingClass`, `share` and `sampleCount`.
- `DELETE /api/extension/v1/contributor-sessions/current` revokes the credential and deletes raw market observations, fare observations and usage events.

Observation writes and deletion use `X-MooFlights-Contributor-Token`. Writes use a UUID `idempotencyKey`. Recommendation reads do not include the contributor credential. All new fare/query payloads reject unknown fields and non-finite numbers. Clients must serialize allowlisted fields, excluding page URLs, booking links and account data.

See [Community flight history](./community-history.md) for matching rules, initial limitations, consent and retention.

`GET /api/extension/v1/contributor-sessions/current` returns the credential-owned contributor ID and consent state. `PUT` updates history/analytics purpose permission; the extension exposes one control that changes both together. Legacy credentials keep their IDs and have analytics disabled until explicit opt-in.

`POST /api/extension/v1/usage-events` accepts versioned, allowlisted feature signals with extension version, browser and occurrence time. Comparison signals carry a fresh run UUID, bounded country counts, duration and outcome. Preview signals contain only the event name and surface. Unknown properties, flight details, selected class/program values and account identifiers are rejected. Writes are idempotent per credential and UUID, limited to 500 new events per hour per contributor, and return `eventId`/`duplicate`. Revocation removes events together with flight observations. Future account linking must prove both identities and obtain agreement; an email or claimed user ID is not an account-linking API.
