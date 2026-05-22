# Architecture

## Current Shape

The extension has four runtime surfaces:

- ITA Matrix content script: renders the companion panel and interacts with ITA result pages.
- Popup: compact status and quick links.
- Options page: local settings for provider ranking, airport defaults, backend metadata, and affiliate opt-out.
- Background service worker: extension lifecycle hooks.

Shared domain code lives under `src/shared/` and is intentionally browser-safe.

## Preference Surfaces

The product can have two preference surfaces:

- Local extension preferences: the Chrome options page. This is the MVP source of truth for offline behavior, provider
  hiding/preference, airport helper defaults, affiliate opt-out, and dev-only backend API targets. It stores data in
  `chrome.storage.local`.
- Hosted account preferences: a future Mu Travel web page backed by the private API. This should handle Google sign-in,
  cross-browser sync, account-level frequent-flyer preferences, premium entitlements, and backend-owned provider config.

When both exist, the extension should boot from local preferences first, then merge authenticated hosted preferences as an
optional overlay. Local opt-out and privacy controls should remain available even when the hosted service is unavailable.

## Offline-First Flow

1. The content script loads local settings from `chrome.storage.local`.
2. The user captures ITA Matrix "Copy as JSON" output or pastes it manually.
3. Shared itinerary code normalizes slices, segments, fare carriers, fare bases, booking classes, price, and trip type.
4. Provider ranking combines local provider definitions with optional remote provider metadata.
5. The panel renders Where to Credit, verified booking, and utility links.
6. Airport helper filters local airport data and inserts or copies airport codes.

If the backend is disabled or unavailable, steps 1-6 still work.

## Backend Boundary

The private Mu Travel backend may provide:

- Google sign-in via Better Auth.
- Neon Postgres-backed accounts and synced preferences.
- Provider reliability metadata.
- User feedback aggregation.
- Affiliate routing configuration.
- Premium subscription and entitlement logic.

The extension should consume only stable HTTPS APIs. It must not contain direct database credentials, OAuth secrets, service-role tokens, or private commercial logic.

## Provider Metadata Contract

Initial endpoint:

```http
GET /api/extension/v1/providers
```

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

The local provider registry remains the fallback source of truth.
