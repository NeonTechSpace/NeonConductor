import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';

import type { SessionSummaryRecord, ThreadListRecord } from '@/app/backend/persistence/types';

import type { RuntimeShellBootstrap } from '@/shared/contracts';

type WorkspaceRootRecord = RuntimeShellBootstrap['workspaceRoots'][number];
type ManagedSandboxRecord = RuntimeShellBootstrap['sandboxes'][number];

export type WorkspaceExecutionScope =
    | {
          kind: 'detached';
      }
    | {
          kind: 'workspace_unresolved';
          label: string;
          workspaceFingerprint: string;
          executionEnvironmentMode: Extract<ThreadListRecord['executionEnvironmentMode'], 'local' | 'new_sandbox'>;
      }
    | {
          kind: 'sandbox';
          label: string;
          absolutePath: string;
          baseWorkspaceLabel: string;
          baseWorkspacePath: string;
          sandboxId: ManagedSandboxRecord['id'];
      }
    | {
          kind: 'workspace';
          label: string;
          absolutePath: string;
          executionEnvironmentMode: Extract<ThreadListRecord['executionEnvironmentMode'], 'local' | 'new_sandbox'>;
      };

export function deriveConversationWorkspaceExecutionScope(input: {
    selectedThread: ThreadListRecord | undefined;
    selectedSession: SessionSummaryRecord | undefined;
    workspaceRoots: WorkspaceRootRecord[];
    sandboxes: ManagedSandboxRecord[];
}): WorkspaceExecutionScope {
    if (!input.selectedThread?.workspaceFingerprint) {
        return { kind: 'detached' };
    }

    const selectedWorkspaceRoot = input.workspaceRoots.find(
        (workspaceRoot) => workspaceRoot.fingerprint === input.selectedThread?.workspaceFingerprint
    );
    const selectedSandboxId = resolveSelectedSandboxId({
        selectedThread: input.selectedThread,
        selectedSession: input.selectedSession,
    });
    const selectedManagedSandbox = selectedSandboxId
        ? input.sandboxes.find((sandbox) => sandbox.id === selectedSandboxId)
        : undefined;

    if (selectedManagedSandbox) {
        return {
            kind: 'sandbox',
            label: selectedManagedSandbox.label,
            absolutePath: selectedManagedSandbox.absolutePath,
            baseWorkspaceLabel: selectedWorkspaceRoot?.label ?? input.selectedThread.workspaceFingerprint,
            baseWorkspacePath: selectedWorkspaceRoot?.absolutePath ?? '',
            sandboxId: selectedManagedSandbox.id,
        };
    }

    if (!selectedWorkspaceRoot) {
        return {
            kind: 'workspace_unresolved',
            label: input.selectedThread.workspaceFingerprint,
            workspaceFingerprint: input.selectedThread.workspaceFingerprint,
            executionEnvironmentMode:
                input.selectedThread.executionEnvironmentMode === 'sandbox'
                    ? 'local'
                    : input.selectedThread.executionEnvironmentMode,
        };
    }

    return {
        kind: 'workspace',
        label: selectedWorkspaceRoot.label,
        absolutePath: selectedWorkspaceRoot.absolutePath,
        executionEnvironmentMode:
            input.selectedThread.executionEnvironmentMode === 'sandbox'
                ? 'local'
                : input.selectedThread.executionEnvironmentMode,
    };
}

function resolveSelectedSandboxId(input: {
    selectedThread: ThreadListRecord | undefined;
    selectedSession: SessionSummaryRecord | undefined;
}): ManagedSandboxRecord['id'] | undefined {
    if (isEntityId(input.selectedSession?.sandboxId, 'sb')) {
        return input.selectedSession.sandboxId;
    }

    if (isEntityId(input.selectedThread?.sandboxId, 'sb')) {
        return input.selectedThread.sandboxId;
    }

    return undefined;
}
