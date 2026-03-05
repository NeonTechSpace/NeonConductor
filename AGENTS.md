# AGENTS.md

## Engineering Standard

### 1) Optimize for Clarity, Speed, and Changeability
- Code must be easy to read and fast to understand.
- Establish patterns early that make contribution paths obvious.
- Prefer designs where small changes touch few files.
- Accept that large changes will touch many files, but only when the change is truly large.
- Avoid cleverness that hides intent.

### 2) Tolerate Nothing
- "Convenient" code often looks like "bad" code. Treat it as suspect.
- Stop quality decay immediately; do not defer known problems.
- "Later" is usually never. If you see a structural issue, fix it now.
- Do not ship known messes as temporary shortcuts.

### 3) If It Smells, Remove It
- When code smells, remove or refactor it decisively.
- Do not justify weak patterns by history or precedent.
- Do not preserve slop because it already exists.
- Keep the codebase sharp, explicit, and maintainable.

### 4) Keep Files Small and Focused
- Do not introduce massive "god files"; split by responsibility.
- If a file starts growing into multiple concerns, stop and extract modules immediately.
- Prefer clear, composable units over central dumping grounds to reduce cognitive load.
- There is no hard line limit; files can exceed 500 LOC when still coherent.
- Preferred target is to keep files under 1000 LOC.
- Treat oversized or multi-concern files as a DX bug and refactor before merging.

### 5) Type Safety at Boundaries (No Blind Casts)
- Do not use broad `as SomeType` assertions to silence type errors.
- Avoid `as SomeType` assertions in application code when a runtime/type guard can prove correctness.
- Prefer typed parser/validator boundaries and explicit narrowing helpers (fail-closed on invalid data).
- Use `as const` only for literal narrowing.
- If a cast is unavoidable, keep it at a validated parser/guard boundary, not at mutation call sites.
- When IDs cross renderer/service boundaries, validate prefix/shape before mutation calls instead of casting.
- Keep stable internal IDs immutable and separate from user-facing names (rename display fields, not identity keys).

### 6) Keep Test Context Isolated from Source
- Production/source files must not depend on test context (`__tests__`, test fixtures, test helpers, mocks).
- Do not import test frameworks (`vitest`, `jest`, test globals) into runtime/source modules.
- Do not add test-only runtime branches in source code (for example `NODE_ENV === 'test'` behavior gates) unless explicitly required by architecture and documented.
- Keep fixtures, stubs, and mocks in test-only paths.
- If code is genuinely shared by runtime and tests, place it in a neutral source module and keep test-specific behavior out of it.

## Repository Documentation Status
- Root `README.md` is intentionally empty; it serves as a pointer target to `Markdown/README`.
- `Project/README.md` is intentionally not filled yet.

## Practical Rule
- Every PR should leave the touched area clearer than it was.
