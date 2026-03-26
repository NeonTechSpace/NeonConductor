import { useConversationShellViewModel } from '@/web/components/conversation/hooks/useConversationShellViewModel';
import { ContextAssetsPanel } from '@/web/components/conversation/panels/contextAssetsPanel';
import { DiffCheckpointPanel } from '@/web/components/conversation/panels/diffCheckpointPanel';
import { ExecutionEnvironmentPanel } from '@/web/components/conversation/panels/executionEnvironmentPanel';
import { MemoryPanel } from '@/web/components/conversation/panels/memoryPanel';
import { ModeExecutionPanel } from '@/web/components/conversation/panels/modeExecutionPanel';
import { useConversationMutations } from '@/web/components/conversation/shell/actions/useConversationMutations';
import { buildConversationPlanOrchestrator } from '@/web/components/conversation/shell/composition/buildConversationPlanOrchestrator';
import { useConversationQueries } from '@/web/components/conversation/shell/queries/useConversationQueries';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import { useConversationWorkspaceActions } from '@/web/components/conversation/shell/workspace/useConversationWorkspaceActions';

import type { EntityId, OrchestratorExecutionStrategy, ResolvedContextState, TopLevelTab } from '@/shared/contracts';

interface BuildConversationWorkspacePanelsInput {
    profileId: string;
    topLevelTab: TopLevelTab;
    selectedSessionId: string | undefined;
    selectedRunId: string | undefined;
    modeKey: string;
    shellViewModel: ReturnType<typeof useConversationShellViewModel>;
    queries: ReturnType<typeof useConversationQueries>;
    mutations: ReturnType<typeof useConversationMutations>;
    planOrchestrator: ReturnType<typeof buildConversationPlanOrchestrator>;
    workspaceActions: ReturnType<typeof useConversationWorkspaceActions>;
    onSelectThreadId: (threadId: string | undefined) => void;
    onSelectSessionId: (sessionId: string | undefined) => void;
    onSelectRunId: (runId: string | undefined) => void;
    onTopLevelTabChange: (topLevelTab: TopLevelTab) => void;
    executionStrategy: OrchestratorExecutionStrategy;
    onExecutionStrategyChange: (executionStrategy: OrchestratorExecutionStrategy) => void;
    contextState?: ResolvedContextState;
}

