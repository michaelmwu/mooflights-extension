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
