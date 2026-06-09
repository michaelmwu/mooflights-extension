# AGENTS.md

## Project

This repo contains the open-source MooFlights browser extension. Work in this repo should keep the extension offline-first and avoid coupling core ITA Matrix functionality to the hosted backend.

## Commands

- Use Bun: `bun install`, `bun run build`, `bun run test`, `bun run typecheck`.
- Use Biome for formatting and linting: `bun run check`, `bun run format`, `bun run lint`.
- For Chrome debugging, prefer `bun run dev:stable` or `bun run build:stable` so the unpacked extension keeps using the canonical repo-root `dist/`; loading a workspace-local `dist/` can make Chrome treat it as a separate extension and lose local preferences.
- Build output goes to `dist/`; packaged zips go to `artifacts/`.

## Security Boundary

- Never place `POSTGRES_URL`, service-role keys, OAuth client secrets, affiliate secrets, or premium entitlement logic in extension code.
- The extension may call public/versioned MooTravel API endpoints, but must gracefully fall back to local behavior.
- Direct browser-to-Postgres access is out of scope even with RLS.

## Ownership

Mu Travel LLC owns product, backend, store listing, data, affiliate relationships, and revenue. The extension source is AGPL-3.0-only. Backend code is intentionally separate and may remain closed source.
