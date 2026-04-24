# AGENTS.md

## Project Stage

- NeonConductor is in active alpha development.
- `Research/Repair-First Stabilization Track.md` is closed; normal first-alpha feature work may continue while `check:repair-first` remains clear.
- Prefer the best long-term architecture over temporary compatibility.
- Breaking changes are allowed when they remove bad patterns, collapse unnecessary complexity, or establish cleaner boundaries.
- Do not preserve unstable APIs, weak abstractions, or legacy behavior just to avoid churn.
- Persistence is also in alpha rebaseline mode: rewrite the single canonical baseline migration instead of adding numbered migration files until first alpha is complete.

## Repair-First Priority

- Check `Research/Repair-First Stabilization Track.md` before starting new feature work.
- If `check:repair-first` regresses or new unresolved `P0` or `P1` repair-first items are opened, do not add unrelated feature scope unless the user explicitly approves the override.
- Security, fail-closed runtime boundaries, code-health tooling, verification, and documentation updates that preserve the repair-first baseline are always allowed.
- Keep ordinary first-alpha roadmap work unblocked only while the repair-first baseline remains clear.

## Core Delivery Rules

- Optimize for clarity, traceability, and changeability in every touched area.
- Keep names intention-revealing. Prefer full names like `workspaceContext`, `permissionRequest`, and `selectedRunId`.
- Treat convenience slop as a defect. Remove smells instead of coding around them.
- Once a plan or acceptance criteria is approved, implement it fully unless the user approves a change.
- Do not silently narrow scope to “mostly works,” “typechecks,” or “passes the happy path.”
- Leave the touched area clearer than you found it.

## Testing And Regression Rules

- Add tests when they protect meaningful behavior, bug fixes, security boundaries, data contracts, persistence or migration logic, permissions, execution-root handling, parsing or validation, or non-obvious state transitions.
- Do not add tests just because code changed, to chase coverage, to snapshot stable markup, or to assert implementation details that do not define user-visible behavior or a durable subsystem contract.
- A regression test must name the bug or invariant it protects and should fail against the broken behavior. If it would have passed before the fix, it is not a regression test.
- Test at the narrowest useful public boundary: parser, validator, service/store contract, runtime policy, or user workflow. Prefer real collaborators or maintained fakes over broad mocks.
- Keep tests focused and readable. Include only details relevant to the asserted behavior; avoid scaffolding that hides cause and effect or forces future refactors to update unrelated tests.
- Existing coverage can be enough for small pure refactors when behavior is unchanged. Add explicit tests for security, persistence, permissions, execution, data-loss, and cross-boundary changes.
- Delete or rewrite low-signal tests when they reduce maintainability more than they protect logic.

## Code Organization And Navigability

- Keep files, modules, and folders focused by responsibility.
- Do not keep multi-concern or brittle files just because their LOC count looks acceptable.
- Treat oversized or smell-heavy files as a DX bug.
- Keep handwritten production source under 999 LOC where practical; 1200+ LOC requires strict cohesion review, and 1500+ LOC is a hard repair item unless it is generated or a narrow approved exception.
- Group folders by responsibility, not convenience.
- Code should be trivial to navigate and understand for humans and AI.
- Write code for a first-time reader: the entrypoint, ownership boundary, data flow, and failure path should be obvious without reading the whole feature.
- Prefer responsibility-named modules and folders over vague `utils`, `helpers`, `manager`, or catch-all files.
- Avoid cleverness, hidden coupling, action-at-a-distance side effects, and stringly conventions when explicit types or contracts would be clearer.
- Keep subsystem vocabulary consistent across code, UI copy, and `Research/Current System Blueprint.md` so new onboarders do not need to translate between names.
- When a feature becomes hard to explain in one short paragraph, split responsibilities before adding more branches or flags.
- Prefer self-explanatory code through names, boundaries, and structure before adding comments or extra docs.
- Add brief comments only when they clarify non-obvious logic, invariants, or failure modes.

## Authority Model

