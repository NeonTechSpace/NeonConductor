import { skipToken } from '@tanstack/react-query';
import type React from 'react';

import { useConversationShellComposer } from '@/web/components/conversation/hooks/useConversationShellComposer';
import { useConversationShellSessionActions } from '@/web/components/conversation/hooks/useConversationShellSessionActions';
import { useConversationShellViewModel } from '@/web/components/conversation/hooks/useConversationShellViewModel';
import { useConversationUiState } from '@/web/components/conversation/hooks/useConversationUiState';
import { useConversationMutations } from '@/web/components/conversation/shell/actions/useConversationMutations';
import { useConversationQueries } from '@/web/components/conversation/shell/queries/useConversationQueries';
import type { useConversationShellSelectionState } from '@/web/components/conversation/shell/useConversationShellSelectionState';
import type { useConversationRunTarget } from '@/web/components/conversation/shell/workspace/useConversationRunTarget';
import type { ConversationModeOption } from '@/web/components/conversation/shell/workspace/helpers';
import type { ConversationShellBootChromeReadiness } from '@/web/components/runtime/bootReadiness';
import type { RuntimeStreamConnectionState } from '@/web/lib/runtime/eventStream';
import { trpc } from '@/web/trpc/client';

import type { ResolvedContextState, ResolvedContextStateInput } from '@/app/backend/runtime/contracts/types/context';
import type { RunRecord, SessionSummaryRecord, ThreadListRecord } from '@/app/backend/persistence/types';

import type {
    OrchestratorExecutionStrategy,
    PlanRecordView,
    RuntimeProviderId,
    RuntimeReasoningEffort,
    TopLevelTab,
} from '@/shared/contracts';

export type ConversationQueries = ReturnType<typeof useConversationQueries>;
export type ConversationMutations = ReturnType<typeof useConversationMutations>;
export type ConversationUiState = ReturnType<typeof useConversationUiState>;
export type ConversationViewModel = ReturnType<typeof useConversationShellViewModel>;
export type ConversationSelectionState = ReturnType<typeof useConversationShellSelectionState>;
export type ConversationRunTargetState = ReturnType<typeof useConversationRunTarget>;
export type ConversationSessionActions = ReturnType<typeof useConversationShellSessionActions>;
export type ConversationComposer = ReturnType<typeof useConversationShellComposer>;
export type TrpcUtils = ReturnType<typeof trpc.useUtils>;
export type AcceptedRunStartResult = Extract<
    Awaited<ReturnType<ConversationMutations['startRunMutation']['mutateAsync']>>,
    { accepted: true }
>;
export type ConversationPlanWorkspaceUpdateResult = { found: false } | { found: true; plan: PlanRecordView };
export interface ConversationSessionWorkspaceUpdate {
    session: SessionSummaryRecord;
    run?: RunRecord | undefined;
    thread?: ThreadListRecord | undefined;
    initialMessagesForRun?: AcceptedRunStartResult['initialMessages'] | undefined;
}
export type ConversationShellMainViewDraftTarget =
    | {
          providerId?: RuntimeProviderId;
          modelId?: string;
      }
    | undefined;

export interface UseConversationShellViewControllersInput {
    profileId: string;
    profiles: Array<{ id: string; name: string }>;
    selectedProfileId: string | undefined;
    topLevelTab: TopLevelTab;
    modeKey: string;
    modes: ConversationModeOption[];
    selectedWorkspaceFingerprint: string | undefined;
    onModeChange: (modeKey: string) => void;
    onTopLevelTabChange: (nextTab: TopLevelTab) => void;
    onSelectedWorkspaceFingerprintChange: ((workspaceFingerprint: string | undefined) => void) | undefined;
    onProfileChange: (profileId: string) => void;
    onBootChromeReadyChange: ((readiness: ConversationShellBootChromeReadiness) => void) | undefined;
    isSidebarCollapsed: boolean;
    onToggleSidebarCollapsed: () => void;
    tabSwitchNotice: string | undefined;
    setTabSwitchNotice: (message: string | undefined) => void;
    focusComposerRequestKey: number;
    setFocusComposerRequestKey: React.Dispatch<React.SetStateAction<number>>;
    setRequestedReasoningEffort: React.Dispatch<React.SetStateAction<RuntimeReasoningEffort>>;
    setMainViewDraftTarget: React.Dispatch<React.SetStateAction<ConversationShellMainViewDraftTarget>>;
    queries: ConversationQueries;
    mutations: ConversationMutations;
    uiState: ConversationUiState;
    utils: TrpcUtils;
    streamState: RuntimeStreamConnectionState;
    streamErrorMessage: string | undefined;
    shellViewModel: ConversationViewModel;
    selectionState: ConversationSelectionState;
    runTargetState: ConversationRunTargetState;
    selectedSessionId: SessionSummaryRecord['id'] | undefined;
    selectedRunId: RunRecord['id'] | undefined;
    hasSelectedSession: boolean;
    runtimeOptions: ReturnType<typeof import('@/web/components/conversation/shell/workspace/helpers').buildRuntimeRunOptions>;
    contextStateQueryInput: ResolvedContextStateInput | typeof skipToken;
    contextStateQuery: ReturnType<typeof trpc.context.getResolvedState.useQuery> & {
        data: ResolvedContextState | undefined;
    };
    contextStateQueryEnabled: boolean;
    composerMediaSettings:
        | {
        maxImageAttachmentsPerMessage?: number;
          }
        | undefined;
    composer: ConversationComposer;
    sessionActions: ConversationSessionActions;
    setEditPreference: (editPreferenceInput: {
        profileId: string;
        value: 'truncate' | 'branch';
    }) => Promise<void>;
    executionStrategy: OrchestratorExecutionStrategy;
    handleExecutionStrategyChange: (nextExecutionStrategy: OrchestratorExecutionStrategy) => void;
    selectedComposerProviderId: RuntimeProviderId | undefined;
    selectedComposerModelId: string | undefined;
    selectedModelSupportsReasoning: boolean;
    supportedReasoningEfforts: Array<Exclude<RuntimeReasoningEffort, 'none'>> | undefined;
    effectiveReasoningEffort: RuntimeReasoningEffort;
    composerModelOptions: ConversationRunTargetState['modelOptions'];
    canAttachImages: boolean;
    imageAttachmentBlockedReason: string | undefined;
    selectedModelCompatibilityState: 'compatible' | 'warning' | 'incompatible' | undefined;
    selectedModelCompatibilityReason: string | undefined;
    applySessionWorkspaceUpdate: (sessionUpdate: ConversationSessionWorkspaceUpdate) => void;
    applyPlanWorkspaceUpdate: (planResult: ConversationPlanWorkspaceUpdateResult) => void;
}
