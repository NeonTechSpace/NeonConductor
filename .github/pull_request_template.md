## PR Title (Required)

Use one of these formats:

- `type: short lowercase subject`
- `type(scope): short lowercase subject`

Allowed `type`: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `test`, `ui-ux`

Optional `scope`: any lowercase kebab-case token (examples: `api`, `frontend`, `backend`, `electron`, `provider`, `agent`, `tools`, `infra`, `deps`)

Breaking change note:

- Add `!` before `:` to mark breaking intent, for example: `feat(api)!: remove legacy config format`
- Automation adds `type: breaking` when `!` is present
- Maintainers must apply exactly one `release:bump:*` label for release-impacting `Project/**` changes

Branch naming note:

- `proto` is allowed for branch names only (`username/proto/short-description`), not as a PR title type

## Summary

<!-- What changed, and why? Keep it concrete. -->

## Related Issues

<!-- Examples: Closes #123, Related #456 -->

## PR Type

- [ ] `build`
- [ ] `ci`
- [ ] `chore`
- [ ] `docs`
- [ ] `feat`
- [ ] `fix`
- [ ] `perf`
- [ ] `refactor`
- [ ] `revert`
- [ ] `test`
- [ ] `ui-ux`

## Branch Flow Check

- [ ] This PR follows the branch flow rules (`dev -> prev`, `prev -> main`).
- [ ] For normal work, base branch is `dev`.
- [ ] If targeting `prev` or `main`, this is a promotion/release PR requested by a maintainer.

## Release Check

- [ ] This PR touches release-impacting files in `Project/**`, and exactly one `release:bump:none|patch|minor|major` label is applied.
- [ ] No release bump label is required because this PR is docs-only in `Project/**` (markdown/docs paths) or does not change `Project/**`.

## Validation

- [ ] `pnpm -C Project lint`
- [ ] `pnpm -C Project typecheck`
- [ ] `pnpm -C Project test`
- [ ] I did not run one or more checks above, and explained why below.

## Scope Labels (for maintainers)

<!-- Pick the closest label(s): -->
<!-- scope: agent-core | scope: orchestration | scope: tools | scope: memory -->
<!-- scope: ui | scope: api | scope: integrations | scope: infra -->
<!-- scope: docs | scope: tests | scope: dependencies -->

## Risk / Impact

<!-- User impact, migration notes, breaking changes, rollback notes. -->

## Screenshots / Recordings (UI changes)

<!-- Add before/after screenshots or short recordings when applicable. -->

## Additional Notes

<!-- Anything reviewers should know. -->

## AI Assistance Disclosure

- [ ] I used AI to research external info relevant to this PR.
- [ ] I used AI to understand this repository/codebase context.
- [ ] I used AI to plan the implementation approach.
- [ ] I used AI while executing code changes in this PR.
- [ ] AI model(s) used: <!-- e.g., GPT-5, Claude 3.7 Sonnet -->

> **Attestation**
> I hereby swear I used AI responsibly and verified these changes are correct (not blind AI copy/apply slop).

> [!IMPORTANT]
>
> - [ ] I hereby swear to have only used AI in things I have _enough_ expertise in.

<!--
## Get in Touch

Need help, review help, or quick discussion?
- NeonSpace Discord: https://discord.gg/AT7pDjNMeK
- KiloCode Community Discord: https://discord.com/invite/Ja6BkfyTzJ
-->