- Tabs are UX buckets, not the long-term authority model.
- Modes are prompt and operator packaging, not the source of workflow authority.
- Prefer explicit capability or workflow metadata over mode-key or tab-name branching for new product behavior.
- Avoid cross-cutting boolean or built-in-mode forks when a first-class contract would be clearer.
- New subsystems should have obvious entrypoints, clear contract types, and responsibility-focused folders.

## Boundary And Safety Rules

- Keep boundaries type-safe. Prefer parser or validator boundaries and explicit narrowing over broad casts.
- Use `as const` only for literal narrowing.
- If a cast is unavoidable, keep it at a validated boundary, never at mutation call sites.
- Keep stable internal IDs separate from user-facing names.
- Source code must not depend on `__tests__`, fixtures, mocks, or test-only helpers.
- Use `evlog`-backed logging and structured events.
- Use `neverthrow` `Result` flows for recoverable failures.
- Reserve `throw` for validation failures, invariants, corruption, impossible readback failures, and missing required seeded configuration.
- Do not use inline lint suppressions in handwritten source.
- Low-level filesystem I/O must enforce its execution-root authority directly; high-level path rewriting or resolver checks are not sufficient by themselves.
- Reusable shell-command approvals must not broaden authority through string-prefix matching.
- Unresolved runtime, workspace, sandbox, or execution-root contexts must be typed and fail closed instead of flowing as placeholder paths.
- Provider, MCP, or runtime secrets must not be persisted as plaintext.
- Prefer `@/web`, `@/app`, and `@/shared` imports over deep relative paths except in bundler-sensitive entry files.
- Renderer code must not import `electron` directly.
- Keep Electron hardening intact: `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
- Route external navigation through centralized guarded helpers.

## Frontend And React Rules

- React Compiler is the default optimization path. Write plain React first.
- Use local state for truly local interaction state. Do not mirror derivable state into `useState`.
- Use `useEffect` only for external synchronization, not to model user actions or repair ownership mistakes.
- Do not write `useEffect(async () => ...)`.
- Prefer `await` with `try`/`catch`/`finally` over handwritten `.then()` chains.
- If async work is intentionally fire-and-forget, route it through a fail-closed helper.
- Treat render-boundary ownership as architecture. Prefer smaller feature boundaries and local hot state over broad prop threading.
- Avoid defensive `useMemo`, `useCallback`, and `memo` unless there is a real compiler gap, identity contract, or profiling-backed reason.
- Avoid `useLayoutEffect` unless a real pre-paint DOM requirement exists and safer options fail.
- Use semantic theme tokens rather than hardcoded palette values.

## Documentation Boundary

- `AGENTS.md` is the tracked source of repo-critical agent and coding rules.
- Keep it concise enough to resist context rot, but complete enough that another AI can act safely without access to `Research`.
- Human contributor workflow, release flow, and local setup live in `Markdown/CONTRIBUTING.md`.
- Historical and architectural explanation lives in `Research`.
- The closed repair-first baseline and regression criteria live in `Research/Repair-First Stabilization Track.md`.
- Feature-affecting and subsystem-boundary changes must update `Research/Current System Blueprint.md`.
- Frontend/backend ownership changes must update the blueprint relation maps.
- Removals and deferments must be reflected in the blueprint immediately, not later.
- Do not create new markdown docs outside `Research` unless the user explicitly allows it.
- Do not commit machine-specific absolute paths in docs, tests, configs, or source.

## Context Hygiene

- Gather only the context needed to make the next correct decision; prefer targeted `rg`, focused file reads, and authoritative docs over broad repo dumps.
- Do not paste or retain large logs, generated files, lockfiles, snapshots, or full-file contents in conversation when a short summary with paths and line references is enough.
- Stop exploring once the relevant authority, boundary, and implementation shape are clear; more context is not better if it does not change the decision.
- Keep handoff and compaction notes limited to current goal, approved decisions, touched files, verification state, blockers, and next actions.
- Keep `AGENTS.md` high-signal. Put long rationale, historical background, and roadmap detail in `Research`, not in agent-critical rules.

## Practical Rule

- "Done" means the implementation matches the approved scope, behavior, refactor boundaries, cleanup expectations, and verification requirements.
- Before assuming the worktree is in a normal Git branch state, check whether `jj` is managing the workspace and whether Git is detached because of that workflow.