export function buildConversationWorkspacePanels(input: BuildConversationWorkspacePanelsInput) {
    const selectedThread = input.shellViewModel.selectedThread;
    const canConfigureExecutionStrategy =
        input.topLevelTab === 'orchestrator' &&
        selectedThread?.topLevelTab === 'orchestrator' &&
        !selectedThread.delegatedFromOrchestratorRunId &&
        selectedThread.id === selectedThread.rootThreadId;
    return {
        executionEnvironmentPanel: (
            <ExecutionEnvironmentPanel
                topLevelTab={input.topLevelTab}
                selectedThread={input.shellViewModel.selectedThread}
                workspaceScope={input.shellViewModel.workspaceScope}
                sandboxes={input.shellViewModel.visibleManagedSandboxes}
                busy={
                    input.mutations.configureThreadSandboxMutation.isPending ||
                    input.mutations.refreshSandboxMutation.isPending ||
                    input.mutations.removeSandboxMutation.isPending ||
                    input.mutations.removeOrphanedSandboxesMutation.isPending
                }
                {...(input.workspaceActions.feedbackMessage
                    ? {
                          feedbackMessage: input.workspaceActions.feedbackMessage,
                          feedbackTone: input.workspaceActions.feedbackTone,
                      }
                    : {})}
                onConfigureThread={(executionInput) => {
                    if (
                        !input.shellViewModel.selectedThread ||
                        !isEntityId(input.shellViewModel.selectedThread.id, 'thr')
                    ) {
                        return;
                    }
                    if (executionInput.mode === 'sandbox') {
                        if (!isEntityId(executionInput.sandboxId, 'sb')) {
                            return;
                        }
                        void input.workspaceActions.configureThreadExecution({
                            threadId: input.shellViewModel.selectedThread.id,
                            executionInput: {
                                mode: executionInput.mode,
                                sandboxId: executionInput.sandboxId,
                            },
                        });
                        return;
                    }
                    void input.workspaceActions.configureThreadExecution({
                        threadId: input.shellViewModel.selectedThread.id,
                        executionInput: {
                            mode: executionInput.mode,
                        },
                    });
                }}
                onRefreshSandbox={(sandboxId) => {
                    if (!isEntityId(sandboxId, 'sb')) {
                        return;
                    }
                    void input.workspaceActions.refreshSandbox(sandboxId);
                }}
                onRemoveSandbox={(sandboxId) => {
                    if (!isEntityId(sandboxId, 'sb')) {
                        return;
                    }
                    void input.workspaceActions.removeSandbox(sandboxId);
                }}
                onRemoveOrphaned={() => {
                    void input.workspaceActions.removeOrphanedSandboxes(
                        input.shellViewModel.selectedThread?.workspaceFingerprint
                    );
                }}
            />
        ),
        modeExecutionPanel:
            input.topLevelTab === 'orchestrator' || input.modeKey === 'plan' ? (
                <ModeExecutionPanel
                    topLevelTab={input.topLevelTab}
                    modeKey={input.modeKey}
                    isLoadingPlan={input.queries.activePlanQuery.isPending}
                    isPlanMutating={input.planOrchestrator.isPlanMutating}
                    isOrchestratorMutating={input.planOrchestrator.isOrchestratorMutating}
                    selectedExecutionStrategy={input.executionStrategy}
                    canConfigureExecutionStrategy={canConfigureExecutionStrategy}
                    {...(input.planOrchestrator.activePlan ? { activePlan: input.planOrchestrator.activePlan } : {})}
                    {...(input.planOrchestrator.orchestratorView
                        ? { orchestratorView: input.planOrchestrator.orchestratorView }
                        : {})}
                    onAnswerQuestion={input.planOrchestrator.onAnswerQuestion}
                    onRevisePlan={input.planOrchestrator.onRevisePlan}
                    onApprovePlan={input.planOrchestrator.onApprovePlan}
                    onExecutionStrategyChange={input.onExecutionStrategyChange}
                    onImplementPlan={input.planOrchestrator.onImplementPlan}
                    onAbortOrchestrator={input.planOrchestrator.onAbortOrchestrator}
                    onSelectChildThread={(threadId: EntityId<'thr'>) => {
                        input.onTopLevelTabChange('agent');
                        input.onSelectThreadId(threadId);
                        input.onSelectSessionId(undefined);
                        input.onSelectRunId(undefined);
                    }}
                />
            ) : undefined,
        contextAssetsPanel:
            input.topLevelTab !== 'chat' && isEntityId(input.selectedSessionId, 'sess') ? (
                <ContextAssetsPanel
                    profileId={input.profileId}
                    sessionId={input.selectedSessionId}
                    topLevelTab={input.topLevelTab}
                    modeKey={input.modeKey}
                    {...(input.shellViewModel.selectedThread?.workspaceFingerprint
                        ? { workspaceFingerprint: input.shellViewModel.selectedThread.workspaceFingerprint }
                        : {})}
                    {...(input.shellViewModel.effectiveSelectedSandboxId
                        ? { sandboxId: input.shellViewModel.effectiveSelectedSandboxId }
                        : {})}
                    attachedRules={input.shellViewModel.attachedRules}
                    missingAttachedRuleKeys={input.shellViewModel.missingAttachedRuleKeys}
                    attachedSkills={input.shellViewModel.attachedSkills}
                    missingAttachedSkillKeys={input.shellViewModel.missingAttachedSkillKeys}
                />
            ) : undefined,
        memoryPanel: selectedThread ? (
            <MemoryPanel
                profileId={input.profileId}
                topLevelTab={input.topLevelTab}
                modeKey={input.modeKey}
                {...(selectedThread.workspaceFingerprint
                    ? { workspaceFingerprint: selectedThread.workspaceFingerprint }
                    : {})}
                {...(input.shellViewModel.effectiveSelectedSandboxId
                    ? { sandboxId: input.shellViewModel.effectiveSelectedSandboxId }
                    : {})}
                {...(isEntityId(selectedThread.id, 'thr') ? { threadId: selectedThread.id } : {})}
                {...(isEntityId(input.selectedRunId, 'run') ? { runId: input.selectedRunId } : {})}
                {...(input.contextState ? { retrievedMemory: input.contextState.retrievedMemory } : {})}
            />
        ) : undefined,
        diffCheckpointPanel:
            input.topLevelTab !== 'chat' ? (
                <DiffCheckpointPanel
                    profileId={input.profileId}
                    {...(isEntityId(input.selectedRunId, 'run') ? { selectedRunId: input.selectedRunId } : {})}
                    {...(isEntityId(input.selectedSessionId, 'sess')
                        ? { selectedSessionId: input.selectedSessionId }
                        : {})}
                    diffs={input.queries.runDiffsQuery.data?.diffs ?? []}
                    checkpoints={input.queries.checkpointsQuery.data?.checkpoints ?? []}
                    {...(input.queries.checkpointsQuery.data?.storage
                        ? { checkpointStorage: input.queries.checkpointsQuery.data.storage }
                        : {})}
                    disabled={input.mutations.startRunMutation.isPending || input.mutations.planStartMutation.isPending}
                />
            ) : undefined,
    };
}
