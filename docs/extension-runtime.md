# Extension Runtime

## Manifest

The extension targets Manifest V3 and currently requests:

- `storage`
- `clipboardRead`
- `clipboardWrite`
- host access for `https://matrix.itasoftware.com/*`

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
- `wheretocredit.ts`: compact offline earnings estimates from the bundled Where to Credit snapshot.

## Where to Credit Snapshot

The extension bundles a compact generated snapshot at `src/shared/data/wheretocredit-compact.json`.

It is used to show rough earning estimates such as:

- distance x earning percentage
- fare x revenue multiplier
- fixed miles when Where to Credit reports a fixed value

The extension does not scrape or hotlink Where to Credit at runtime. Snapshot refresh automation is tracked in GitHub issue #7.
