import { describe, expect, it, vi } from 'vitest';

import { buildConversationPlanOrchestrator } from '@/web/components/conversation/shell/composition/buildConversationPlanOrchestrator';
import { runConversationPlanMutation } from '@/web/components/conversation/shell/composition/planImplementationController';

import type { OrchestratorRunRecord, OrchestratorStepRecord } from '@/app/backend/persistence/types';

import type { PlanRecordView, RuntimeRunOptions } from '@/shared/contracts';

function createRuntimeOptions(): RuntimeRunOptions {
    return {
        reasoning: {
            effort: 'medium',
            summary: 'auto',
            includeEncrypted: false,
        },
        cache: {
            strategy: 'auto',
        },
        transport: {
            family: 'auto',
        },
    };
}

function createPlanRecord(): PlanRecordView {
    return {
        id: 'plan_1',
        profileId: 'profile_default',
        sessionId: 'sess_1',
        topLevelTab: 'orchestrator',
        modeKey: 'plan',
        status: 'approved',
        sourcePrompt: 'Ship it',
        summaryMarkdown: 'Approved summary',
        currentRevisionId: 'prev_1',
        currentRevisionNumber: 2,
        currentVariantId: 'pvar_main',
        currentVariantName: 'main',
        approvedRevisionId: 'prev_1',
        approvedRevisionNumber: 2,
        approvedVariantId: 'pvar_main',
        approvedVariantName: 'main',
        questions: [],
        variants: [
            {
                id: 'pvar_main',
                name: 'main',
                currentRevisionId: 'prev_1',
                currentRevisionNumber: 2,
                isCurrent: true,
                isApproved: true,
                createdAt: '2026-03-27T10:00:00.000Z',
            },
        ],
        followUps: [],
        history: [],
        items: [
            {
                id: 'step_1',
                sequence: 1,
                description: 'Implement',
                status: 'pending',
            },
        ],
        workspaceFingerprint: 'ws_1',
        createdAt: '2026-03-27T10:00:00.000Z',
        updatedAt: '2026-03-27T10:00:00.000Z',
    };
}

function createPlanViewMutationMock() {
    return {
        isPending: false,
        mutateAsync: vi.fn(),
    };
}

function createLatestOrchestratorState(): {
    found: true;
    run: OrchestratorRunRecord;
    steps: OrchestratorStepRecord[];
} {
    return {
        found: true,
        run: {
            id: 'orch_1',
            profileId: 'profile_default',
            sessionId: 'sess_1',
            planId: 'plan_1',
            planRevisionId: 'prev_1',
            status: 'aborted',
            executionStrategy: 'parallel',
            startedAt: '2026-03-27T10:00:00.000Z',
            abortedAt: '2026-03-27T10:05:00.000Z',
            createdAt: '2026-03-27T10:00:00.000Z',
            updatedAt: '2026-03-27T10:05:00.000Z',
        },
        steps: [
            {
                id: 'step_1',
                orchestratorRunId: 'orch_1',
                sequence: 1,
                description: 'Implement',
                status: 'aborted',
                createdAt: '2026-03-27T10:00:00.000Z',
                updatedAt: '2026-03-27T10:05:00.000Z',
            },
        ],
    };
}

