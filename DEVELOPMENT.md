# Development

## Setup

```sh
bun install
```

## Build And Load

```sh
bun run build
```

Then open Chrome or Arc:

1. Go to `chrome://extensions`.
2. Enable Developer Mode.
3. Click "Load unpacked".
4. Select this repo's `dist/` directory.
5. Open `https://matrix.itasoftware.com/`.

For iterative work:

```sh
bun run dev
```

`bun run dev` creates a dev build and watches source files. Reload the unpacked extension after rebuilds.

For a one-shot dev build:

```sh
bun run build:dev
```

Dev builds expose an options-page "Developer Backend" section for pointing the extension at a locally running API such as `http://localhost:3000`. Production builds hide this section.

Prefer a stable high port for the backend when you are not intentionally running multiple backend worktrees:

```env
PORT=48731
APP_URL=http://localhost:48731
```

Then set the extension dev backend URL to `http://localhost:48731`. If Conductor assigns a different worktree port, use the custom URL field in the Developer Backend section.

## Checks

```sh
bun run check
bun run typecheck
bun run test
```

## Packaging

```sh
bun run package
```

This writes `artifacts/mu-travel-flights.zip`.

Before cutting a release, keep `package.json` and `src/manifest.json` versions in sync:

```sh
bun run release:verify
```

## GitHub Workflows

- `CI`: runs on pull requests and pushes to `main`; installs with Bun, runs Biome, typecheck, tests, and production build.
- `Release Extension Package`: runs manually or on `v*` tags; verifies the repo, checks the release tag matches the extension version, builds `artifacts/mu-travel-flights.zip`, uploads the package artifact, and attaches it to a GitHub release. Manual runs can omit `release_tag` to build only, or provide an existing `vX.Y.Z` tag to create/update a draft release.

The release workflow intentionally does not publish to the Chrome Web Store yet. Until Mu Travel has an approved
developer account and store automation credentials, store submission remains manual and outside GitHub Actions.

Neither workflow needs backend secrets. The extension build must not read `.env`.

## Chrome Extension Notes

- `src/manifest.json` is copied into `dist/manifest.json`.
- Content scripts are bundled as IIFEs because Chrome loads them as plain files from the manifest.
- The background service worker is bundled as ESM.
- Popup and options pages are static HTML files plus bundled React entrypoints.
- Static data that must work offline belongs in `src/shared/data/`.
- Backend debugging still goes through HTTP API endpoints. Do not put `POSTGRES_URL` or direct database credentials into extension settings.
