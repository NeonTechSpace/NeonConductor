import type {
    OrchestratorExecutionStrategy,
    OrchestratorRunStatus,
    RuntimeProviderId,
} from '@/app/backend/runtime/contracts/enums';
import type { EntityId } from '@/app/backend/runtime/contracts/ids';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';
import type { RuntimeRunOptions } from '@/app/backend/runtime/contracts/types/session';

export interface OrchestratorStartInput extends ProfileInput {
    planId: EntityId<'plan'>;
    runtimeOptions: RuntimeRunOptions;
    executionStrategy?: OrchestratorExecutionStrategy;
    providerId?: RuntimeProviderId;
    modelId?: string;
    workspaceFingerprint?: string;
}

export interface OrchestratorRunByIdInput extends ProfileInput {
    orchestratorRunId: EntityId<'orch'>;
}

export interface OrchestratorRunBySessionInput extends ProfileInput {
    sessionId: EntityId<'sess'>;
}

export interface OrchestratorStepView {
    id: EntityId<'step'>;
    sequence: number;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted';
    childThreadId?: EntityId<'thr'>;
    childSessionId?: EntityId<'sess'>;
    activeRunId?: EntityId<'run'>;
    runId?: EntityId<'run'>;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
}

export interface OrchestratorRunView {
    id: EntityId<'orch'>;
    profileId: string;
    sessionId: EntityId<'sess'>;
    planId: EntityId<'plan'>;
    planRevisionId: EntityId<'prev'>;
    status: OrchestratorRunStatus;
    executionStrategy: OrchestratorExecutionStrategy;
    activeStepIndex?: number;
    startedAt: string;
    completedAt?: string;
    abortedAt?: string;
    errorMessage?: string;
    createdAt: string;
    updatedAt: string;
    steps: OrchestratorStepView[];
}
