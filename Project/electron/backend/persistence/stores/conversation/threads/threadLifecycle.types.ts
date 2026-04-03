import type { ThreadListRecord } from '@/app/backend/persistence/types';
import type { EntityId, ExecutionEnvironmentMode, TopLevelTab } from '@/app/backend/runtime/contracts';

export interface ResolvedThreadCreationInput {
    profileId: string;
    conversationId: string;
    title: string;
    topLevelTab: TopLevelTab;
    parentThreadId?: string;
    rootThreadId?: string;
    delegatedFromOrchestratorRunId?: EntityId<'orch'>;
    delegatedFromPlanResearchBatchId?: EntityId<'prb'>;
    delegatedFromFlowInstanceId?: string;
    executionEnvironmentMode?: ExecutionEnvironmentMode;
    sandboxId?: EntityId<'sb'>;
}

export interface WorkspaceThreadDeletionPlan {
    totalThreadCount: number;
    favoriteThreadCount: number;
    deletableThreadIds: EntityId<'thr'>[];
    deletedTagIds: EntityId<'tag'>[];
    deletedConversationIds: string[];
    sessionIds: EntityId<'sess'>[];
    runIds: EntityId<'run'>[];
    messageIds: EntityId<'msg'>[];
    messagePartIds: string[];
    checkpointIds: EntityId<'ckpt'>[];
    diffIds: string[];
    runtimeEventEntityIds: string[];
}

export interface WorkspaceThreadDeletePreview {
    workspaceFingerprint: string;
    totalThreadCount: number;
    favoriteThreadCount: number;
    deletableThreadCount: number;
}

export interface DeleteWorkspaceThreadsResult extends WorkspaceThreadDeletePreview {
    deletedThreadIds: EntityId<'thr'>[];
    deletedTagIds: EntityId<'tag'>[];
    deletedConversationIds: string[];
    sessionIds: EntityId<'sess'>[];
}

export interface ThreadActivityUpdate {
    profileId: string;
    threadId: string;
    atIso: string;
}

export type DeleteDelegatedChildLaneInput =
    | {
          profileId: string;
          threadId: EntityId<'thr'>;
          sessionId?: EntityId<'sess'>;
          orchestratorRunId: EntityId<'orch'>;
      }
    | {
          profileId: string;
          threadId: EntityId<'thr'>;
          sessionId?: EntityId<'sess'>;
          planResearchBatchId: EntityId<'prb'>;
      }
    | {
          profileId: string;
          threadId: EntityId<'thr'>;
          sessionId?: EntityId<'sess'>;
          flowInstanceId: string;
      };

export interface DelegatedChildLaneDeletionResult {
    deleted: boolean;
}

export type ThreadGroupView = 'workspace' | 'branch';

export interface ThreadListQueryInput {
    profileId: string;
    activeTab: TopLevelTab;
    showAllModes: boolean;
    groupView: ThreadGroupView;
    scope?: 'detached' | 'workspace';
    workspaceFingerprint?: string;
    sort: 'latest' | 'alphabetical';
}

export interface ThreadListProjection {
    threads: ThreadListRecord[];
}
