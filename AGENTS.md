# AGENTS.md

## Project Stage
- NeonConductor is in active alpha development.
- The app is not installed for real users yet, so compatibility preservation is not the default priority.
- Prefer the best architecture over temporary compatibility: breaking changes are allowed and often desirable when they remove bad patterns, collapse unnecessary complexity, or establish cleaner long-term boundaries.
- Do not carry forward unstable APIs, weak abstractions, or legacy behavior just to avoid churn during alpha.
- When a simpler or more correct design requires reshaping contracts, storage, flows, or UI assumptions, make the breaking change and update the surrounding code coherently.
- Optimize for the codebase we want to keep, not the intermediate shape we happen to have today.
- Persistence migrations are also in alpha-rebaseline mode: do not add new SQL migration files until the first alpha is done.
- Until that milestone, rewrite the single canonical baseline migration instead of growing a numbered migration chain.

## Engineering Standard

### 1) Optimize for Clarity and Changeability
- Write code that is easy to read, easy to trace, and easy to change.
- Reading and learning the codebase should feel trivial in touched areas.
- Establish obvious patterns early so contribution paths stay clear.
- Prefer designs where small changes touch few files.
- Avoid cleverness that hides intent.
- Prefer full, intention-revealing names like `value`, `workspaceContext`, `permissionRequest`, and `selectedRunId`.
- Avoid low-information names like `v`, `x`, `data`, `item`, `res`, or `tmp` unless the scope is tiny and unambiguous.
- Local clarity comes first: do not rely on tribal knowledge or surrounding files to explain a symbol that could be named clearly in place.

### 2) Do Not Tolerate Quality Decay
- Treat suspicious "convenient" code as a defect, not a shortcut.
- Fix structural problems when found; do not defer known messes.
- Do not ship temporary slop.

### 3) Remove Smells Immediately
- If code smells, refactor or delete the smell.
- Do not justify weak patterns by history, precedent, or existing debt.
- Keep touched areas sharper than you found them.
- Structural smell is the decision rule, not file length.
- If a file is multi-concern, brittle, hard to scan, or hard to change, it is non-conform even when the LOC count looks acceptable.
- LOC-style thresholds are inspection conditions, not automatic pass/fail proof.
- Every file still has to be judged for cohesion, clarity, and single-responsibility even when it is below the preferred size thresholds.

### 4) Keep Files, Modules, and Folders Focused
- Do not create god files; split by responsibility as soon as a file carries multiple concerns.
- LOC is only a rough heuristic, not the conformance rule.
- Files may exceed 900 LOC when still coherent, but handwritten source and handwritten tests should generally stay around 900 LOC max.
- Crossing 900 LOC means the file must be explicitly inspected for smell, cohesion, and changeability; crossing 1200 LOC means it requires strict manual review. These thresholds are inspection triggers, not automatic proof of validity or invalidity.
- Do not treat "under 900 LOC" as a reason to keep a smell-heavy file intact.
- A 300 LOC multi-concern file still fails this standard; a longer file can still be acceptable if it is genuinely cohesive.
- Treat oversized or multi-concern files as a DX bug.
- Do not let folders become dumping grounds.
- Group by responsibility, not convenience.
- Keep folder fan-out reasonable: a folder with too many unrelated files increases cognitive load and should be split into clearer subfolders.
- Narrow exceptions are allowed only for generated artifacts and the single canonical alpha baseline migration, where centralization is intentional.
- These exceptions apply to size-based review automation only; they do not relax the standard for handwritten source, handwritten tests, or ordinary file-backed assets.

### 4.5) Prefer Self-Explanatory Code Before More Documentation
- Make code understandable through names, boundaries, and structure first.
- Add sparse inline comments only when they reduce real ambiguity around non-obvious logic, invariants, failure modes, or surprising choices.
- Use markdown docs for cross-cutting architecture, lifecycle flows, precedence rules, subsystem contracts, and contributor workflows that span multiple modules.
- Do not create new markdown docs outside the `Research` folder unless the user explicitly permits it.
- Do not use markdown docs as a band-aid for unclear local code.
- Do not add noisy comments that only restate obvious code.
- Do not commit absolute machine-specific filesystem paths such as `C:\Users\...`, `M:\...`, or `/m:/...` in docs, tests, configs, or source. Use repository-relative links in markdown and derive paths at runtime in code/tests from local context instead.

