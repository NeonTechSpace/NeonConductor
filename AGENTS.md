# AGENTS.md

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

### 4) Keep Files, Modules, and Folders Focused
- Do not create god files; split by responsibility as soon as a file carries multiple concerns.
- Files may exceed 500 LOC when still coherent, but the preferred target is under 1000 LOC.
- Treat oversized or multi-concern files as a DX bug.
- Do not let folders become dumping grounds.
- Group by responsibility, not convenience.
- Keep folder fan-out reasonable: a folder with too many unrelated files increases cognitive load and should be split into clearer subfolders.

### 4.5) Prefer Self-Explanatory Code Before More Documentation
- Make code understandable through names, boundaries, and structure first.
- Add sparse inline comments only when they reduce real ambiguity around non-obvious logic, invariants, failure modes, or surprising choices.
- Use markdown docs for cross-cutting architecture, lifecycle flows, precedence rules, subsystem contracts, and contributor workflows that span multiple modules.
- Do not use markdown docs as a band-aid for unclear local code.
- Do not add noisy comments that only restate obvious code.

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
- Add `useMemo`, `useCallback`, or `memo` only when compiler coverage is known to miss or profiling proves a real regression.
- Do not add defensive memoization by default.

### 10) Prefer Aliases Except in Bundler-Sensitive Entry Files
- Prefer `@/web`, `@/app`, and `@/shared` imports over deep relative paths in ordinary renderer, main-process, and shared modules.
- Use relative imports only when module resolution must stay pinned to the local file system or the current entry file.
- Allowed exception cases include `*.worker.ts`, preload entrypoints, Vite/build config files, and local `new URL(..., import.meta.url)` entry references.
- Keep these exceptions narrow; do not use them as a convenience escape hatch in ordinary source files.

### 11) Review React Effects and Async Flows Strictly
- Use `useEffect` only for external synchronization such as subscriptions, timers, DOM listeners, IPC/event bridges, persistence sync, or network/cache side effects.
- Do not model user actions as state plus `useEffect`; run interaction-driven side effects in the event handler that caused them.
- Do not mirror derivable state into component state through effects; derive it during render or reset through an explicit keyed boundary.
- Prefer `useEffectEvent` when an effect needs the latest values without widening the effect dependency surface.
- Prefer `startTransition` for non-urgent UI updates and `useDeferredValue` for deferred reads such as search filtering or heavy derived views.
- React Compiler is the default optimization path; add `useMemo`, `useCallback`, or `memo` only for proven compiler gaps or profiling-backed regressions.
- For independent async work, start early, await late, and use `Promise.all` instead of avoidable waterfalls.
- Do not write `useEffect(async () => ...)`; keep the effect synchronous and call an inner async function when needed.

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
