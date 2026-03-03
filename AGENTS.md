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
- Treat oversized files as a DX bug and refactor before merging.

## Practical Rule
- Every PR should leave the touched area clearer than it was.
