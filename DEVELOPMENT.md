# Development

## Setup

```sh
bun install
```

## Build And Load

```sh
bun run build
```

Then open Chrome or another Chromium-compatible browser:

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

This writes `artifacts/mu-travel-flights.zip` and `artifacts/mu-travel-flights.crx`. The CRX step requires Google Chrome or Chromium; set `CHROME_BIN` if it is not in a standard location. Set `MU_TRAVEL_CRX_KEY_PATH` or `MU_TRAVEL_CRX_KEY_B64` when a stable CRX key is needed; otherwise Chrome generates a throwaway package key during packaging.

To prepare the next unused patch release version from the latest local `vX.Y.Z` tag or checked-in version:

```sh
bun run release:next-patch
```

To prepare that version and package it in one step:

```sh
bun run release:package:next-patch
```

To prepare the next unused minor release version, such as `0.1.0` after `0.0.x`:

```sh
bun run release:next-minor
```

To prepare that minor version and package it in one step:

```sh
bun run release:package:next-minor
```

Before cutting a release, keep `package.json` and `src/manifest.json` versions in sync:

```sh
bun run release:verify
```

## GitHub Workflows

- `CI`: runs on pull requests and pushes to `main`; installs with Bun, runs Biome, typecheck, tests, and production build.
- `Release Extension Package`: runs manually or on `v*` tags; verifies the repo, checks the release tag matches the extension version when provided, builds `artifacts/mu-travel-flights.zip` and `artifacts/mu-travel-flights.crx`, uploads both package artifacts, and attaches them to a GitHub release. Manual runs can omit `release_tag` to build only, use the default `next_patch` strategy to package the next unused patch version as a build artifact, choose `next_minor` for a `0.1.0`-style bump, or provide an existing `vX.Y.Z` tag to create/update a draft release.

The release workflow intentionally does not publish to the Chrome Web Store yet. Until Mu Travel has an approved
developer account and store automation credentials, store submission remains manual and outside GitHub Actions.

Neither workflow needs backend secrets. The extension build must not read `.env`.

## Stable Unpacked Extension Path

Chrome keys unpacked-extension storage to the loaded extension identity, and loading `dist/` from a different Conductor workspace can make Chrome treat it as a different extension. To keep settings while archiving and recreating workspaces, use the stable build target:

```sh
bun run dev:stable
```

In a linked worktree, this writes to the canonical repo root `dist/` instead of the workspace `dist/`. Load that canonical `dist/` once in Chrome's extension page and reload it after workspace builds. The checked-in Conductor Run script uses `bun run dev:stable` and is marked non-concurrent so two workspaces do not race to write the same extension directory.

## Chrome Extension Notes

- `src/manifest.json` is copied into `dist/manifest.json`.
- Content scripts are bundled as IIFEs because Chrome loads them as plain files from the manifest.
- The background service worker is bundled as ESM.
- Popup and options pages are static HTML files plus bundled React entrypoints.
- Static data that must work offline belongs in `src/shared/data/`.
- Backend debugging still goes through HTTP API endpoints. Do not put `POSTGRES_URL` or direct database credentials into extension settings.
