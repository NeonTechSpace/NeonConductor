import type {
    RuntimeProviderId,
    PreparedContextInstructionAuthority,
    PreparedContextTrustLevel,
    SessionOutboxEntryState,
} from '@/app/backend/runtime/contracts/enums';
import type { EntityId } from '@/app/backend/runtime/contracts/ids';
import type { PreparedContextSummary } from '@/app/backend/runtime/contracts/types/context';
import type { RuntimeRunOptions } from '@/app/backend/runtime/contracts/types/session';

export interface SteeringSnapshot {
    profileId: string;
    sessionId: EntityId<'sess'>;
    topLevelTab: 'chat' | 'agent' | 'orchestrator';
    modeKey: string;
    providerId: RuntimeProviderId;
    modelId: string;
    runtimeOptions: RuntimeRunOptions;
    workspaceFingerprint?: string;
    sandboxId?: EntityId<'sb'>;
    createdAt: string;
}

export interface RunContractTrustSummary {
    contributorCountByTrustLevel: Record<PreparedContextTrustLevel, number>;
    contributorCountByInstructionAuthority: Record<PreparedContextInstructionAuthority, number>;
}

export interface RunContractAttachmentSummary {
    totalCount: number;
    imageAttachmentCount: number;
    textFileAttachmentCount: number;
    totalByteSize: number;
}

export interface RunContractDynamicExpansionSummary {
    resolvedCount: number;
    blockedCount: number;
    omittedCount: number;
    failedCount: number;
    invalidCount: number;
}

export interface RunContractDiffItem {
    field: string;
    previousValue?: string;
    nextValue?: string;
    reason: string;
    material: boolean;
}

export interface RunContractDiffSummary {
    compatible: boolean;
    hasMaterialChanges: boolean;
    items: RunContractDiffItem[];
}

export interface RunContractPreview {
    steeringSnapshot: SteeringSnapshot;
    preparedContext: PreparedContextSummary;
    cache: {
        digest: string;
        strategy: RuntimeRunOptions['cache']['strategy'];
        key?: string;
        cacheabilityHint: string;
    };
    trustSummary: RunContractTrustSummary;
    dynamicExpansionSummary: RunContractDynamicExpansionSummary;
    attachmentSummary: RunContractAttachmentSummary;
    diffFromLastCompatible?: RunContractDiffSummary;
}

export type RunContractPreviewResult =
    | {
          available: false;
          reason: 'not_found' | 'rejected';
          code?: string;
          message?: string;
          action?: {
              code: string;
              [key: string]: unknown;
          };
      }
    | {
          available: true;
          preview: RunContractPreview;
      };

export interface ExecutionReceipt {
    id: EntityId<'rcpt'>;
    profileId: string;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
    contract: RunContractPreview;
    approvalsUsed: Array<{
        permissionRequestId: EntityId<'perm'>;
        scope: 'once' | 'profile' | 'workspace';
        resource: string;
    }>;
    toolsInvoked: Array<{
        toolName: string;
        callCount: number;
    }>;
    memoryHitCount: number;
    cacheResult: {
        applied: boolean;
        key?: string;
        reason?: string;
    };
    usageSummary: {
        inputTokens?: number;
        outputTokens?: number;
        cachedTokens?: number;
        reasoningTokens?: number;
        totalTokens?: number;
        latencyMs?: number;
        costMicrounits?: number;
    };
    terminalOutcome:
        | {
              kind: 'completed';
          }
        | {
              kind: 'failed';
              errorCode: string;
              errorMessage: string;
          }
        | {
              kind: 'aborted';
          };
    createdAt: string;
}

export interface SessionOutboxEntry {
    id: EntityId<'outbox'>;
    profileId: string;
    sessionId: EntityId<'sess'>;
    state: SessionOutboxEntryState;
    sequence: number;
    prompt: string;
    attachmentIds: EntityId<'att'>[];
    steeringSnapshot: SteeringSnapshot;
    latestRunContract?: RunContractPreview;
    latestReceiptId?: EntityId<'rcpt'>;
    activePermissionRequestId?: EntityId<'perm'>;
    pausedReason?: string;
    createdAt: string;
    updatedAt: string;
}
