# AGENTS.md

## Project Stage

- NeonConductor is in active alpha development.
- Prefer the best long-term architecture over temporary compatibility.
- Breaking changes are allowed when they remove bad patterns, collapse unnecessary complexity, or establish cleaner boundaries.
- Do not preserve unstable APIs, weak abstractions, or legacy behavior just to avoid churn.
- Persistence is also in alpha rebaseline mode: rewrite the single canonical baseline migration instead of adding numbered migration files until first alpha is complete.

## Core Delivery Rules

- Optimize for clarity, traceability, and changeability in every touched area.
- Keep names intention-revealing. Prefer full names like `workspaceContext`, `permissionRequest`, and `selectedRunId`.
- Treat convenience slop as a defect. Remove smells instead of coding around them.
- Once a plan or acceptance criteria is approved, implement it fully unless the user approves a change.
- Do not silently narrow scope to “mostly works,” “typechecks,” or “passes the happy path.”
- Leave the touched area clearer than you found it.

## Code Organization And Navigability

- Keep files, modules, and folders focused by responsibility.
- Do not keep multi-concern or brittle files just because their LOC count looks acceptable.
- Treat oversized or smell-heavy files as a DX bug.
- Group folders by responsibility, not convenience.
- Code should be trivial to navigate and understand for humans and AI.
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
- Do not create new markdown docs outside `Research` unless the user explicitly allows it.
- Do not commit machine-specific absolute paths in docs, tests, configs, or source.

## Practical Rule

- "Done" means the implementation matches the approved scope, behavior, refactor boundaries, cleanup expectations, and verification requirements.
- Before assuming the worktree is in a normal Git branch state, check whether `jj` is managing the workspace and whether Git is detached because of that workflow.