async function flushAsyncActions(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

describe('runConversationPlanMutation', () => {
    it('applies successful mutation results', async () => {
        const applyResult = vi.fn();
        const onError = vi.fn();

        await runConversationPlanMutation({
            mutation: {
                mutateAsync: () => Promise.resolve({ found: true as const }),
            },
            applyResult,
            onError,
            errorPrefix: 'Plan answer failed',
        });

        expect(applyResult).toHaveBeenCalledWith({ found: true });
        expect(onError).not.toHaveBeenCalled();
    });

    it('forwards the current revision id when approving a visible plan', async () => {
        const planApproveMutation = {
            isPending: false,
            mutateAsync: vi.fn().mockResolvedValue({
                found: true as const,
                plan: createPlanRecord(),
            }),
        };

        const orchestrator = buildConversationPlanOrchestrator({
            profileId: 'profile_default',
            applyPlanWorkspaceUpdate: vi.fn(),
            applyOrchestratorWorkspaceUpdate: vi.fn(),
            onError: vi.fn(),
            resolvedRunTarget: undefined,
            runtimeOptions: createRuntimeOptions(),
            workspaceFingerprint: 'ws_1',
            activePlan: createPlanRecord(),
            orchestratorView: undefined,
            planStartMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planAnswerMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planStartResearchBatchMutation: createPlanViewMutationMock(),
            planReviseMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planEnterAdvancedPlanningMutation: createPlanViewMutationMock(),
            planCreateVariantMutation: createPlanViewMutationMock(),
            planActivateVariantMutation: createPlanViewMutationMock(),
            planResumeFromRevisionMutation: createPlanViewMutationMock(),
            planResolveFollowUpMutation: createPlanViewMutationMock(),
            planAbortResearchBatchMutation: createPlanViewMutationMock(),
            planGenerateDraftMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planCancelMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planApproveMutation,
            planImplementMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            orchestratorAbortMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
        });

        orchestrator.actionController.onApprovePlan('plan_1', 'prev_1');
        await flushAsyncActions();

        expect(planApproveMutation.mutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_default',
            planId: 'plan_1',
            revisionId: 'prev_1',
        });
    });

    it('routes draft generation through the dedicated action controller with the resolved run target', async () => {
        const planGenerateDraftMutation = {
            isPending: false,
            mutateAsync: vi.fn().mockResolvedValue({
                found: true as const,
                plan: createPlanRecord(),
            }),
        };

        const orchestrator = buildConversationPlanOrchestrator({
            profileId: 'profile_default',
            applyPlanWorkspaceUpdate: vi.fn(),
            applyOrchestratorWorkspaceUpdate: vi.fn(),
            onError: vi.fn(),
            resolvedRunTarget: {
                providerId: 'openai',
                modelId: 'gpt-5',
            },
            runtimeOptions: createRuntimeOptions(),
            workspaceFingerprint: 'ws_1',
            activePlan: createPlanRecord(),
            orchestratorView: undefined,
            planStartMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planAnswerMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planStartResearchBatchMutation: createPlanViewMutationMock(),
            planReviseMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planEnterAdvancedPlanningMutation: createPlanViewMutationMock(),
            planCreateVariantMutation: createPlanViewMutationMock(),
            planActivateVariantMutation: createPlanViewMutationMock(),
            planResumeFromRevisionMutation: createPlanViewMutationMock(),
            planResolveFollowUpMutation: createPlanViewMutationMock(),
            planAbortResearchBatchMutation: createPlanViewMutationMock(),
            planGenerateDraftMutation,
            planCancelMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planApproveMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planImplementMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            orchestratorAbortMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
        });

        orchestrator.actionController.onGenerateDraft('plan_1');
        await flushAsyncActions();

        expect(planGenerateDraftMutation.mutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_default',
            planId: 'plan_1',
            runtimeOptions: createRuntimeOptions(),
            providerId: 'openai',
            modelId: 'gpt-5',
            workspaceFingerprint: 'ws_1',
        });
    });

    it('routes plan cancellation through the dedicated action controller', async () => {
        const planCancelMutation = {
            isPending: false,
            mutateAsync: vi.fn().mockResolvedValue({
                found: true as const,
                plan: {
                    ...createPlanRecord(),
                    status: 'cancelled' as const,
                },
            }),
        };

        const applyPlanWorkspaceUpdate = vi.fn();

        const orchestrator = buildConversationPlanOrchestrator({
            profileId: 'profile_default',
            applyPlanWorkspaceUpdate,
            applyOrchestratorWorkspaceUpdate: vi.fn(),
            onError: vi.fn(),
            resolvedRunTarget: undefined,
            runtimeOptions: createRuntimeOptions(),
            workspaceFingerprint: 'ws_1',
            activePlan: createPlanRecord(),
            orchestratorView: undefined,
            planStartMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planAnswerMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planStartResearchBatchMutation: createPlanViewMutationMock(),
            planReviseMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planEnterAdvancedPlanningMutation: createPlanViewMutationMock(),
            planCreateVariantMutation: createPlanViewMutationMock(),
            planActivateVariantMutation: createPlanViewMutationMock(),
            planResumeFromRevisionMutation: createPlanViewMutationMock(),
            planResolveFollowUpMutation: createPlanViewMutationMock(),
            planAbortResearchBatchMutation: createPlanViewMutationMock(),
            planGenerateDraftMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planCancelMutation,
            planApproveMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planImplementMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            orchestratorAbortMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
        });

        orchestrator.actionController.onCancelPlan('plan_1');
        await flushAsyncActions();

        expect(planCancelMutation.mutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_default',
            planId: 'plan_1',
        });
        expect(applyPlanWorkspaceUpdate).toHaveBeenCalledWith({
            found: true,
            plan: {
                ...createPlanRecord(),
                status: 'cancelled',
            },
        });
    });

    it('routes recovery variant and resume actions through the dedicated action controller', async () => {
        const applyPlanWorkspaceUpdate = vi.fn();
        const planCreateVariantMutation = {
            isPending: false,
            mutateAsync: vi.fn().mockResolvedValue({
                found: true as const,
                plan: createPlanRecord(),
            }),
        };
        const planResumeFromRevisionMutation = {
            isPending: false,
            mutateAsync: vi.fn().mockResolvedValue({
                found: true as const,
                plan: createPlanRecord(),
            }),
        };
        const planResolveFollowUpMutation = {
            isPending: false,
            mutateAsync: vi.fn().mockResolvedValue({
                found: true as const,
                plan: createPlanRecord(),
            }),
        };

        const orchestrator = buildConversationPlanOrchestrator({
            profileId: 'profile_default',
            applyPlanWorkspaceUpdate,
            applyOrchestratorWorkspaceUpdate: vi.fn(),
            onError: vi.fn(),
            resolvedRunTarget: undefined,
            runtimeOptions: createRuntimeOptions(),
            workspaceFingerprint: 'ws_1',
            activePlan: createPlanRecord(),
            orchestratorView: undefined,
            planStartMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planAnswerMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planStartResearchBatchMutation: createPlanViewMutationMock(),
            planReviseMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planEnterAdvancedPlanningMutation: createPlanViewMutationMock(),
            planCreateVariantMutation,
            planActivateVariantMutation: createPlanViewMutationMock(),
            planResumeFromRevisionMutation,
            planResolveFollowUpMutation,
            planAbortResearchBatchMutation: createPlanViewMutationMock(),
            planGenerateDraftMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planCancelMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planApproveMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planImplementMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            orchestratorAbortMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
        });

        orchestrator.actionController.onCreateVariant('plan_1', 'prev_1');
        orchestrator.actionController.onResumeFromRevision('plan_1', 'prev_1');
        orchestrator.actionController.onResolveFollowUp('plan_1', 'pfu_1');
        await flushAsyncActions();
        await flushAsyncActions();

        expect(planCreateVariantMutation.mutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_default',
            planId: 'plan_1',
            sourceRevisionId: 'prev_1',
        });
        expect(planResumeFromRevisionMutation.mutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_default',
            planId: 'plan_1',
            sourceRevisionId: 'prev_1',
        });
        expect(planResolveFollowUpMutation.mutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_default',
            planId: 'plan_1',
            followUpId: 'pfu_1',
            status: 'resolved',
        });
        expect(applyPlanWorkspaceUpdate).toHaveBeenCalledTimes(3);
    });

    it('routes rejected mutation errors through the provided error handler', async () => {
        const applyResult = vi.fn();
        const onError = vi.fn();

        await runConversationPlanMutation({
            mutation: {
                mutateAsync: () => Promise.reject(new Error('network down')),
            },
            applyResult,
            onError,
            errorPrefix: 'Plan revision failed',
        });

        expect(applyResult).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith('Plan revision failed: network down');
    });
});