### 5) Keep Boundaries Type-Safe
- Do not use broad `as SomeType` casts to silence type errors.
- Prefer parser/validator boundaries, runtime guards, and explicit narrowing.
- Use `as const` only for literal narrowing.
- If a cast is unavoidable, keep it at a validated boundary, never at mutation call sites.
- Validate ID prefix and shape across renderer/service boundaries before use.
- Keep stable internal IDs separate from user-facing names.

### 6) Keep Test Context Out of Source
- Source code must not depend on `__tests__`, fixtures, mocks, or test helpers.
- Do not import test frameworks into runtime/source modules.
- Do not add test-only runtime branches unless architecture explicitly requires them and the reason is documented.
- Shared runtime/test utilities must live in neutral source modules with no test-specific behavior.

### 7) Use `evlog` and `neverthrow` by Default
- Use `evlog`-backed application logging; do not add ad-hoc logging patterns.
- Logging must stay development-only and disabled in packaged production builds.
- Prefer structured events over free-form strings.
- Use `neverthrow` `Result` flows for recoverable failures.
- Do not use `throw` for expected runtime or business-state failures.
- Reserve `throw` for parser validation failures, invariant/data-corruption failures, impossible post-write readback failures, and missing required seeded configuration.

### 8) Do Not Use Inline Lint Suppressions in Handwritten Source
- Do not use `eslint-disable`, `eslint-disable-next-line`, or `eslint-disable-line` in handwritten source files.
- Fix the code or scope the exception in `eslint.config.js`.
- Generated files are the only allowed exception.

### 9) Trust React Compiler First
- React Compiler is enabled; write plain React first.
- Prefer straightforward render code, clear state ownership, and small component boundaries before reaching for hook-level optimization.
- Add `useMemo`, `useCallback`, or `memo` only when compiler coverage is known to miss, dependency identity is part of an external API contract, or profiling proves a real regression.
- Do not add defensive memoization by default.
- `useMemo` is not a substitute for fixing bad ownership or unnecessary rerenders higher in the tree.
- `useCallback` is not a default style choice; only use it when a stable function identity is materially required.
- If a component only feels “performant” after scattered memoization, the architecture is probably wrong and should be simplified first.

### 10) Prefer Aliases Except in Bundler-Sensitive Entry Files
- Prefer `@/web`, `@/app`, and `@/shared` imports over deep relative paths in ordinary renderer, main-process, and shared modules.
- Use relative imports only when module resolution must stay pinned to the local file system or the current entry file.
- Allowed exception cases include `*.worker.ts`, preload entrypoints, Vite/build config files, and local `new URL(..., import.meta.url)` entry references.
- Keep these exceptions narrow; do not use them as a convenience escape hatch in ordinary source files.

### 11) Review React Hooks, Effects, and Async Flows Strictly
- Treat hooks as architectural tools, not convenience macros.
- Use fewer hooks when possible. If a value can be computed during render, compute it during render.

#### `useState`
- Use `useState` for truly local, user-editable, or interaction-driven state.
- Do not put props into `useState` just to “keep them in sync” later.
- Do not mirror derivable state into `useState`; derive it during render instead.
- If local state must reset when an upstream identity changes, prefer an explicit keyed boundary over a reset effect.
- Keep hot interaction state local.
  Transient input text, drag state, hover state, inline drafts, open row state, and other high-frequency UI state must live at the lowest boundary that actually needs to coordinate it.
  Do not lift hot state into large shells, workspace layouts, or top-level feature coordinators when only a leaf or small subtree needs it.
- Use lazy `useState(() => initialValue)` initialization when the initial value is meaningfully expensive to compute or read.

#### `useEffect`
- Use `useEffect` only for external synchronization:
  subscriptions, timers, DOM listeners, IPC/event bridges, persistence sync, imperative browser APIs, or network/cache side effects.
