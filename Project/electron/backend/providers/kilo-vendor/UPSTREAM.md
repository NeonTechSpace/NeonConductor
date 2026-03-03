# Kilo Vendor Provenance

- Upstream repository: https://github.com/Kilo-Org/kilocode
- Upstream package root: `packages/kilo-gateway`
- Import intent: provider gateway contract parity for P2A (auth headers, model/provider discovery, cloud session helper reference)
- Imported files (adapted):
    - `src/api/constants.ts` -> `constants.ts`
    - `src/headers.ts` -> `headers.ts`
    - `src/api/models.ts` -> `models.ts`
    - `src/cloud-sessions.ts` -> `cloudSessions.ts`
    - Additional local helper: `providers.ts` (gateway `/providers` endpoint parser)
- Notes:
    - Code is intentionally adapted to existing NeonConductor lint/type constraints.
    - `cloudSessions.ts` is vendored for parity reference only in P2A; runtime cloud flows remain deferred to P11.
