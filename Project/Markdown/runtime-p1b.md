# Runtime P1B: Core Schema + Keytar + Packaged Migration Safety

This document tracks the P1B implementation in `Project/electron/backend`.

## What Was Added

1. Keytar-backed secret storage integration with backend selection and status introspection.
2. Typed secret backend-unavailable error surface.
3. Core runtime migration `002_core_runtime.sql`:
    - conversations
    - threads
    - tags
    - thread_tags
    - diffs
4. Generated migration bundle (`generatedMigrations.ts`) consumed by runtime migration execution.
5. New persistence stores:
    - `conversationStore`
    - `tagStore`
    - `diffStore`
6. Runtime snapshot extension with:
    - `conversations`
    - `threads`
    - `tags`
    - `threadTags`
    - `diffs`
7. Runtime contract addition:
    - `ContextBudget`

## Packaging-Safe Decisions

1. Runtime no longer reads migration SQL from filesystem paths.
2. Migration SQL is bundled in compiled code via generated module.
3. `electron-builder` now explicitly unpacks native runtime modules:
    - `better-sqlite3`
    - `keytar`
4. Packaging file list excludes tests and non-runtime docs folders.

## Build Guardrails

1. `scripts/generate-migrations.ts` can write or validate generated migration module.
2. `pnpm run check:migrations` is required by `build` and `typecheck`.
3. Stale or missing generated migration module now fails those checks.

## Deferred To Next Step

1. Full Kilo parity schema (rulesets/skillfiles/marketplace/account/org snapshots).
2. Provider auth/token refresh workflows.
3. Provider request transport execution.
4. Cloud sync and renderer consumption of expanded snapshot slices.
