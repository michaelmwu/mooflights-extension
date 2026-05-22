# Extension Runtime

## Manifest

The extension targets Manifest V3 and currently requests:

- `storage`
- `clipboardWrite`
- required host access for `https://matrix.itasoftware.com/*`
- optional host access for `https://travel.mu-travel.com/*`

Dev builds also add required host access for `https://travel.mu-travel.com/*`, `http://localhost/*`, and
`http://127.0.0.1/*` so local/backend metadata debugging can work without runtime permission prompts.

## Content Script

`src/content/itaMatrixContent.ts` injects a Shadow DOM panel into ITA Matrix. It:

- Preserves an F8 shortcut for clearing active ITA airport chips.
- Captures ITA Matrix JSON via Copy as JSON when possible.
- Supports manual JSON paste fallback.
- Renders ranked provider links.
- Provides airport-code filtering, insert, and copy actions.

## Popup

`src/popup/` shows quick status and links to ITA Matrix/options.

## Options

`src/options/` manages local settings.

## Shared Modules

- `itinerary.ts`: parse and normalize ITA Matrix booking details.
- `providers.ts`: local provider registry and ranking.
- `airports.ts`: airport filtering helpers.
- `storage.ts`: settings defaults and persistence.
- `backendClient.ts`: optional hosted metadata client with silent fallback.
- `wheretocredit.ts`: compact offline earnings estimates plus outbound Where to Credit link helpers.

## Mileage Earning Snapshot

The extension bundles a compact generated snapshot at `src/shared/data/mileage-earning-compact.json`.

It is used to show rough earning estimates such as:

- distance x earning percentage
- fare x revenue multiplier
- fixed miles

This snapshot should be generated only from approved airline/program public earning charts, licensed datasets, or curated
Mu Travel reference data. Where to Credit should be treated as an outbound lookup destination, not as the source copied
into the extension. Snapshot refresh automation is tracked in GitHub issue #7.
