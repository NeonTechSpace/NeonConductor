# This document is for contributor workflow, release routing, and local setup.

## Local Setup

- Use `Node v24.14.1` and `pnpm 10.28.2`.
- From the repo root, install with `pnpm -C Project install --frozen-lockfile`.
- Run `pnpm -C Project prep` before wider checks when generated files or migration checks may be stale.
- Use `pnpm -C Project check:fast` for the default local verification pass.
- Use `pnpm -C Project check` when you want the full check set, including the build.
- Use `pnpm -C Project audit:agents:worklist:new` when you want the current actionable agent review queue.
- Use `pnpm -C Project doctor:desktop` for packaged-storage checks and `pnpm -C Project doctor:desktop:dev` for isolated development storage.
- Use `pnpm -C Project build:app` followed by `pnpm -C Project launch:desktop` for built Electron validation; `launch:desktop` sanitizes inherited Electron Node-mode environment.
- `jj status` is the best first status command when the workspace is managed by `jj`; Git may look detached by design.

## Branch Flow

- `dev` is the integration branch.
- `prev` is the beta staging branch.
- `main` is the stable branch.
- Normal work opens to `dev`.
- Direct release work may target `dev`, `prev`, or `main` only through the approved hotfix and automation lanes.
- The expected promotion path is `dev` -> `prev` -> `main`.

## Branch and PR Rules

- Use `username/type/short-description` for branch names.
- Keep `short-description` lowercase kebab-case.
- Allowed branch types are `build`, `ci`, `chore`, `docs`, `feat`, `fix`, `hotfix`, `perf`, `refactor`, `test`, and `proto`.
- Use `proto` only for demo, spike, or testing branches that are usually not merged.
- PR titles must follow `type: short lowercase subject` or `type(scope): short lowercase subject`.
- Allowed PR types are `build`, `ci`, `chore`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `test`, and `ui-ux`.
- Use `!` before `:` to mark a breaking change.

## Changesets And Releases

- If a PR changes non-doc files in `Project/**`, include a changeset in `Project/.changeset/`.
- Docs-only changes in `Project/**` are exempt.
- Do not manually edit `Project/package.json` `version`; release automation owns it.
- Pre-release tags are for the matching branch only: alpha on `dev`, beta on `prev`.
- Stable releases are produced through the version PR generated from `main`.
- Tag rules are enforced in repository settings, not by workflows.

## Automation Notes

- PRs touching `Project/**` run the standard project checks.
- PR title validation only runs for PRs targeting `dev`.
- Release notes are grouped by channel and rely on the repo's `type:*` labels.
- `status: needs-triage` is applied automatically when no status label exists yet.
