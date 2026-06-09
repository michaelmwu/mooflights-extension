# Contributing

Thanks for contributing to MooFlights.

## Expectations

- Keep the extension useful without a backend.
- Keep private backend rules and secrets out of this repo.
- Add tests for parsing, ranking, storage, airport helper, and link-generation changes.
- Use Bun and Biome.

## Before Opening A PR

```sh
bun install --frozen-lockfile
bun run check
bun run typecheck
bun run test
bun run build
```

## Dependency Hygiene

- Keep `bun.lock` committed and use frozen installs in CI.
- Keep the 7-day Bun dependency cooldown in `bunfig.toml` unless an urgent security fix needs a documented exception.
- Review extension permission, privacy, and offline-first impact when adding dependencies.

## Licensing

This extension is AGPL-3.0-only. By contributing, you agree that your contribution is licensed under AGPL-3.0-only.

The hosted MooTravel backend is separate infrastructure and may be closed source.
