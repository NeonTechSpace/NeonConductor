import type { RunTargetSelection } from '@/web/components/conversation/shell/workspace/helpers';

import type { OrchestratorRunRecord, OrchestratorStepRecord } from '@/app/backend/persistence/types';

import { launchBackgroundTask } from '@/shared/async/launchBackgroundTask';
import type {
    EntityId,
    OrchestratorExecutionStrategy,
    PlanRecordView,
    RuntimeProviderId,
    RuntimeRunOptions,
} from '@/shared/contracts';

interface MutationLike<TInput, TResult> {
    isPending: boolean;
    mutateAsync: (input: TInput) => Promise<TResult>;
}

export interface CreatePlanImplementationControllerInput {
    profileId: string;
    applyPlanWorkspaceUpdate: (result: { found: false } | { found: true; plan: PlanRecordView }) => void;
    applyOrchestratorWorkspaceUpdate: (
        result: { found: false } | { found: true; run: OrchestratorRunRecord; steps: OrchestratorStepRecord[] }
    ) => void;
    onError: (message: string) => void;
    resolvedRunTarget: RunTargetSelection | undefined;
    runtimeOptions: RuntimeRunOptions;
    workspaceFingerprint: string | undefined;
    planStartMutation: MutationLike<
        {
            profileId: string;
            sessionId: EntityId<'sess'>;
            topLevelTab: 'chat' | 'agent' | 'orchestrator';
            modeKey: string;
            prompt: string;
            workspaceFingerprint?: string;
        },
        { plan: PlanRecordView }
    >;
    planAnswerMutation: MutationLike<
        {
            profileId: string;
            planId: EntityId<'plan'>;
            questionId: string;
            answer: string;
        },
        { found: false } | { found: true; plan: PlanRecordView }
    >;
    planReviseMutation: MutationLike<
        {
            profileId: string;
            planId: EntityId<'plan'>;
            summaryMarkdown: string;
            items: Array<{ description: string }>;
        },
        { found: false } | { found: true; plan: PlanRecordView }
    >;
    planGenerateDraftMutation: MutationLike<
        {
            profileId: string;
            planId: EntityId<'plan'>;
            runtimeOptions: RuntimeRunOptions;
            providerId?: RuntimeProviderId;
            modelId?: string;
            workspaceFingerprint?: string;
        },
        { found: false } | { found: true; plan: PlanRecordView }
    >;
    planCancelMutation: MutationLike<
        {
            profileId: string;
            planId: EntityId<'plan'>;
        },
        { found: false } | { found: true; plan: PlanRecordView }
    >;
    planApproveMutation: MutationLike<
        {
            profileId: string;
            planId: EntityId<'plan'>;
            revisionId: EntityId<'prev'>;
        },
        { found: false } | { found: true; plan: PlanRecordView }
    >;
    planImplementMutation: MutationLike<
        {
            profileId: string;
            planId: EntityId<'plan'>;
            runtimeOptions: RuntimeRunOptions;
            providerId?: RuntimeProviderId;
            modelId?: string;
            workspaceFingerprint?: string;
            executionStrategy?: OrchestratorExecutionStrategy;
        },
        | { found: false }
        | { found: true; plan: PlanRecordView }
        | { found: true; plan: PlanRecordView; started: true; mode: 'agent.code' | 'orchestrator.orchestrate' }
    >;
    orchestratorAbortMutation: MutationLike<
        {
            profileId: string;
            orchestratorRunId: EntityId<'orch'>;
        },
        | { aborted: false; reason: 'not_found' }
        | {
              aborted: true;
              runId: EntityId<'orch'>;
              latest: { found: false } | { found: true; run: OrchestratorRunRecord; steps: OrchestratorStepRecord[] };
          }
    >;
}

export interface ConversationPlanActionController {
    isPlanMutating: boolean;
    isOrchestratorMutating: boolean;
    onAnswerQuestion: (planId: EntityId<'plan'>, questionId: string, answer: string) => void;
    onRevisePlan: (planId: EntityId<'plan'>, summaryMarkdown: string, items: string[]) => void;
    onGenerateDraft: (planId: EntityId<'plan'>) => void;
    onCancelPlan: (planId: EntityId<'plan'>) => void;
    onApprovePlan: (planId: EntityId<'plan'>, revisionId: EntityId<'prev'>) => void;
    onImplementPlan: (planId: EntityId<'plan'>, executionStrategy: OrchestratorExecutionStrategy) => void;
    onAbortOrchestrator: (orchestratorRunId: EntityId<'orch'>) => void;
}

function readActionErrorMessage(prefix: string, error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return `${prefix}: ${message}`;
}

export async function runConversationPlanMutation<TResult>(input: {
    mutation: {
        mutateAsync: () => Promise<TResult>;
    };
    applyResult: (result: TResult) => void;
    onError: (message: string) => void;
    errorPrefix: string;
}): Promise<void> {
    try {
        const result = await input.mutation.mutateAsync();
        input.applyResult(result);
    } catch (error) {
        input.onError(readActionErrorMessage(input.errorPrefix, error));
    }
}

