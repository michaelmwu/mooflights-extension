# Data Imports

The extension should not hand-edit generated reference data. Use local scripts to produce deterministic snapshots, then
review the diff before committing.

## Ownership Split

- Extension repo: reproducible import scripts, compact public fallback snapshots, fixture checks, and generated reports.
- Mu Travel backend: canonical refresh jobs, richer private metadata, reliability scoring, affiliate/direct-link rules, and
  account-specific preference data.

The extension must keep working without the backend, but it should not bundle every private or brittle commercial rule.

## Suggested Scripts

- `bun run data:wheretocredit`: rebuild the compact Where to Credit snapshot from approved reference data.
- `bun run data:airlines`: rebuild public airline code/name fallbacks from approved sources.
- `bun run data:verify`: validate generated snapshots, fail on duplicate codes, missing names, invalid URLs, and oversized
  output.

## Airline Code Sources

Candidate sources:

- ITA Matrix itinerary JSON: best runtime source for the current itinerary carrier display name.
- IATA current airline members: preferred source for active airline code/name data.
- Wikipedia list of airline codes: supplemental source. Keep only rows with valid two-character IATA codes and airline
  names that link to real airline article pages, not index/list/disambiguation-style pages.

Generated airline snapshots should include source attribution and a `fetched_at` timestamp.
