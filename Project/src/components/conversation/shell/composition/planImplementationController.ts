import type { ConversationActivePlanData } from '@/web/components/conversation/shell/useConversationShellViewControllers.types';
import type { RunTargetSelection } from '@/web/components/conversation/shell/workspace/helpers';

import type { OrchestratorRunRecord, OrchestratorStepRecord } from '@/app/backend/persistence/types';

import { launchBackgroundTask } from '@/shared/async/launchBackgroundTask';
import type {
    EntityId,
    PlanAdvancedSnapshotInput,
    OrchestratorExecutionStrategy,
    PlanRecordView,
    RuntimeProviderId,
    RuntimeRunOptions,
} from '@/shared/contracts';

interface MutationLike<TInput, TResult> {
    isPending: boolean;
    mutateAsync: (input: TInput) => Promise<TResult>;
}

type ConversationActivePlanRecord = Extract<ConversationActivePlanData, { found: true }>['plan'];

export interface CreatePlanImplementationControllerInput {
    profileId: string;
    applyPlanWorkspaceUpdate: (result: ConversationActivePlanData) => void;
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
        ConversationActivePlanData
    >;
    planStartResearchBatchMutation: MutationLike<
        {
            profileId: string;
            planId: EntityId<'plan'>;
            promptMarkdown: string;
            workerCount: number;
            runtimeOptions: RuntimeRunOptions;
            providerId?: RuntimeProviderId;
            modelId?: string;
            workspaceFingerprint?: string;
        },
        ConversationActivePlanData
    >;
    planReviseMutation: MutationLike<
        {
            profileId: string;
            planId: EntityId<'plan'>;
            summaryMarkdown: string;
            items: Array<{ description: string }>;
            advancedSnapshot?: PlanAdvancedSnapshotInput;
        },
        ConversationActivePlanData
    >;
    planEnterAdvancedPlanningMutation: MutationLike<
        {
            profileId: string;
            planId: EntityId<'plan'>;
        },
        ConversationActivePlanData
    >;
    planCreateVariantMutation: MutationLike<
        {
            profileId: string;
            planId: EntityId<'plan'>;
            sourceRevisionId: EntityId<'prev'>;
        },
        ConversationActivePlanData
    >;
    planActivateVariantMutation: MutationLike<
        {
            profileId: string;
            planId: EntityId<'plan'>;
            variantId: EntityId<'pvar'>;
        },
        ConversationActivePlanData
    >;
    planResumeFromRevisionMutation: MutationLike<
        {
            profileId: string;
            planId: EntityId<'plan'>;
            sourceRevisionId: EntityId<'prev'>;
        },
        ConversationActivePlanData
    >;
    planResolveFollowUpMutation: MutationLike<
        {
            profileId: string;
            planId: EntityId<'plan'>;
            followUpId: EntityId<'pfu'>;
            status: 'resolved' | 'dismissed';
            responseMarkdown?: string;
        },
        ConversationActivePlanData
    >;
    planAbortResearchBatchMutation: MutationLike<
        {
            profileId: string;
            planId: EntityId<'plan'>;
            researchBatchId: EntityId<'prb'>;
        },
        ConversationActivePlanData
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
        ConversationActivePlanData
    >;
    planCancelMutation: MutationLike<
        {
            profileId: string;
            planId: EntityId<'plan'>;
        },
        ConversationActivePlanData
    >;
    planApproveMutation: MutationLike<
        {
            profileId: string;
            planId: EntityId<'plan'>;
            revisionId: EntityId<'prev'>;
        },
        ConversationActivePlanData
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
        | { found: true; plan: ConversationActivePlanRecord }
        | {
              found: true;
              plan: ConversationActivePlanRecord;
              started: true;
              mode: 'agent.code' | 'orchestrator.orchestrate';
          }
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
    onStartResearchBatch: (planId: EntityId<'plan'>, promptMarkdown: string, workerCount: number) => void;
    onRevisePlan: (
        planId: EntityId<'plan'>,
        summaryMarkdown: string,
        items: string[],
        advancedSnapshot?: PlanAdvancedSnapshotInput
    ) => void;
    onEnterAdvancedPlanning: (planId: EntityId<'plan'>) => void;
    onCreateVariant: (planId: EntityId<'plan'>, sourceRevisionId: EntityId<'prev'>) => void;
    onActivateVariant: (planId: EntityId<'plan'>, variantId: EntityId<'pvar'>) => void;
    onResumeFromRevision: (planId: EntityId<'plan'>, sourceRevisionId: EntityId<'prev'>) => void;
    onResolveFollowUp: (planId: EntityId<'plan'>, followUpId: EntityId<'pfu'>) => void;
    onAbortResearchBatch: (planId: EntityId<'plan'>, researchBatchId: EntityId<'prb'>) => void;
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
            input.planStartResearchBatchMutation.isPending ||
            input.planReviseMutation.isPending ||
            input.planEnterAdvancedPlanningMutation.isPending ||
            input.planCreateVariantMutation.isPending ||
            input.planActivateVariantMutation.isPending ||
            input.planResumeFromRevisionMutation.isPending ||
            input.planResolveFollowUpMutation.isPending ||
            input.planAbortResearchBatchMutation.isPending ||
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
        onStartResearchBatch: (planId, promptMarkdown, workerCount) => {
            launchBackgroundTask(async () => {
                await runConversationPlanMutation({
                    mutation: {
                        mutateAsync: () =>
                            input.planStartResearchBatchMutation.mutateAsync({
                                profileId: input.profileId,
                                planId,
                                promptMarkdown,
                                workerCount,
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
                    errorPrefix: 'Planner research start failed',
                });
            });
        },
        onRevisePlan: (planId, summaryMarkdown, items, advancedSnapshot) => {
            launchBackgroundTask(async () => {
                await runConversationPlanMutation({
                    mutation: {
                        mutateAsync: () =>
                            input.planReviseMutation.mutateAsync({
                                profileId: input.profileId,
                                planId,
                                summaryMarkdown,
                                items: items.map((description) => ({ description })),
                                ...(advancedSnapshot ? { advancedSnapshot } : {}),
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
        onEnterAdvancedPlanning: (planId) => {
            launchBackgroundTask(async () => {
                await runConversationPlanMutation({
                    mutation: {
                        mutateAsync: () =>
                            input.planEnterAdvancedPlanningMutation.mutateAsync({
                                profileId: input.profileId,
                                planId,
                            }),
                    },
                    applyResult: (result) => {
                        input.applyPlanWorkspaceUpdate(result);
                    },
                    onError: input.onError,
                    errorPrefix: 'Advanced planning upgrade failed',
                });
            });
        },
        onCreateVariant: (planId, sourceRevisionId) => {
            launchBackgroundTask(async () => {
                await runConversationPlanMutation({
                    mutation: {
                        mutateAsync: () =>
                            input.planCreateVariantMutation.mutateAsync({
                                profileId: input.profileId,
                                planId,
                                sourceRevisionId,
                            }),
                    },
                    applyResult: (result) => {
                        input.applyPlanWorkspaceUpdate(result);
                    },
                    onError: input.onError,
                    errorPrefix: 'Plan branching failed',
                });
            });
        },
        onActivateVariant: (planId, variantId) => {
            launchBackgroundTask(async () => {
                await runConversationPlanMutation({
                    mutation: {
                        mutateAsync: () =>
                            input.planActivateVariantMutation.mutateAsync({
                                profileId: input.profileId,
                                planId,
                                variantId,
                            }),
                    },
                    applyResult: (result) => {
                        input.applyPlanWorkspaceUpdate(result);
                    },
                    onError: input.onError,
                    errorPrefix: 'Plan variant activation failed',
                });
            });
        },
        onResumeFromRevision: (planId, sourceRevisionId) => {
            launchBackgroundTask(async () => {
                await runConversationPlanMutation({
                    mutation: {
                        mutateAsync: () =>
                            input.planResumeFromRevisionMutation.mutateAsync({
                                profileId: input.profileId,
                                planId,
                                sourceRevisionId,
                            }),
                    },
                    applyResult: (result) => {
                        input.applyPlanWorkspaceUpdate(result);
                    },
                    onError: input.onError,
                    errorPrefix: 'Plan resume failed',
                });
            });
        },
        onResolveFollowUp: (planId, followUpId) => {
            launchBackgroundTask(async () => {
                await runConversationPlanMutation({
                    mutation: {
                        mutateAsync: () =>
                            input.planResolveFollowUpMutation.mutateAsync({
                                profileId: input.profileId,
                                planId,
                                followUpId,
                                status: 'resolved',
                            }),
                    },
                    applyResult: (result) => {
                        input.applyPlanWorkspaceUpdate(result);
                    },
                    onError: input.onError,
                    errorPrefix: 'Plan follow-up resolution failed',
                });
            });
        },
        onAbortResearchBatch: (planId, researchBatchId) => {
            launchBackgroundTask(async () => {
                await runConversationPlanMutation({
                    mutation: {
                        mutateAsync: () =>
                            input.planAbortResearchBatchMutation.mutateAsync({
                                profileId: input.profileId,
                                planId,
                                researchBatchId,
                            }),
                    },
                    applyResult: (result) => {
                        input.applyPlanWorkspaceUpdate(result);
                    },
                    onError: input.onError,
                    errorPrefix: 'Planner research abort failed',
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
