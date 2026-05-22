# Mu Travel Flights Extension

Offline-first Chrome/Arc extension for ITA Matrix power users.

The first MVP helps with:

- Capturing ITA Matrix itinerary JSON.
- Opening prefilled Where to Credit links.
- Ranking curated booking links by local confidence.
- Filtering and inserting airport codes.
- Keeping settings local by default.

The extension is AGPL-3.0-only open-source software owned by Mu Travel LLC. The optional hosted Mu Travel backend is separate closed-source infrastructure.

## Quickstart

```sh
bun install
bun run build
```

Load `dist/` as an unpacked extension from `chrome://extensions`.

For development:

```sh
bun run dev
```

Reload the unpacked extension after rebuilds.

## Common Commands

```sh
bun run check
bun run typecheck
bun run test
bun run package
```

## Docs

- [Development](./DEVELOPMENT.md)
- [Architecture](./ARCHITECTURE.md)
- [Contributing](./CONTRIBUTING.md)
- [Backend contract](./docs/backend-contract.md)
- [Data imports](./docs/data-imports.md)
- [Extension runtime](./docs/extension-runtime.md)
- [Deferred issues](./docs/deferred-issues.md)
