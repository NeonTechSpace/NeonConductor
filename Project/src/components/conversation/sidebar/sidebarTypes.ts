import type { ThreadListRecord } from '@/app/backend/persistence/types';

import type { WorkspacePreferenceRecord, WorkspaceRootRecord } from '@/shared/contracts';
import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';

export interface SidebarBrowserWorkspaceGroup {
    label: string;
    workspaceFingerprint: string;
    absolutePath?: string;
    favoriteCount: number;
    threadCount: number;
    rows: Array<{
        thread: ThreadListRecord;
        depth: number;
    }>;
}

export interface SidebarBrowserState {
    workspaceOptions: string[];
    tagLabelById: Map<string, string>;
    selectedThread: ThreadListRecord | undefined;
    workspaceGroups: SidebarBrowserWorkspaceGroup[];
    playgroundRows: Array<{
        thread: ThreadListRecord;
        depth: number;
    }>;
}

export interface ThreadEntryDraftState {
    workspaceFingerprint: string;
    title: string;
    topLevelTab: TopLevelTab;
    providerId: RuntimeProviderId | undefined;
    modelId: string;
}

export type ThreadEntrySubmitResult =
    | {
          kind: 'created_with_starter_session';
          workspaceFingerprint: string;
      }
    | {
          kind: 'created_without_starter_session';
          workspaceFingerprint: string;
          message: string;
      }
    | {
          kind: 'failed';
          workspaceFingerprint: string;
          message: string;
      };

export interface WorkspaceLifecycleDraftState {
    label: string;
    absolutePath: string;
    defaultTopLevelTab: TopLevelTab;
    defaultProviderId: RuntimeProviderId | undefined;
    defaultModelId: string;
}

export type WorkspaceLifecycleResult =
    | {
          kind: 'created_with_starter_thread';
          workspaceRoot: WorkspaceRootRecord;
          threadEntryResult: ThreadEntrySubmitResult;
      }
    | {
          kind: 'created_without_starter_thread';
          workspaceRoot: WorkspaceRootRecord;
          draftState: ThreadEntryDraftState;
          message: string;
      }
    | {
          kind: 'failed';
          message: string;
      };

export type SidebarMutationOutcome =
    | {
          kind: 'deleted_workspace_threads';
          workspaceFingerprint: string;
          deletedThreadIds: string[];
          deletedSessionIds: string[];
          deletedConversationIds: string[];
          deletedTagIds: string[];
      }
    | {
          kind: 'failed';
          message: string;
      };

export interface SidebarSelectionState {
    selectedThreadId: string | undefined;
    selectedSessionId: string | undefined;
    selectedRunId: string | undefined;
    selectedThread: ThreadListRecord | undefined;
}

export interface SidebarResolvedDefaultsInput {
    workspacePreferences: WorkspacePreferenceRecord[];
    defaults:
        | {
              providerId: string;
              modelId: string;
          }
        | undefined;
}