- Do not model user actions as state plus `useEffect`; run interaction-driven side effects in the event handler that caused them.
- Do not use `useEffect` to copy props into state, “refresh” local drafts from props, or repair ownership mistakes.
- If an effect exists only to shuffle values between React states, the design is likely wrong.
- Prefer `useEffectEvent` when an effect needs the latest values without widening the effect dependency surface.
- Effect dependencies must reflect the real external synchronization contract.
  Do not omit dependencies to suppress reruns.
  Do not depend on broad objects when the effect really uses a smaller primitive subset.
- Do not write `useEffect(async () => ...)`; keep the effect synchronous and call an inner async function when needed.
- For independent async work started from an effect, start early, await late, and use `Promise.all` instead of avoidable waterfalls.

#### `useLayoutEffect`
- Do not use `useLayoutEffect` in ordinary app code.
- Treat `useLayoutEffect` as disallowed unless a real pre-paint DOM measurement or mutation requirement exists and no safer alternative works.
- If layout work is required, first try:
  better CSS/layout structure,
  `ResizeObserver`,
  `requestAnimationFrame`,
  or a regular `useEffect`.
- Any `useLayoutEffect` that survives review should be rare, clearly justified, and treated as a smell by default.

#### `useMemo`, `useCallback`, and `memo`
- React Compiler is the default optimization path; add `useMemo`, `useCallback`, or `memo` only for proven compiler gaps or profiling-backed regressions.
- Do not wrap simple filtering, mapping, or object construction in `useMemo` by default.
- Do not use `useCallback` just to satisfy style preferences or speculative child rerender concerns.
- Memoization is acceptable when:
  the computation is genuinely expensive,
  the memoized identity is required by an external dependency contract,
  or profiling shows measurable benefit.

#### `useRef`
- Use `useRef` for imperative handles, mutable values that do not participate in rendering, and integration boundaries with external systems.
- Do not use refs as a hidden state store to avoid proper data flow.
- Do not read/write refs during render unless the pattern is intentionally render-safe and obvious.

#### Transitions, deferred reads, and rendering boundaries
- Prefer `startTransition` for non-urgent UI updates and `useDeferredValue` for deferred reads such as search filtering or heavy derived views.
- Treat render-boundary shape as architecture, not micro-optimization.
  React Compiler does not fix state ownership mistakes: if a rapidly changing state value is owned high in the tree, broad rerenders are expected.
  Prefer smaller feature boundaries and local state over broad prop threading through large conversation or settings surfaces.
- Prefer virtualization for genuinely large or unbounded collection surfaces.
  Use TanStack Virtual by default for list-like views that can grow materially over time, such as long rails, large tables, or other continuously growing collections.
  Do not add virtualization blindly to highly dynamic chat/transcript surfaces; first validate scroll anchoring, streaming behavior, and interaction semantics, then virtualize if the surface is still a real hotspot.

### 12) Preserve Electron Boundaries and Window Hardening
- Renderer code must not import `electron` directly.
- `ipcRenderer` and `contextBridge` are preload-only APIs.
- Expose narrow, validated preload bridges instead of broad Electron handles or raw process access.
- Every `BrowserWindow` must keep `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
- Route external navigation through guarded allowlist/validation helpers instead of directly opening arbitrary URLs.
- Keep Electron security-sensitive behavior centralized in the existing main-process security and window modules whenever possible.

## Repository Documentation Status
- Root `README.md` is intentionally empty and points to `Markdown/README`.
- `Project/README.md` is intentionally not filled yet.

## Theming System (Locked)
- The theming system is token-based with semantic CSS variables and Tailwind v4 compatibility.
- Supported modes are `light`, `dark`, and `auto`; default is `auto`.
- Theme switching happens at the root; components consume semantic tokens only.
- Do not hardcode palette values where a semantic token exists.
- Built-in and custom themes must extend the same token contract.

## Practical Rule
- Every PR must leave the touched area clearer than it was.
- Before assuming the git worktree is dirty or in a standard branch-based state, check whether `jj` is managing the workspace and whether Git is detached because of that workflow.
