# Runtime P1C: Breaking Foundation Hardening

This document tracks the P1C implementation in `Project/electron`.

## What Was Added

1. Channel-scoped runtime persistence roots:
    - `userData/runtime/stable/neonconductor.db`
    - `userData/runtime/beta/neonconductor.db`
    - `userData/runtime/alpha/neonconductor.db`
2. Startup channel source-of-truth switched to persisted updater channel (fallback: `stable`).
3. New migration `003_p1c_runtime_foundation.sql`:
    - adds `workspace_fingerprint` to `sessions` and `conversations`
    - migrates settings profile IDs from legacy `__global__` to `profile_local_default`
    - rebuilds `settings` with explicit `profile_id` requirement
4. Default profile baseline:
    - seeded profile `profile_local_default`
    - provider defaults now profile-scoped
5. Runtime reset contract and backend implementation:
    - `runtime.reset` with `workspace`, `workspace_all`, `profile_settings`, `full`
    - dry-run and explicit confirm-for-apply behavior
    - deterministic deletion counts
6. Runtime event transport shift:
    - added runtime event bus
    - added `runtime.subscribeEvents`
    - removed polling route usage path (`runtime.getEvents`)
7. Fail-closed stub cleanup:
    - `tool.invoke` now returns explicit `not_implemented`
    - `mcp.connect`/`mcp.disconnect` now return explicit `not_implemented`
8. Renderer infra only (no end-user runtime UI):
    - runtime event stream store and bootstrap subscription wiring in provider layer

## Breaking Changes

1. `runtime.getEvents` removed in favor of `runtime.subscribeEvents`.
2. Provider default routes now require `profileId`.
3. Session creation with `scope = workspace` now requires `workspaceFingerprint`.
4. Tool/MCP mutation behavior changed from fake-success to fail-closed `not_implemented` responses.

## Deferred To Next Step

1. Full Kilo parity schema expansion (rulesets, skillfiles, marketplace, account/org snapshots).
2. Real MCP transport lifecycle (connect/disconnect/auth execution) behind current fail-closed contracts.
3. Real tool execution runtime replacing `not_implemented` responses.
4. Provider auth/token refresh and request transport execution.
5. Cloud session implementation remains deferred to roadmap `P11`.
