import type { SandboxRecord, ThreadRecord } from '@/app/backend/persistence/types';
import type { PermissionRecord } from '@/app/backend/persistence/types';

export type WorkspaceActionName =
    | 'permission_resolution'
    | 'thread_execution_configuration'
    | 'sandbox_refresh'
    | 'sandbox_removal'
    | 'orphaned_sandbox_cleanup';

export type WorkspaceActionFeedbackTone = 'success' | 'error' | 'info';

export interface WorkspaceActionFeedback {
    tone: WorkspaceActionFeedbackTone;
    message: string;
}

export type WorkspaceActionCacheEffect =
    | {
          kind: 'none';
      }
    | {
          kind: 'permission_request_resolved';
          requestId: PermissionRecord['id'];
      }
    | {
          kind: 'thread_execution_configured';
          thread: ThreadRecord;
          sandbox?: SandboxRecord;
      }
    | {
          kind: 'sandbox_refreshed';
          sandbox: SandboxRecord;
      }
    | {
          kind: 'sandboxes_removed';
          removedSandboxIds: string[];
      };

export type WorkspaceActionMutationResult =
    | {
          ok: true;
          action: WorkspaceActionName;
          cacheEffect: WorkspaceActionCacheEffect;
          feedback?: WorkspaceActionFeedback;
      }
    | {
          ok: false;
          action: WorkspaceActionName;
          message: string;
          feedback?: WorkspaceActionFeedback;
      };

export function workspacePermissionResolutionSuccess(
    requestId: PermissionRecord['id']
): WorkspaceActionMutationResult {
    return {
        ok: true,
        action: 'permission_resolution',
        cacheEffect: {
            kind: 'permission_request_resolved',
            requestId,
        },
    };
}

export function workspaceThreadExecutionConfiguredSuccess(input: {
    thread: ThreadRecord;
    sandbox?: SandboxRecord;
}): WorkspaceActionMutationResult {
    return {
        ok: true,
        action: 'thread_execution_configuration',
        cacheEffect: {
            kind: 'thread_execution_configured',
            thread: input.thread,
            ...(input.sandbox ? { sandbox: input.sandbox } : {}),
        },
        feedback: {
            tone: 'success',
            message: 'Execution environment updated.',
        },
    };
}

export function workspaceSandboxRefreshedSuccess(sandbox: SandboxRecord): WorkspaceActionMutationResult {
    return {
        ok: true,
        action: 'sandbox_refresh',
        cacheEffect: {
            kind: 'sandbox_refreshed',
            sandbox,
        },
        feedback: {
            tone: 'success',
            message: 'Managed sandbox status refreshed.',
        },
    };
}

export function workspaceSandboxRemovedSuccess(sandboxId: string): WorkspaceActionMutationResult {
    return {
        ok: true,
        action: 'sandbox_removal',
        cacheEffect: {
            kind: 'sandboxes_removed',
            removedSandboxIds: [sandboxId],
        },
        feedback: {
            tone: 'success',
            message: 'Managed sandbox removed.',
        },
    };
}

export function workspaceOrphanedSandboxesRemovedSuccess(removedSandboxIds: string[]): WorkspaceActionMutationResult {
    return {
        ok: true,
        action: 'orphaned_sandbox_cleanup',
        cacheEffect: {
            kind: 'sandboxes_removed',
            removedSandboxIds,
        },
        feedback: {
            tone: 'success',
            message: 'Removed orphaned managed sandboxes.',
        },
    };
}

export function workspaceActionMutationFailure(input: {
    action: WorkspaceActionName;
    message: string;
    includeFeedback?: boolean;
}): WorkspaceActionMutationResult {
    return {
        ok: false,
        action: input.action,
        message: input.message,
        ...(input.includeFeedback === false
            ? {}
            : {
                  feedback: {
                      tone: 'error',
                      message: input.message,
                  },
              }),
    };
}
