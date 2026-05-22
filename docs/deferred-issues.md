# Deferred GitHub Issues

These items are intentionally out of the ITA Matrix MVP.

## Google Flights Companion

Add a Google Flights content script that captures search context and renders miles-crediting annotations near flight cards.

## ITA Results Page Earnings

On `matrix.itasoftware.com/flights`, detect rendered result cards and show approximate miles earnings per option before the user opens an itinerary detail page.

## Account Sync

Add Google sign-in through the private Mu Travel backend and sync preferences across browsers.

## Provider Feedback

Let users mark whether provider links reproduced the expected fare and submit feedback to the backend.

## Direct Airline Booking Links

Build a maintained database of airline direct booking/search URL formats. Prefer backend-delivered metadata for
carrier-specific rules so the open extension does not bundle brittle commercial routing knowledge.

Candidate seed sources:

- IATA current airline members: preferred source for active airline code/name data.
- Wikipedia list of airline codes: import only rows with valid two-character IATA codes and real airline article links;
  skip rows without IATA codes or links that point to index/list-style pages.

Add local importer scripts that generate reviewed JSON snapshots and reports. The backend can own the canonical refresh
pipeline, but the extension repo still needs deterministic scripts to reproduce public fallback snapshots.

## Preferred Frequent-Flyer Programs

Let users rank the frequent-flyer programs they actually use, then prefer those programs in miles-credit guidance instead
of always showing the absolute highest earning option. This requires expanding the bundled/backend Where to Credit snapshot
beyond top-program fields.

## Opened OTA Page Checks

When a user opens a provider page and grants host permission, inspect the page for rough flight/price match signals. Do not automate headless backend probing in this phase.

## Verified OTA Deep Links

Re-add OTA/provider links such as Skyscanner and Expedia only after their current URL formats are verified against live pages and covered by fixtures.

## Affiliate Routing

Add transparent affiliate routing controlled by backend config and local user opt-out.

## Full Airport Dataset Pipeline

Replace the small seed dataset with a documented source/update pipeline and generated extension-safe JSON.

## Where to Credit Snapshot Pipeline

Document and automate refreshing the extension-safe mileage earning snapshot from approved reference data.
