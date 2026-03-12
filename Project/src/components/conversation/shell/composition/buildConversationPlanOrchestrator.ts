import type { ModeExecutionPanelProps } from '@/web/components/conversation/panels/modeExecutionPanel';
import type { RunTargetSelection } from '@/web/components/conversation/shell/workspace/helpers';

import type { OrchestratorRunRecord, OrchestratorStepRecord } from '@/app/backend/persistence/types';

import type { EntityId, PlanRecordView, RuntimeProviderId, RuntimeRunOptions } from '@/shared/contracts';

interface MutationLike<TInput, TResult> {
    isPending: boolean;
    mutateAsync: (input: TInput) => Promise<TResult>;
}

interface BuildConversationPlanOrchestratorInput {
    profileId: string;
    applyPlanWorkspaceUpdate: (result: { found: false } | { found: true; plan: PlanRecordView }) => void;
    applyOrchestratorWorkspaceUpdate: (
        result: { found: false } | { found: true; run: OrchestratorRunRecord; steps: OrchestratorStepRecord[] }
    ) => void;
    onError: (message: string) => void;
    resolvedRunTarget: RunTargetSelection | undefined;
    runtimeOptions: RuntimeRunOptions;
    workspaceFingerprint: string | undefined;
    activePlan: ModeExecutionPanelProps['activePlan'];
    orchestratorView: ModeExecutionPanelProps['orchestratorView'];
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
    planApproveMutation: MutationLike<
        {
            profileId: string;
            planId: EntityId<'plan'>;
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

export function buildConversationPlanOrchestrator(input: BuildConversationPlanOrchestratorInput): {
    isPlanMutating: boolean;
    isOrchestratorMutating: boolean;
    activePlan: ModeExecutionPanelProps['activePlan'];
    orchestratorView: ModeExecutionPanelProps['orchestratorView'];
    onAnswerQuestion: ModeExecutionPanelProps['onAnswerQuestion'];
    onRevisePlan: ModeExecutionPanelProps['onRevisePlan'];
    onApprovePlan: ModeExecutionPanelProps['onApprovePlan'];
    onImplementPlan: ModeExecutionPanelProps['onImplementPlan'];
    onAbortOrchestrator: ModeExecutionPanelProps['onAbortOrchestrator'];
} {
    return {
        isPlanMutating:
            input.planStartMutation.isPending ||
            input.planAnswerMutation.isPending ||
            input.planReviseMutation.isPending ||
            input.planApproveMutation.isPending ||
            input.planImplementMutation.isPending,
        isOrchestratorMutating: input.orchestratorAbortMutation.isPending,
        activePlan: input.activePlan,
        orchestratorView: input.orchestratorView,
        onAnswerQuestion: (planId, questionId, answer) => {
            void input.planAnswerMutation
                .mutateAsync({
                    profileId: input.profileId,
                    planId,
                    questionId,
                    answer,
                })
                .then((result) => {
                    input.applyPlanWorkspaceUpdate(result);
                });
        },
        onRevisePlan: (planId, summaryMarkdown, items) => {
            void input.planReviseMutation
                .mutateAsync({
                    profileId: input.profileId,
                    planId,
                    summaryMarkdown,
                    items: items.map((description) => ({ description })),
                })
                .then((result) => {
                    input.applyPlanWorkspaceUpdate(result);
                });
        },
        onApprovePlan: (planId) => {
            void input.planApproveMutation
                .mutateAsync({
                    profileId: input.profileId,
                    planId,
                })
                .then((result) => {
                    input.applyPlanWorkspaceUpdate(result);
                })
                .catch((error: unknown) => {
                    const message = error instanceof Error ? error.message : String(error);
                    input.onError(`Plan approval failed: ${message}`);
                });
        },
        onImplementPlan: (planId) => {
            void input.planImplementMutation
                .mutateAsync({
                    profileId: input.profileId,
                    planId,
                    runtimeOptions: input.runtimeOptions,
                    ...(input.resolvedRunTarget ? { providerId: input.resolvedRunTarget.providerId } : {}),
                    ...(input.resolvedRunTarget ? { modelId: input.resolvedRunTarget.modelId } : {}),
                    ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
                })
                .then((result) => {
                    input.applyPlanWorkspaceUpdate(
                        result.found
                            ? {
                                  found: true,
                                  plan: result.plan,
                              }
                            : { found: false }
                    );
                })
                .catch((error: unknown) => {
                    const message = error instanceof Error ? error.message : String(error);
                    input.onError(`Plan implementation failed: ${message}`);
                });
        },
        onAbortOrchestrator: (orchestratorRunId) => {
            void input.orchestratorAbortMutation
                .mutateAsync({
                    profileId: input.profileId,
                    orchestratorRunId,
                })
                .then((result) => {
                    if (result.aborted) {
                        input.applyOrchestratorWorkspaceUpdate(result.latest);
                    }
                });
        },
    };
}
