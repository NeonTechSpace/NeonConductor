# Conversation Shell Data Flow

The conversation shell is a composition layer, not the place for business logic.

## Responsibilities

- `shell.tsx` composes the sidebar, workspace panels, composer, and tab state.
- `shell/queries/useConversationQueries.ts` owns shell-level query creation.
- `runtime/workspaceBootLoader.ts` prefetches the boot-critical profile, mode, and shell bootstrap queries before the full surface mounts.
- `lib/runtime/runtimeEventPatches.ts` applies cache patches first for thread, tag, checkpoint, diff, and provider events when the payload is sufficient.
- `lib/runtime/runtimeEventInvalidation.ts` falls back to scoped invalidation only when an event cannot be patched safely.
- `shell/workspace/useConversationWorkspaceActions.ts` owns workspace- and permission-oriented mutation flows and updates the relevant caches directly where the renderer already knows the result.
- `hooks/` own feature-specific UI state such as composer state, edit flow, and session actions.

## Freshness Rules

- Runtime events are the primary freshness mechanism.
- Cache patching is preferred over broad invalidation when the event payload already contains the authoritative record.
- Scoped invalidation remains the fallback for domains where the renderer does not have enough data to patch safely.
- Prefetch is used for responsiveness, not as a replacement for runtime events:
  - shell boot prefetch warms profile, mode, and shell bootstrap state
  - thread and session selection prefetch warms runs, messages, diffs, checkpoints, and worktrees
  - settings hover/selection prefetch warms provider-specific settings data
- There is no `useConversationShellRefetch` layer anymore.

## Why This Shape Exists

- Query ownership stays discoverable in one place.
- The shell stays readable because composition, event patching, invalidation, and feature actions each have a separate home.
- Runtime-event-first freshness keeps the UI responsive without forcing broad refetch churn after every mutation.
- Targeted prefetch keeps likely-next views warm without coupling selection logic to a deleted manual refetch coordinator.
