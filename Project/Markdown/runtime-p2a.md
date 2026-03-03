# Runtime P2A - Provider Foundation (Breaking)

## Completed Scope

1. Added migration `005_p2a_provider_auth_foundation.sql`.
2. Added provider auth and discovery persistence domains:
    - `provider_auth_states`
    - `provider_oauth_sessions`
    - `provider_model_catalog`
    - `provider_discovery_snapshots`
3. Added backend provider adapter boundary with strict first-party allowlist:
    - `kilo`
    - `openai`
4. Added provider auth control-plane routes:
    - `provider.getAuthState`
    - `provider.setApiKey`
    - `provider.clearAuth`
    - `provider.syncCatalog`
5. Breaking contract change:
    - `provider.listModels` now requires `{ profileId, providerId }`.
6. Removed implicit provider/model fallback in new provider paths.
7. Added Kilo vendor contract boundary for gateway discovery and cloud-session helper reference.
8. Extended runtime snapshot with provider auth and discovery slices.

## Policy Clarification

1. Anthropic is unsupported as a first-party provider identity.
2. Anthropic model IDs are allowed when surfaced through supported providers (for example `kilo`).

## Deferred

1. OpenAI discovery sync is still explicit `not_implemented` in P2A.
2. OAuth/device auth flow execution remains deferred (P2 follow-up scope).
3. Cloud sessions execution remains deferred to roadmap `P11`.
