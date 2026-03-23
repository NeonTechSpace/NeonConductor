import { useEffectEvent, useState } from 'react';

import { setResolvedContextStateCache } from '@/web/components/context/contextStateCache';
import { useConversationShellBranchWorkflowFlow } from '@/web/components/conversation/hooks/useConversationShellBranchWorkflowFlow';
import { useConversationShellComposer } from '@/web/components/conversation/hooks/useConversationShellComposer';
import { useConversationShellEditFlow } from '@/web/components/conversation/hooks/useConversationShellEditFlow';
import { useConversationShellRoutingBadge } from '@/web/components/conversation/hooks/useConversationShellRoutingBadge';
import { useConversationShellSessionActions } from '@/web/components/conversation/hooks/useConversationShellSessionActions';
import { useConversationShellViewModel } from '@/web/components/conversation/hooks/useConversationShellViewModel';
import { useConversationUiState } from '@/web/components/conversation/hooks/useConversationUiState';
import { useThreadSidebarState } from '@/web/components/conversation/hooks/useThreadSidebarState';
import { BranchWorkflowDialog } from '@/web/components/conversation/panels/branchWorkflowDialog';
import { MessageEditDialog } from '@/web/components/conversation/panels/messageEditDialog';
import { useConversationMutations } from '@/web/components/conversation/shell/actions/useConversationMutations';
import { buildConversationPlanOrchestrator } from '@/web/components/conversation/shell/composition/buildConversationPlanOrchestrator';
import { buildConversationWorkspacePanelProps } from '@/web/components/conversation/shell/composition/buildConversationWorkspacePanelProps';
import { buildConversationWorkspacePanels } from '@/web/components/conversation/shell/composition/buildConversationWorkspacePanels';
import { buildConversationWorkspaceSectionState } from '@/web/components/conversation/shell/composition/buildConversationWorkspaceSectionState';
import { ConversationWorkspaceSection } from '@/web/components/conversation/shell/composition/conversationWorkspaceSection';
import { applyConversationSessionCacheUpdate } from '@/web/components/conversation/shell/conversationShellCache';
import {
    resolveOrchestratorExecutionStrategyDraft,
    resolveOrchestratorStrategyRootThreadId,
    updateOrchestratorExecutionStrategyDraft,
} from '@/web/components/conversation/shell/orchestratorExecutionStrategyDrafts';
import { setActivePlanCache, setOrchestratorLatestCache } from '@/web/components/conversation/shell/planCache';
import { useConversationQueries } from '@/web/components/conversation/shell/queries/useConversationQueries';
import { useConversationShellSync } from '@/web/components/conversation/shell/useConversationShellSync';
import {
    buildRuntimeRunOptions,
    type ConversationModeOption,
    DEFAULT_REASONING_EFFORT,
    isEntityId,
    isProviderId,
    modeRequiresNativeTools,
} from '@/web/components/conversation/shell/workspace/helpers';
import { createConversationThread } from '@/web/components/conversation/shell/workspace/createConversationThread';
import { useConversationRunTarget } from '@/web/components/conversation/shell/workspace/useConversationRunTarget';
import { useConversationWorkspaceActions } from '@/web/components/conversation/shell/workspace/useConversationWorkspaceActions';
import { ConversationSidebarPane } from '@/web/components/conversation/sidebar/conversationSidebarPane';
import { buildModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import type { ConversationShellBootChromeReadiness } from '@/web/components/runtime/bootReadiness';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { useRuntimeEventStreamStore } from '@/web/lib/runtime/eventStream';
import { trpc } from '@/web/trpc/client';

import type { RunRecord, SessionSummaryRecord, ThreadListRecord } from '@/app/backend/persistence/types';

import type {
    OrchestratorExecutionStrategy,
    PlanRecordView,
    RuntimeProviderId,
    RuntimeReasoningEffort,
    TopLevelTab,
} from '@/shared/contracts';
import {
    DEFAULT_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY,
    DEFAULT_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
} from '@/shared/contracts';

interface ConversationShellProps {
    profileId: string;
    profiles: Array<{ id: string; name: string }>;
    selectedProfileId: string | undefined;
    topLevelTab: TopLevelTab;
    selectedWorkspaceFingerprint?: string;
    modeKey: string;
    modes: ConversationModeOption[];
    onModeChange: (modeKey: string) => void;
    onTopLevelTabChange: (nextTab: TopLevelTab) => void;
    onSelectedWorkspaceFingerprintChange?: (workspaceFingerprint: string | undefined) => void;
    onProfileChange: (profileId: string) => void;
    onBootChromeReadyChange?: (readiness: ConversationShellBootChromeReadiness) => void;
}

export function ConversationShell({
    profileId,
    profiles,
    selectedProfileId,
    topLevelTab,
    selectedWorkspaceFingerprint,
    modeKey,
    modes,
    onModeChange,
    onTopLevelTabChange,
    onSelectedWorkspaceFingerprintChange,
    onProfileChange,
    onBootChromeReadyChange,
}: ConversationShellProps) {
    const activeMode = modes.find((candidate) => candidate.modeKey === modeKey);
    const activeModeRequiresNativeTools = modeRequiresNativeTools(activeMode);
    const [tabSwitchNotice, setTabSwitchNotice] = useState<string | undefined>(undefined);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [focusComposerRequestKey, setFocusComposerRequestKey] = useState(0);
    const [executionStrategyDraftsByRootThreadId, setExecutionStrategyDraftsByRootThreadId] = useState<
        Record<string, OrchestratorExecutionStrategy>
    >({});
    const [requestedReasoningEffort, setRequestedReasoningEffort] =
        useState<RuntimeReasoningEffort>(DEFAULT_REASONING_EFFORT);
    const [mainViewDraftTarget, setMainViewDraftTarget] = useState<
        | {
              providerId?: RuntimeProviderId;
              modelId?: string;
          }
        | undefined
    >(undefined);
    const isPlanningComposerMode = modeKey === 'plan' && (topLevelTab === 'agent' || topLevelTab === 'orchestrator');
    const imageAttachmentsAllowed = topLevelTab !== 'orchestrator' && !isPlanningComposerMode;
    const uiState = useConversationUiState(profileId);
    const utils = trpc.useUtils();
    const queries = useConversationQueries({
        profileId,
        uiState,
        selectedSessionId: uiState.selectedSessionId,
        selectedRunId: uiState.selectedRunId,
        topLevelTab,
        modeKey,
    });
    const mutations = useConversationMutations();
    type PlanStartResult = Awaited<ReturnType<typeof mutations.planStartMutation.mutateAsync>>;
    type RunStartResult = Awaited<ReturnType<typeof mutations.startRunMutation.mutateAsync>>;
    type AcceptedRunStartResult = Extract<RunStartResult, { accepted: true }>;
    const setEditPreference = async (input: { profileId: string; value: 'truncate' | 'branch' }): Promise<void> => {
        await mutations.setEditPreferenceMutation.mutateAsync(input);
    };
    const streamState = useRuntimeEventStreamStore((state) => state.connectionState);
    const streamErrorMessage = useRuntimeEventStreamStore((state) => state.lastError);
    const requestedSessionId = uiState.selectedSessionId;
    const applySessionWorkspaceUpdate = useEffectEvent(
        (input: {
            session: SessionSummaryRecord;
            run?: RunRecord;
            thread?: ThreadListRecord;
            initialMessagesForRun?: AcceptedRunStartResult['initialMessages'];
        }) => {
            if (!isEntityId(input.session.id, 'sess')) {
                return;
            }

            applyConversationSessionCacheUpdate({
                utils,
                profileId,
                listThreadsInput: queries.listThreadsInput,
                session: input.session,
                ...(input.run ? { run: input.run } : {}),
                ...(input.thread ? { thread: input.thread } : {}),
                ...(input.run && input.initialMessagesForRun
                    ? {
                          initialMessagesForRun: {
                              runId: input.run.id,
                              messages: input.initialMessagesForRun.messages,
                              messageParts: input.initialMessagesForRun.messageParts,
                          },
                      }
                    : {}),
            });
        }
    );
    const applyPlanWorkspaceUpdate = useEffectEvent(
        (result: { found: false } | { found: true; plan: PlanRecordView }) => {
            if (!isEntityId(selectedSessionId, 'sess')) {
                return;
            }

            setActivePlanCache({
                utils,
                profileId,
                sessionId: selectedSessionId,
                topLevelTab,
                planResult: result,
            });
        }
    );

    const sessionActions = useConversationShellSessionActions({
        profileId,
        selectedThreadId: uiState.selectedThreadId,
        selectedSessionId: requestedSessionId,
        createSession: mutations.createSessionMutation.mutateAsync,
        onClearError: () => {
            composer.clearRunSubmitError();
        },
        onError: (message) => {
            composer.setRunSubmitError(message);
        },
        onSelectSessionId: uiState.setSelectedSessionId,
        onSelectRunId: uiState.setSelectedRunId,
        onSessionCreated: ({ sessionId, session, thread }) => {
            utils.session.listRuns.setData(
                {
                    profileId,
                    sessionId,
                },
                {
                    runs: [],
                }
            );
            applySessionWorkspaceUpdate({
                session,
                ...(thread ? { thread } : {}),
            });
        },
    });
    const sidebarState = useThreadSidebarState({
        threads: queries.listThreadsQuery.data?.threads ?? [],
        threadTags: queries.shellBootstrapQuery.data?.threadTags ?? [],
        selectedTagIds: uiState.selectedTagIds,
        selectedThreadId: uiState.selectedThreadId,
        onSelectedThreadInvalid: () => {
            uiState.setSelectedThreadId(undefined);
        },
        onSelectFallbackThread: (threadId) => {
            uiState.setSelectedThreadId(threadId);
        },
    });
    const preferredWorkspacePreference = (
        queries.shellBootstrapQuery.data?.workspacePreferences ?? []
    ).find((workspacePreference) => {
        return selectedWorkspaceFingerprint
            ? workspacePreference.workspaceFingerprint === selectedWorkspaceFingerprint
            : false;
    });
    const initialRunTargetState = useConversationRunTarget({
        providers: queries.shellBootstrapQuery.data?.providers ?? [],
        providerModels: queries.shellBootstrapQuery.data?.providerModels ?? [],
        defaults: queries.shellBootstrapQuery.data?.defaults,
        ...(queries.shellBootstrapQuery.data?.specialistDefaults
            ? { specialistDefaults: queries.shellBootstrapQuery.data.specialistDefaults }
            : {}),
        ...(preferredWorkspacePreference ? { workspacePreference: preferredWorkspacePreference } : {}),
        ...(mainViewDraftTarget ? { mainViewDraft: mainViewDraftTarget } : {}),
        runs: [],
        topLevelTab,
        requiresTools: activeModeRequiresNativeTools,
        modeKey,
        imageAttachmentsAllowed,
        ...(sessionActions.sessionOverride ? { sessionOverride: sessionActions.sessionOverride } : {}),
    });
    const shellViewModel = useConversationShellViewModel({
        profileId,
        topLevelTab,
        modeKey,
        queries,
        uiState,
        sidebarState,
        runTargetState: initialRunTargetState,
    });
    const orchestratorStrategyRootThreadId = resolveOrchestratorStrategyRootThreadId({
        topLevelTab,
        selectedThread: shellViewModel.selectedThread,
    });
    const executionStrategy = resolveOrchestratorExecutionStrategyDraft({
        topLevelTab,
        selectedThread: shellViewModel.selectedThread,
        draftsByRootThreadId: executionStrategyDraftsByRootThreadId,
    });
    const handleExecutionStrategyChange = (nextExecutionStrategy: OrchestratorExecutionStrategy): void => {
        setExecutionStrategyDraftsByRootThreadId((currentDrafts) =>
            updateOrchestratorExecutionStrategyDraft({
                draftsByRootThreadId: currentDrafts,
                rootThreadId: orchestratorStrategyRootThreadId,
                executionStrategy: nextExecutionStrategy,
            })
        );
    };
    const selectedWorkspacePreference = (
        queries.shellBootstrapQuery.data?.workspacePreferences ?? []
    ).find((workspacePreference) => {
        const preferredWorkspaceFingerprint =
            shellViewModel.selectedThread?.workspaceFingerprint ?? selectedWorkspaceFingerprint;
        return preferredWorkspaceFingerprint
            ? workspacePreference.workspaceFingerprint === preferredWorkspaceFingerprint
            : false;
    });
    const runTargetState = useConversationRunTarget({
        providers: queries.shellBootstrapQuery.data?.providers ?? [],
        providerModels: queries.shellBootstrapQuery.data?.providerModels ?? [],
        defaults: queries.shellBootstrapQuery.data?.defaults,
        ...(queries.shellBootstrapQuery.data?.specialistDefaults
            ? { specialistDefaults: queries.shellBootstrapQuery.data.specialistDefaults }
            : {}),
        ...(selectedWorkspacePreference ? { workspacePreference: selectedWorkspacePreference } : {}),
        ...(mainViewDraftTarget ? { mainViewDraft: mainViewDraftTarget } : {}),
        runs: shellViewModel.sessionRunSelection.runs,
        topLevelTab,
        requiresTools: activeModeRequiresNativeTools,
        modeKey,
        imageAttachmentsAllowed,
        ...(sessionActions.sessionOverride ? { sessionOverride: sessionActions.sessionOverride } : {}),
    });
    const selectedSessionId = shellViewModel.sessionRunSelection.selection.resolvedSessionId;
    const selectedRunId = shellViewModel.sessionRunSelection.selection.resolvedRunId;
    const composerTopLevelTab = topLevelTab;
    const composerActiveModeKey = modeKey;
    const composerSelectedProviderId = runTargetState.selectedProviderIdForComposer;
    const composerSelectedModelId = runTargetState.selectedModelIdForComposer;
    const selectedComposerModelRecord =
        composerSelectedProviderId && composerSelectedModelId
            ? (runTargetState.modelsByProvider.get(composerSelectedProviderId) ?? []).find(
                  (model) => model.id === composerSelectedModelId
              )
            : undefined;
    const selectedModelSupportsReasoning = Boolean(selectedComposerModelRecord?.supportsReasoning);
    const supportedReasoningEfforts =
        composerSelectedProviderId === 'kilo'
            ? selectedComposerModelRecord?.reasoningEfforts?.filter(
                  (effort): effort is Exclude<RuntimeReasoningEffort, 'none'> => effort !== 'none'
              )
            : undefined;
    const canAdjustReasoningEffort =
        selectedModelSupportsReasoning &&
        (composerSelectedProviderId === 'kilo'
            ? supportedReasoningEfforts !== undefined && supportedReasoningEfforts.length > 0
            : supportedReasoningEfforts === undefined || supportedReasoningEfforts.length > 0);
    const effectiveReasoningEffort =
        selectedModelSupportsReasoning &&
        canAdjustReasoningEffort &&
        (supportedReasoningEfforts === undefined ||
            requestedReasoningEffort === 'none' ||
            supportedReasoningEfforts.includes(requestedReasoningEffort))
            ? requestedReasoningEffort
            : 'none';
    const runtimeOptions = buildRuntimeRunOptions({
        supportsReasoning: selectedModelSupportsReasoning,
        reasoningEffort: effectiveReasoningEffort,
    });
    const fallbackContextSessionId = 'sess_missing';
    const hasSelectedSession = isEntityId(selectedSessionId, 'sess');
    const contextSessionId = hasSelectedSession ? selectedSessionId : fallbackContextSessionId;
    const contextProviderId = runTargetState.selectedProviderIdForComposer ?? 'openai';
    const contextModelId = runTargetState.selectedModelIdForComposer ?? 'openai/gpt-5';
    const contextStateQueryInput = {
        profileId,
        sessionId: contextSessionId,
        providerId: contextProviderId,
        modelId: contextModelId,
        topLevelTab,
        modeKey,
        ...(isEntityId(selectedRunId, 'run') ? { runId: selectedRunId } : {}),
        ...(shellViewModel.selectedThread?.workspaceFingerprint
            ? { workspaceFingerprint: shellViewModel.selectedThread.workspaceFingerprint }
            : {}),
    };
    const preComposerCanAttachImages =
        imageAttachmentsAllowed && Boolean(runTargetState.selectedModelOptionForComposer?.supportsVision);
    const preComposerImageAttachmentBlockedReason = !imageAttachmentsAllowed
        ? 'Image attachments are only available for executable runs.'
        : runTargetState.selectedModelOptionForComposer?.supportsVision
          ? undefined
          : 'Select a vision-capable model to attach images.';
    const preComposerSubmitBlockedReason =
        runTargetState.selectedModelOptionForComposer?.compatibilityState === 'incompatible'
            ? runTargetState.selectedModelOptionForComposer.compatibilityReason
            : undefined;
    const contextStateQueryEnabled =
        hasSelectedSession &&
        Boolean(runTargetState.selectedProviderIdForComposer) &&
        Boolean(runTargetState.selectedModelIdForComposer);
    const contextStateQuery = trpc.context.getResolvedState.useQuery(contextStateQueryInput, {
        enabled: contextStateQueryEnabled,
        ...PROGRESSIVE_QUERY_OPTIONS,
    });
    const composerMediaSettingsQuery = trpc.composer.getSettings.useQuery(undefined, PROGRESSIVE_QUERY_OPTIONS);
    const composerMediaSettings = composerMediaSettingsQuery.data?.settings;
    const composer = useConversationShellComposer({
        profileId,
        selectedSessionId,
        isPlanningMode: isPlanningComposerMode,
        topLevelTab,
        modeKey,
        workspaceFingerprint: shellViewModel.selectedThread?.workspaceFingerprint,
        ...(shellViewModel.effectiveSelectedSandboxId
            ? { sandboxId: shellViewModel.effectiveSelectedSandboxId }
            : {}),
        resolvedRunTarget: runTargetState.resolvedRunTarget,
        providerById: runTargetState.providerById,
        runtimeOptions,
        isStartingRun: mutations.startRunMutation.isPending,
        canAttachImages: preComposerCanAttachImages,
        maxImageAttachmentsPerMessage:
            composerMediaSettings?.maxImageAttachmentsPerMessage ?? DEFAULT_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
        imageCompressionConcurrency:
            composerMediaSettings?.imageCompressionConcurrency ?? DEFAULT_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY,
        ...(preComposerImageAttachmentBlockedReason
            ? { imageAttachmentBlockedReason: preComposerImageAttachmentBlockedReason }
            : {}),
        ...(preComposerSubmitBlockedReason ? { submitBlockedReason: preComposerSubmitBlockedReason } : {}),
        startPlan: mutations.planStartMutation.mutateAsync,
        startRun: mutations.startRunMutation.mutateAsync,
        onPlanStarted: (result: PlanStartResult) => {
            applyPlanWorkspaceUpdate({
                found: true,
                plan: result.plan,
            });
        },
        onRunStarted: (acceptedRun: AcceptedRunStartResult) => {
            uiState.setSelectedRunId(acceptedRun.run.id);
            applySessionWorkspaceUpdate({
                session: acceptedRun.session,
                run: acceptedRun.run,
                initialMessagesForRun: acceptedRun.initialMessages,
                ...(acceptedRun.thread ? { thread: acceptedRun.thread } : {}),
            });
            setResolvedContextStateCache({
                utils,
                queryInput: {
                    ...contextStateQueryInput,
                    runId: acceptedRun.run.id,
                },
                state: acceptedRun.resolvedContextState,
            });
        },
    });
    const composerModelOptions =
        queries.shellBootstrapQuery.data?.providers.flatMap((provider) =>
            (runTargetState.modelsByProvider.get(provider.id) ?? []).map((model) =>
                buildModelPickerOption({
                    model,
                    provider,
                    compatibilityContext: {
                        surface: 'conversation',
                        requiresTools: activeModeRequiresNativeTools,
                        modeKey,
                        hasPendingImageAttachments: composer.pendingImages.length > 0,
                        imageAttachmentsAllowed,
                    },
                })
            )
        ) ?? [];
    const selectedComposerModelOption =
        composerSelectedProviderId && composerSelectedModelId
            ? composerModelOptions.find(
                  (option) =>
                      option.providerId === composerSelectedProviderId && option.id === composerSelectedModelId
              )
            : undefined;
    const selectedModelCompatibilityReason =
        selectedComposerModelOption?.compatibilityReason ??
        runTargetState.selectedModelOptionForComposer?.compatibilityReason;
    const selectedModelCompatibilityState =
        selectedComposerModelOption?.compatibilityState ??
        runTargetState.selectedModelOptionForComposer?.compatibilityState;
    const canAttachImages = imageAttachmentsAllowed && Boolean(selectedComposerModelOption?.supportsVision);
    const imageAttachmentBlockedReason = !imageAttachmentsAllowed
        ? 'Image attachments are only available for executable runs.'
        : selectedComposerModelOption?.supportsVision
          ? undefined
          : composer.pendingImages.length > 0
            ? 'This model cannot accept image attachments.'
            : 'Select a vision-capable model to attach images.';
    const editFlow = useConversationShellEditFlow({
        profileId,
        topLevelTab,
        modeKey,
        selectedSessionId,
        selectedThread: shellViewModel.selectedThread,
        resolvedRunTarget: runTargetState.resolvedRunTarget,
        runtimeOptions,
        editSession: mutations.editSessionMutation.mutateAsync,
        setEditPreference,
        uiState,
        onTopLevelTabChange,
        onClearError: composer.clearRunSubmitError,
        onError: composer.setRunSubmitError,
        onPromptReset: () => {
            composer.resetComposer();
        },
        onComposerFocusRequest: () => {
            setFocusComposerRequestKey((current) => current + 1);
        },
        onSessionEdited: ({ session, run, thread }) => {
            applySessionWorkspaceUpdate({
                session,
                ...(run ? { run } : {}),
                ...(thread ? { thread } : {}),
            });
        },
    });
    const branchWorkflowFlow = useConversationShellBranchWorkflowFlow({
        profileId,
        topLevelTab,
        modeKey,
        selectedSessionId,
        selectedThread: shellViewModel.selectedThread,
        uiState,
        branchFromMessage: mutations.branchFromMessageMutation.mutateAsync,
        branchFromMessageWithWorkflow: mutations.branchFromMessageWithWorkflowMutation.mutateAsync,
        onTopLevelTabChange,
        onClearError: composer.clearRunSubmitError,
        onError: composer.setRunSubmitError,
        onPromptReset: () => {
            composer.resetComposer();
        },
        onComposerFocusRequest: () => {
            setFocusComposerRequestKey((current) => current + 1);
        },
        onSessionEdited: ({ session, thread }) => {
            applySessionWorkspaceUpdate({
                session,
                ...(thread ? { thread } : {}),
            });
        },
    });
    useConversationShellSync({
        profileId,
        modeKey,
        topLevelTab,
        selectedSessionId,
        selectedRunId,
        hasSelectedSession,
        streamState,
        contextStateQueryEnabled,
        contextStateQueryInput,
        uiState,
        queries,
        shellViewModel,
        runTargetState,
        utils,
        onSelectedWorkspaceFingerprintChange,
        onBootChromeReadyChange,
    });

    const sidebarStatusMessage = queries.listBucketsQuery.isPending
        ? 'Loading conversation groups...'
        : queries.listTagsQuery.isPending
          ? 'Loading tags...'
          : queries.listThreadsQuery.isPending
            ? 'Loading threads...'
            : queries.sessionsQuery.isPending
              ? 'Loading sessions...'
              : (queries.listBucketsQuery.error?.message ??
                queries.listTagsQuery.error?.message ??
                queries.listThreadsQuery.error?.message ??
                queries.sessionsQuery.error?.message);
    const sidebarStatusTone =
        (queries.listBucketsQuery.error ??
        queries.listTagsQuery.error ??
        queries.listThreadsQuery.error ??
        queries.sessionsQuery.error)
            ? 'error'
            : sidebarStatusMessage
              ? 'info'
              : undefined;

    const routingBadge = useConversationShellRoutingBadge({
        profileId,
        providerId: runTargetState.selectedProviderIdForComposer,
        modelId: runTargetState.selectedModelIdForComposer,
    });
    const planOrchestrator = buildConversationPlanOrchestrator({
        profileId,
        applyPlanWorkspaceUpdate,
        applyOrchestratorWorkspaceUpdate: (latest) => {
            if (!isEntityId(selectedSessionId, 'sess')) {
                return;
            }
            setOrchestratorLatestCache({
                utils,
                profileId,
                sessionId: selectedSessionId,
                latest,
            });
        },
        onError: composer.setRunSubmitError,
        resolvedRunTarget: runTargetState.resolvedRunTarget,
        runtimeOptions,
        workspaceFingerprint: shellViewModel.selectedThread?.workspaceFingerprint,
        activePlan: queries.activePlanQuery.data?.found ? queries.activePlanQuery.data.plan : undefined,
        orchestratorView: queries.orchestratorLatestQuery.data?.found
            ? queries.orchestratorLatestQuery.data
            : undefined,
        selectedExecutionStrategy: executionStrategy,
        planStartMutation: mutations.planStartMutation,
        planAnswerMutation: mutations.planAnswerMutation,
        planReviseMutation: mutations.planReviseMutation,
        planApproveMutation: mutations.planApproveMutation,
        planImplementMutation: mutations.planImplementMutation,
        orchestratorAbortMutation: mutations.orchestratorAbortMutation,
    });
    const workspaceActions = useConversationWorkspaceActions({
        profileId,
        listThreadsInput: queries.listThreadsInput,
        mutations,
        onResolvePermission: composer.clearRunSubmitError,
    });
    const handleCreateThread = useEffectEvent(async (input: {
        workspaceFingerprint: string;
        workspaceAbsolutePath: string;
        title: string;
        topLevelTab: TopLevelTab;
        providerId?: RuntimeProviderId;
        modelId?: string;
    }): Promise<void> => {
        await createConversationThread(
            {
                profileId,
                topLevelTab,
                utils,
                listThreadsInput: queries.listThreadsInput,
                uiState,
                composer,
                mutations,
                sessionActions,
                onTopLevelTabChange,
                onSelectedWorkspaceFingerprintChange,
                onApplySessionWorkspaceUpdate: ({ session, thread }) => {
                    applySessionWorkspaceUpdate({
                        session,
                        ...(thread ? { thread } : {}),
                    });
                },
                onSetTabSwitchNotice: setTabSwitchNotice,
                onFocusComposerRequest: () => {
                    setFocusComposerRequestKey((current) => current + 1);
                },
            },
            input
        );
    });
    const workspaceSectionState = buildConversationWorkspaceSectionState({
        topLevelTab,
        modeKey,
        shellViewModel,
        queries,
        runTargetState,
    });
    const workspacePanels = buildConversationWorkspacePanels({
        profileId,
        topLevelTab,
        selectedSessionId,
        selectedRunId,
        modeKey,
        shellViewModel,
        queries,
        mutations,
        planOrchestrator,
        workspaceActions,
        onSelectThreadId: uiState.setSelectedThreadId,
        onSelectSessionId: uiState.setSelectedSessionId,
        onSelectRunId: uiState.setSelectedRunId,
        onTopLevelTabChange,
        executionStrategy,
        onExecutionStrategyChange: handleExecutionStrategyChange,
        ...(contextStateQuery.data ? { contextState: contextStateQuery.data } : {}),
    });
    const workspaceSectionProps = {
        header: {
            selectedThread: shellViewModel.selectedThread,
            streamState,
            ...(streamErrorMessage !== undefined ? { streamErrorMessage } : {}),
            lastSequence: queries.shellBootstrapQuery.data?.lastSequence ?? 0,
            tabSwitchNotice,
            topLevelTab,
            isSidebarCollapsed,
        },
        panel: buildConversationWorkspacePanelProps({
            profileId,
            profiles,
            selectedProfileId,
            selectedSessionId,
            selectedRunId,
            topLevelTab: composerTopLevelTab,
            modeKey: composerActiveModeKey,
            modes,
            reasoningEffort: effectiveReasoningEffort,
            selectedModelSupportsReasoning,
            ...(supportedReasoningEfforts !== undefined ? { supportedReasoningEfforts } : {}),
            composerModelOptions,
            shellViewModel,
            queries,
            mutations,
            composer,
            sessionActions,
            editFlow,
            branchFromMessage: branchWorkflowFlow.onBranchFromMessage,
            workspaceActions,
            workspaceSectionState,
            workspacePanels,
            selectedProviderId: composerSelectedProviderId,
            selectedModelId: composerSelectedModelId,
            canAttachImages,
            ...(imageAttachmentBlockedReason ? { imageAttachmentBlockedReason } : {}),
            ...(routingBadge !== undefined ? { routingBadge } : {}),
            ...(selectedModelCompatibilityState ? { selectedModelCompatibilityState } : {}),
            ...(selectedModelCompatibilityReason ? { selectedModelCompatibilityReason } : {}),
            ...(contextStateQuery.data ? { contextState: contextStateQuery.data } : {}),
            hasSelectedSession,
            maxImageAttachmentsPerMessage:
                composerMediaSettings?.maxImageAttachmentsPerMessage ??
                DEFAULT_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
            onProfileChange,
            onModeChange,
            onReasoningEffortChange: setRequestedReasoningEffort,
            onSelectRun: uiState.setSelectedRunId,
            onProviderChange: (providerId: string) => {
                if (!isProviderId(providerId)) {
                    return;
                }
                const nextModelId =
                    composerModelOptions.find(
                        (option) => option.providerId === providerId && option.compatibilityState === 'compatible'
                    )?.id ?? composerModelOptions.find((option) => option.providerId === providerId)?.id;
                if (!selectedSessionId) {
                    setMainViewDraftTarget({
                        providerId,
                        ...(nextModelId ? { modelId: nextModelId } : {}),
                    });
                    return;
                }
                sessionActions.onProviderChange(providerId, nextModelId);
            },
            onModelChange: (modelId: string) => {
                if (!selectedSessionId) {
                    const nextProviderId = runTargetState.selectedProviderIdForComposer;
                    setMainViewDraftTarget({
                        ...(nextProviderId ? { providerId: nextProviderId } : {}),
                        modelId,
                    });
                    return;
                }
                sessionActions.onModelChange(runTargetState.selectedProviderIdForComposer, modelId);
            },
            onCompactContext: () => {
                if (!hasSelectedSession) {
                    return Promise.resolve({
                        tone: 'error' as const,
                        message: 'Context compaction is unavailable because no session is selected.',
                    });
                }

                return mutations.compactSessionMutation
                    .mutateAsync({
                        profileId,
                        sessionId: contextSessionId,
                        providerId: contextProviderId,
                        modelId: contextModelId,
                        topLevelTab,
                        modeKey,
                        ...(shellViewModel.selectedThread?.workspaceFingerprint
                            ? { workspaceFingerprint: shellViewModel.selectedThread.workspaceFingerprint }
                            : {}),
                    })
                    .then((result) => {
                        setResolvedContextStateCache({
                            utils,
                            queryInput: contextStateQueryInput,
                            state: result.resolvedState,
                        });
                        return {
                            tone: 'success' as const,
                            message: 'Context compacted for the current session.',
                        };
                    })
                    .catch((error: unknown) => ({
                        tone: 'error' as const,
                        message: error instanceof Error ? error.message : 'Context compaction failed.',
                    }));
            },
            focusComposerRequestKey,
        }),
    } as const;

    return (
        <main className='bg-background flex h-full min-h-0 min-w-0 flex-1 overflow-hidden'>
            <ConversationSidebarPane
                profileId={profileId}
                topLevelTab={topLevelTab}
                isCollapsed={isSidebarCollapsed}
                onToggleCollapsed={() => {
                    setIsSidebarCollapsed((current) => !current);
                }}
                workspaceRoots={queries.shellBootstrapQuery.data?.workspaceRoots ?? []}
                {...(selectedWorkspaceFingerprint ? { preferredWorkspaceFingerprint: selectedWorkspaceFingerprint } : {})}
                buckets={queries.listBucketsQuery.data?.buckets ?? []}
                threads={sidebarState.visibleThreads}
                sessions={queries.sessionsQuery.data?.sessions ?? []}
                tags={queries.listTagsQuery.data?.tags ?? []}
                threadTagIdsByThread={sidebarState.threadTagIdsByThread}
                selectedThreadId={uiState.selectedThreadId}
                selectedSessionId={selectedSessionId}
                selectedTagIds={uiState.selectedTagIds}
                scopeFilter={uiState.scopeFilter}
                workspaceFilter={uiState.workspaceFilter}
                sort={uiState.sort ?? 'latest'}
                showAllModes={uiState.showAllModes}
                groupView={uiState.groupView}
                isAddingTag={mutations.upsertTagMutation.isPending || mutations.setThreadTagsMutation.isPending}
                isDeletingWorkspaceThreads={mutations.deleteWorkspaceThreadsMutation.isPending}
                isCreatingThread={mutations.createThreadMutation.isPending || mutations.createSessionMutation.isPending}
                {...(sidebarStatusMessage
                    ? {
                          statusMessage: sidebarStatusMessage,
                          ...(sidebarStatusTone ? { statusTone: sidebarStatusTone } : {}),
                      }
                    : {})}
                onTopLevelTabChange={onTopLevelTabChange}
                onSetTabSwitchNotice={setTabSwitchNotice}
                onSelectThreadId={uiState.setSelectedThreadId}
                onSelectSessionId={uiState.setSelectedSessionId}
                onSelectRunId={uiState.setSelectedRunId}
                onSelectTagIds={uiState.setSelectedTagIds}
                onScopeFilterChange={uiState.setScopeFilter}
                onWorkspaceFilterChange={uiState.setWorkspaceFilter}
                onSortChange={uiState.setSort}
                onShowAllModesChange={uiState.setShowAllModes}
                onGroupViewChange={uiState.setGroupView}
                onCreateThread={handleCreateThread}
                onSelectWorkspaceFingerprint={(workspaceFingerprint) => {
                    onSelectedWorkspaceFingerprintChange?.(workspaceFingerprint);
                    uiState.setSelectedThreadId(undefined);
                    uiState.setSelectedSessionId(undefined);
                    uiState.setSelectedRunId(undefined);
                }}
                upsertTag={mutations.upsertTagMutation.mutateAsync}
                setThreadTags={mutations.setThreadTagsMutation.mutateAsync}
                setThreadFavorite={mutations.setThreadFavoriteMutation.mutateAsync}
                deleteWorkspaceThreads={mutations.deleteWorkspaceThreadsMutation.mutateAsync}
            />

            <ConversationWorkspaceSection
                {...workspaceSectionProps}
                onToggleSidebar={() => {
                    setIsSidebarCollapsed((current) => !current);
                }}
                onTopLevelTabChange={onTopLevelTabChange}
            />

            <MessageEditDialog
                {...editFlow.dialogProps}
                busy={mutations.editSessionMutation.isPending || mutations.setEditPreferenceMutation.isPending}
            />
            <BranchWorkflowDialog
                {...branchWorkflowFlow.dialogProps}
                busy={mutations.branchFromMessageWithWorkflowMutation.isPending}
            />
        </main>
    );
}