describe('buildConversationPlanOrchestrator', () => {
    it('routes plan implementation through the dedicated action controller with the resolved run target', async () => {
        const applyPlanWorkspaceUpdate = vi.fn();
        const applyOrchestratorWorkspaceUpdate = vi.fn();
        const onError = vi.fn();
        const planImplementMutation = {
            isPending: false,
            mutateAsync: vi.fn().mockResolvedValue({
                found: true as const,
                plan: createPlanRecord(),
                started: true as const,
                mode: 'orchestrator.orchestrate' as const,
            }),
        };

        const orchestrator = buildConversationPlanOrchestrator({
            profileId: 'profile_default',
            applyPlanWorkspaceUpdate,
            applyOrchestratorWorkspaceUpdate,
            onError,
            resolvedRunTarget: {
                providerId: 'openai',
                modelId: 'gpt-5',
            },
            runtimeOptions: createRuntimeOptions(),
            workspaceFingerprint: 'ws_1',
            activePlan: createPlanRecord(),
            orchestratorView: undefined,
            planStartMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planAnswerMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planStartResearchBatchMutation: createPlanViewMutationMock(),
            planReviseMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planEnterAdvancedPlanningMutation: createPlanViewMutationMock(),
            planCreateVariantMutation: createPlanViewMutationMock(),
            planActivateVariantMutation: createPlanViewMutationMock(),
            planResumeFromRevisionMutation: createPlanViewMutationMock(),
            planResolveFollowUpMutation: createPlanViewMutationMock(),
            planAbortResearchBatchMutation: createPlanViewMutationMock(),
            planGenerateDraftMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planCancelMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planApproveMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planImplementMutation,
            orchestratorAbortMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
        });

        orchestrator.actionController.onImplementPlan('plan_1', 'parallel');
        await flushAsyncActions();

        expect(planImplementMutation.mutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_default',
            planId: 'plan_1',
            runtimeOptions: createRuntimeOptions(),
            providerId: 'openai',
            modelId: 'gpt-5',
            workspaceFingerprint: 'ws_1',
            executionStrategy: 'parallel',
        });
        expect(applyPlanWorkspaceUpdate).toHaveBeenCalledWith({
            found: true,
            plan: createPlanRecord(),
        });
        expect(applyOrchestratorWorkspaceUpdate).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
    });

    it('updates orchestrator workspace state only when abort succeeds', async () => {
        const applyPlanWorkspaceUpdate = vi.fn();
        const applyOrchestratorWorkspaceUpdate = vi.fn();
        const latest = createLatestOrchestratorState();
        const orchestratorAbortMutation = {
            isPending: false,
            mutateAsync: vi
                .fn()
                .mockResolvedValueOnce({
                    aborted: true as const,
                    runId: 'orch_1',
                    latest,
                })
                .mockResolvedValueOnce({
                    aborted: false as const,
                    reason: 'not_found' as const,
                }),
        };

        const orchestrator = buildConversationPlanOrchestrator({
            profileId: 'profile_default',
            applyPlanWorkspaceUpdate,
            applyOrchestratorWorkspaceUpdate,
            onError: vi.fn(),
            resolvedRunTarget: undefined,
            runtimeOptions: createRuntimeOptions(),
            workspaceFingerprint: undefined,
            activePlan: createPlanRecord(),
            orchestratorView: latest,
            planStartMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planAnswerMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planStartResearchBatchMutation: createPlanViewMutationMock(),
            planReviseMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planEnterAdvancedPlanningMutation: createPlanViewMutationMock(),
            planCreateVariantMutation: createPlanViewMutationMock(),
            planActivateVariantMutation: createPlanViewMutationMock(),
            planResumeFromRevisionMutation: createPlanViewMutationMock(),
            planResolveFollowUpMutation: createPlanViewMutationMock(),
            planAbortResearchBatchMutation: createPlanViewMutationMock(),
            planGenerateDraftMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planCancelMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planApproveMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            planImplementMutation: {
                isPending: false,
                mutateAsync: vi.fn(),
            },
            orchestratorAbortMutation,
        });

        orchestrator.actionController.onAbortOrchestrator('orch_1');
        await flushAsyncActions();
        orchestrator.actionController.onAbortOrchestrator('orch_1');
        await flushAsyncActions();

        expect(applyOrchestratorWorkspaceUpdate).toHaveBeenCalledTimes(1);
        expect(applyOrchestratorWorkspaceUpdate).toHaveBeenCalledWith(latest);
        expect(applyPlanWorkspaceUpdate).not.toHaveBeenCalled();
    });
});