export function createPlanImplementationController(
    input: CreatePlanImplementationControllerInput
): ConversationPlanActionController {
    return {
        isPlanMutating:
            input.planStartMutation.isPending ||
            input.planAnswerMutation.isPending ||
            input.planReviseMutation.isPending ||
            input.planGenerateDraftMutation.isPending ||
            input.planCancelMutation.isPending ||
            input.planApproveMutation.isPending ||
            input.planImplementMutation.isPending,
        isOrchestratorMutating: input.orchestratorAbortMutation.isPending,
        onAnswerQuestion: (planId, questionId, answer) => {
            launchBackgroundTask(async () => {
                await runConversationPlanMutation({
                    mutation: {
                        mutateAsync: () =>
                            input.planAnswerMutation.mutateAsync({
                                profileId: input.profileId,
                                planId,
                                questionId,
                                answer,
                            }),
                    },
                    applyResult: (result) => {
                        input.applyPlanWorkspaceUpdate(result);
                    },
                    onError: input.onError,
                    errorPrefix: 'Plan answer failed',
                });
            });
        },
        onRevisePlan: (planId, summaryMarkdown, items) => {
            launchBackgroundTask(async () => {
                await runConversationPlanMutation({
                    mutation: {
                        mutateAsync: () =>
                            input.planReviseMutation.mutateAsync({
                                profileId: input.profileId,
                                planId,
                                summaryMarkdown,
                                items: items.map((description) => ({ description })),
                            }),
                    },
                    applyResult: (result) => {
                        input.applyPlanWorkspaceUpdate(result);
                    },
                    onError: input.onError,
                    errorPrefix: 'Plan revision failed',
                });
            });
        },
        onGenerateDraft: (planId) => {
            launchBackgroundTask(async () => {
                await runConversationPlanMutation({
                    mutation: {
                        mutateAsync: () =>
                            input.planGenerateDraftMutation.mutateAsync({
                                profileId: input.profileId,
                                planId,
                                runtimeOptions: input.runtimeOptions,
                                ...(input.resolvedRunTarget ? { providerId: input.resolvedRunTarget.providerId } : {}),
                                ...(input.resolvedRunTarget ? { modelId: input.resolvedRunTarget.modelId } : {}),
                                ...(input.workspaceFingerprint
                                    ? { workspaceFingerprint: input.workspaceFingerprint }
                                    : {}),
                            }),
                    },
                    applyResult: (result) => {
                        input.applyPlanWorkspaceUpdate(result);
                    },
                    onError: input.onError,
                    errorPrefix: 'Plan draft generation failed',
                });
            });
        },
        onCancelPlan: (planId) => {
            launchBackgroundTask(async () => {
                await runConversationPlanMutation({
                    mutation: {
                        mutateAsync: () =>
                            input.planCancelMutation.mutateAsync({
                                profileId: input.profileId,
                                planId,
                            }),
                    },
                    applyResult: (result) => {
                        input.applyPlanWorkspaceUpdate(result);
                    },
                    onError: input.onError,
                    errorPrefix: 'Plan cancel failed',
                });
            });
        },
        onApprovePlan: (planId, revisionId) => {
            launchBackgroundTask(async () => {
                await runConversationPlanMutation({
                    mutation: {
                        mutateAsync: () =>
                            input.planApproveMutation.mutateAsync({
                                profileId: input.profileId,
                                planId,
                                revisionId,
                            }),
                    },
                    applyResult: (result) => {
                        input.applyPlanWorkspaceUpdate(result);
                    },
                    onError: input.onError,
                    errorPrefix: 'Plan approval failed',
                });
            });
        },
        onImplementPlan: (planId, executionStrategy) => {
            launchBackgroundTask(async () => {
                await runConversationPlanMutation({
                    mutation: {
                        mutateAsync: () =>
                            input.planImplementMutation.mutateAsync({
                                profileId: input.profileId,
                                planId,
                                runtimeOptions: input.runtimeOptions,
                                ...(input.resolvedRunTarget ? { providerId: input.resolvedRunTarget.providerId } : {}),
                                ...(input.resolvedRunTarget ? { modelId: input.resolvedRunTarget.modelId } : {}),
                                ...(input.workspaceFingerprint
                                    ? { workspaceFingerprint: input.workspaceFingerprint }
                                    : {}),
                                executionStrategy,
                            }),
                    },
                    applyResult: (result) => {
                        input.applyPlanWorkspaceUpdate(
                            result.found
                                ? {
                                      found: true,
                                      plan: result.plan,
                                  }
                                : { found: false }
                        );
                    },
                    onError: input.onError,
                    errorPrefix: 'Plan implementation failed',
                });
            });
        },
        onAbortOrchestrator: (orchestratorRunId) => {
            launchBackgroundTask(async () => {
                await runConversationPlanMutation({
                    mutation: {
                        mutateAsync: () =>
                            input.orchestratorAbortMutation.mutateAsync({
                                profileId: input.profileId,
                                orchestratorRunId,
                            }),
                    },
                    applyResult: (result) => {
                        if (result.aborted) {
                            input.applyOrchestratorWorkspaceUpdate(result.latest);
                        }
                    },
                    onError: input.onError,
                    errorPrefix: 'Orchestrator abort failed',
                });
            });
        },
    };
}
