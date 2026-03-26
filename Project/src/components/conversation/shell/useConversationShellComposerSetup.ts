import { skipToken } from '@tanstack/react-query';

import { useConversationShellComposer } from '@/web/components/conversation/hooks/useConversationShellComposer';
import { buildResolvedContextStateQueryInput } from '@/web/components/conversation/shell/conversationShellRuntimeState';
import type { ConversationReasoningState } from '@/web/components/conversation/shell/conversationShellRuntimeState';
import type {
    AcceptedRunStartResult,
    ConversationMutations,
    ConversationPlanWorkspaceUpdateResult,
    ConversationQueries,
    ConversationRunTargetState,
    ConversationSessionWorkspaceUpdate,
    ConversationUiState,
} from '@/web/components/conversation/shell/useConversationShellViewControllers.types';
import { buildModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import { listProviderControlProviders } from '@/web/lib/providerControl/selectors';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';


import {
    DEFAULT_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY,
    DEFAULT_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
} from '@/shared/contracts';
import type { EntityId } from '@/shared/contracts';
import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';
import type { ResolvedContextState, ResolvedContextStateInput } from '@/shared/contracts/types/context';



interface UseConversationShellComposerSetupInput {
    profileId: string;
    selectedSessionId: string | undefined;
    topLevelTab: TopLevelTab;
    modeKey: string;
    workspaceFingerprint: string | undefined;
    sandboxId: EntityId<'sb'> | undefined;
    isPlanningComposerMode: boolean;
    imageAttachmentsAllowed: boolean;
    activeModeRequiresNativeTools: boolean;
    queries: ConversationQueries;
    mutations: ConversationMutations;
    uiState: ConversationUiState;
    runTargetState: ConversationRunTargetState;
    reasoningState: ConversationReasoningState;
    applyPlanWorkspaceUpdate: (planResult: ConversationPlanWorkspaceUpdateResult) => void;
    applySessionWorkspaceUpdate: (sessionUpdate: ConversationSessionWorkspaceUpdate) => void;
    cacheResolvedContextState: (queryInput: ResolvedContextStateInput, state: ResolvedContextState) => void;
}

export function buildConversationComposerModelOptions(input: {
    providers:
        | NonNullable<
              ConversationQueries['shellBootstrapQuery']['data']
          >['providerControl']['entries'][number]['provider'][]
        | undefined;
    modelsByProvider: ConversationRunTargetState['modelsByProvider'];
    activeModeRequiresNativeTools: boolean;
    modeKey: string;
    imageAttachmentsAllowed: boolean;
    hasPendingImageAttachments: boolean;
}) {
    return (
        input.providers?.flatMap((provider) =>
            (input.modelsByProvider.get(provider.id) ?? []).map((model) =>
                buildModelPickerOption({
                    model,
                    provider,
                    compatibilityContext: {
                        surface: 'conversation',
                        requiresTools: input.activeModeRequiresNativeTools,
                        modeKey: input.modeKey,
                        hasPendingImageAttachments: input.hasPendingImageAttachments,
                        imageAttachmentsAllowed: input.imageAttachmentsAllowed,
                    },
                })
            )
        ) ?? []
    );
}

export function buildConversationComposerPresentationState(input: {
    imageAttachmentsAllowed: boolean;
    pendingImageCount: number;
    composerModelOptions: Array<{
        providerId?: string;
        id: string;
        supportsVision?: boolean;
        compatibilityReason?: string;
        compatibilityState?: 'compatible' | 'warning' | 'incompatible';
    }>;
    selectedComposerProviderId: RuntimeProviderId | undefined;
    selectedComposerModelId: string | undefined;
    selectedModelOptionForComposer:
        | {
              compatibilityReason?: string;
              compatibilityState?: 'compatible' | 'warning' | 'incompatible';
          }
        | undefined;
}) {
    const selectedComposerModelOption =
        input.selectedComposerProviderId && input.selectedComposerModelId
            ? input.composerModelOptions.find(
                  (option) =>
                      option.providerId === input.selectedComposerProviderId &&
                      option.id === input.selectedComposerModelId
              )
            : undefined;
    const selectedModelCompatibilityReason =
        selectedComposerModelOption?.compatibilityReason ?? input.selectedModelOptionForComposer?.compatibilityReason;
    const selectedModelCompatibilityState =
        selectedComposerModelOption?.compatibilityState ?? input.selectedModelOptionForComposer?.compatibilityState;
    const canAttachImages = input.imageAttachmentsAllowed && Boolean(selectedComposerModelOption?.supportsVision);
    const imageAttachmentBlockedReason = !input.imageAttachmentsAllowed
        ? 'Image attachments are only available for executable runs.'
        : selectedComposerModelOption?.supportsVision
          ? undefined
          : input.pendingImageCount > 0
            ? 'This model cannot accept image attachments.'
            : 'Select a vision-capable model to attach images.';

    return {
        selectedComposerModelOption,
        selectedModelCompatibilityState,
        selectedModelCompatibilityReason,
        canAttachImages,
        imageAttachmentBlockedReason,
    };
}

export function useConversationShellComposerSetup(input: UseConversationShellComposerSetupInput) {
    type PlanStartResult = Awaited<ReturnType<ConversationMutations['planStartMutation']['mutateAsync']>>;
    type RejectedRunStartResult = Extract<
        Awaited<ReturnType<ConversationMutations['startRunMutation']['mutateAsync']>>,
        { accepted: false }
    >;

    const composerMediaSettingsQuery = trpc.composer.getSettings.useQuery(undefined, PROGRESSIVE_QUERY_OPTIONS);
    const composerMediaSettings = composerMediaSettingsQuery.data?.settings;
    const preComposerCanAttachImages =
        input.imageAttachmentsAllowed && Boolean(input.runTargetState.selectedModelOptionForComposer?.supportsVision);
    const preComposerImageAttachmentBlockedReason = !input.imageAttachmentsAllowed
        ? 'Image attachments are only available for executable runs.'
        : input.runTargetState.selectedModelOptionForComposer?.supportsVision
          ? undefined
          : 'Select a vision-capable model to attach images.';
    const preComposerSubmitBlockedReason =
        input.runTargetState.selectedModelOptionForComposer?.compatibilityState === 'incompatible'
            ? input.runTargetState.selectedModelOptionForComposer.compatibilityReason
            : undefined;

    const composer = useConversationShellComposer<PlanStartResult, AcceptedRunStartResult, RejectedRunStartResult>({
        profileId: input.profileId,
        selectedSessionId: input.selectedSessionId,
        isPlanningMode: input.isPlanningComposerMode,
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
        workspaceFingerprint: input.workspaceFingerprint,
        ...(input.sandboxId ? { sandboxId: input.sandboxId } : {}),
        resolvedRunTarget: input.runTargetState.resolvedRunTarget,
        providerById: input.runTargetState.providerById,
        runtimeOptions: input.reasoningState.runtimeOptions,
        isStartingRun: input.mutations.startRunMutation.isPending,
        canAttachImages: preComposerCanAttachImages,
        maxImageAttachmentsPerMessage:
            composerMediaSettings?.maxImageAttachmentsPerMessage ?? DEFAULT_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
        imageCompressionConcurrency:
            composerMediaSettings?.imageCompressionConcurrency ?? DEFAULT_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY,
        ...(preComposerImageAttachmentBlockedReason
            ? { imageAttachmentBlockedReason: preComposerImageAttachmentBlockedReason }
            : {}),
        ...(preComposerSubmitBlockedReason ? { submitBlockedReason: preComposerSubmitBlockedReason } : {}),
        startPlan: input.mutations.planStartMutation.mutateAsync,
        startRun: input.mutations.startRunMutation.mutateAsync,
        onPlanStarted: (result) => {
            input.applyPlanWorkspaceUpdate({
                found: true,
                plan: result.plan,
            });
        },
        onRunStarted: (acceptedRun) => {
            input.uiState.setSelectedRunId(acceptedRun.run.id);
            input.applySessionWorkspaceUpdate({
                session: acceptedRun.session,
                run: acceptedRun.run,
                initialMessagesForRun: acceptedRun.initialMessages,
                ...(acceptedRun.thread ? { thread: acceptedRun.thread } : {}),
            });
            const acceptedRunContextStateQueryInput = buildResolvedContextStateQueryInput({
                profileId: input.profileId,
                selectedSessionId: acceptedRun.session.id,
                providerId: input.runTargetState.selectedProviderIdForComposer,
                modelId: input.runTargetState.selectedModelIdForComposer,
                topLevelTab: input.topLevelTab,
                modeKey: input.modeKey,
                workspaceFingerprint: input.workspaceFingerprint,
                selectedRunId: acceptedRun.run.id,
            });
            if (acceptedRunContextStateQueryInput !== skipToken) {
                input.cacheResolvedContextState(acceptedRunContextStateQueryInput, acceptedRun.resolvedContextState);
            }
        },
    });

    const composerModelOptions = buildConversationComposerModelOptions({
        providers: listProviderControlProviders(input.queries.shellBootstrapQuery.data?.providerControl),
        modelsByProvider: input.runTargetState.modelsByProvider,
        activeModeRequiresNativeTools: input.activeModeRequiresNativeTools,
        modeKey: input.modeKey,
        imageAttachmentsAllowed: input.imageAttachmentsAllowed,
        hasPendingImageAttachments: composer.pendingImages.length > 0,
    });
    const composerPresentationState = buildConversationComposerPresentationState({
        imageAttachmentsAllowed: input.imageAttachmentsAllowed,
        pendingImageCount: composer.pendingImages.length,
        composerModelOptions,
        selectedComposerProviderId: input.runTargetState.selectedProviderIdForComposer,
        selectedComposerModelId: input.runTargetState.selectedModelIdForComposer,
        selectedModelOptionForComposer: input.runTargetState.selectedModelOptionForComposer,
    });

    return {
        composerMediaSettings,
        composer,
        composerModelOptions,
        ...composerPresentationState,
    };
}

