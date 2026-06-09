# Deferred GitHub Issues

These items are intentionally deferred from the first reviewable extension release.

## Google Flights Companion

The extension now includes a Google Flights booking-page country price comparison panel. Follow-up work: add
Google Flights search-results miles-crediting annotations near flight cards.

## ITA Results Page Earnings Follow-Ups

The extension now adds an estimated miles-earning column to first-page `matrix.itasoftware.com/flights` results.
Follow-up work: improve result matching beyond the first rendered page, add tests for more ITA DOM variants, and use a
richer mileage snapshot so preferred programs can be evaluated across more booking classes.

## Account Sync

Add Google sign-in through the private MooTravel backend and sync preferences across browsers.

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

The local options page can store preferred frequent-flyer programs and use them to highlight/sort matching local mileage
rows. Expand the bundled/backend mileage earning snapshot beyond top-program fields so the extension can calculate
earnings for arbitrary user-selected programs, not only programs that are already present as local top earners.

## Atmos Rewards Earning Rules

The bundled mileage estimate currently reads static earning rows from the local snapshot. Add explicit Alaska/Hawaiian
Atmos Rewards handling for rules that are not well represented by a simple percentage row:

- base members earn 1 point per mile flown or 500 points, whichever is greater, except Saver fares earn at 30%
- status bonuses apply by Atmos tier: Silver 25%, Gold 50%, Platinum 100%, Titanium 150%
- later in 2026, members can choose an earning basis once per year: distance traveled, price paid, or segments flown

Do not model the later 2026 earn-choice behavior until the rule is live and the extension can represent a user-selected
Atmos earning basis.

## Opened OTA Page Checks

When a user opens a provider page and grants host permission, inspect the page for rough flight/price match signals. Do not automate headless backend probing in this phase.

## Verified OTA Deep Links

The extension includes local fallback links for high-confidence providers plus lower-confidence Powertools-style
search links for Momondo, Skyscanner, Expedia Group sites, eDreams/Opodo/Travellink, Priceline, and CheapOair.
Trip.com and LY.com/TravelGo one-way/round-trip search fallbacks are also included without private session or
shopping tokens. Follow-up work: live-verify current URL formats, demote or hide providers with poor match rates
through backend metadata, and add provider fixtures for newly verified formats.

## Affiliate Routing

Add transparent affiliate routing controlled by backend config and local user opt-out.

## Full Airport Dataset Pipeline

Replace the small seed dataset with a documented source/update pipeline and generated extension-safe JSON.

## Mileage Earning Snapshot Pipeline

Document and automate refreshing the extension-safe mileage earning snapshot from airline/program public earning charts,
licensed datasets, or curated MooTravel reference data. Do not copy Where to Credit page contents into the extension.
