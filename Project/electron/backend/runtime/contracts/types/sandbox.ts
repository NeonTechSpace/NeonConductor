import type { ExecutionEnvironmentMode, SandboxStatus } from '@/app/backend/runtime/contracts/enums';
import type { EntityId } from '@/app/backend/runtime/contracts/ids';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';

export interface SandboxRecord {
    id: EntityId<'sb'>;
    profileId: string;
    workspaceFingerprint: string;
    absolutePath: string;
    label: string;
    status: SandboxStatus;
    creationStrategy: 'clone' | 'copy';
    createdAt: string;
    updatedAt: string;
    lastUsedAt: string;
}

export type ResolvedWorkspaceContext =
    | {
          kind: 'detached';
      }
    | {
          kind: 'workspace_unresolved';
          workspaceFingerprint: string;
          label: string;
          reason: 'workspace_root_missing';
          executionEnvironmentMode: Extract<ExecutionEnvironmentMode, 'local' | 'new_sandbox'>;
      }
    | {
          kind: 'workspace';
          workspaceFingerprint: string;
          label: string;
          absolutePath: string;
          executionEnvironmentMode: Extract<ExecutionEnvironmentMode, 'local' | 'new_sandbox'>;
      }
    | {
          kind: 'sandbox';
          workspaceFingerprint: string;
          label: string;
          absolutePath: string;
          executionEnvironmentMode: 'sandbox';
          sandbox: SandboxRecord;
          baseWorkspace: {
              label: string;
              absolutePath: string;
          };
      };

export type ResolvedWorkspaceExecutionContext = Extract<ResolvedWorkspaceContext, { kind: 'workspace' | 'sandbox' }>;

export interface SandboxListInput extends ProfileInput {
    workspaceFingerprint?: string;
}

export interface SandboxCreateInput extends ProfileInput {
    workspaceFingerprint: string;
    label?: string;
    sandboxKey?: string;
}

export interface SandboxByIdInput extends ProfileInput {
    sandboxId: EntityId<'sb'>;
}

export interface SandboxRefreshResult {
    refreshed: boolean;
    sandbox?: SandboxRecord;
    reason?: 'not_found';
}

export interface SandboxRemoveResult {
    removed: boolean;
    sandboxId?: EntityId<'sb'>;
    affectedThreadIds: EntityId<'thr'>[];
    reason?: 'not_found' | 'active_session' | 'workspace_unresolved' | 'remove_failed';
    message?: string;
}

export interface SandboxRemoveInput extends SandboxByIdInput {
    removeFiles?: boolean;
}

export interface SandboxRemoveOrphanedResult {
    removedSandboxIds: EntityId<'sb'>[];
    affectedThreadIds: EntityId<'thr'>[];
}

export interface SandboxConfigureThreadInput extends ProfileInput {
    threadId: EntityId<'thr'>;
    mode: ExecutionEnvironmentMode;
    sandboxId?: EntityId<'sb'>;
}
