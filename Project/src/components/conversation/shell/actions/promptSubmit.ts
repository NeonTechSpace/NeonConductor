import type { OptimisticConversationUserMessage } from '@/web/components/conversation/messages/optimisticUserMessage';
import type { PlanningDepth } from '@/web/components/conversation/shell/planningDepth';
import {
    formatRunStartRejection,
    isEntityId,
    type RunTargetSelection,
} from '@/web/components/conversation/shell/workspace/helpers';
import { isProviderRunnable, type RunStartRejectedResultLike } from '@/web/lib/runtimeCapabilityIssue';

import type {
    BrowserCommentPacket,
    ComposerAttachmentInput,
    EntityId,
    PlanStartInput,
    PlanRecordView,
    RuntimeProviderId,
    RuntimeRunOptions,
    SessionStartRunInput,
    TopLevelTab,
} from '@/shared/contracts';

type ComposerPlanStartInput = PlanStartInput & {
    planningDepth?: PlanningDepth;
};

interface ProviderAuthView {
    label: string;
    authState: string;
    authMethod: string;
}

type PlanStartSuccessResult = { plan: PlanRecordView };
type RunStartAcceptedResult = { accepted: true };
type RunStartRejectedResult = RunStartRejectedResultLike;

function isAcceptedRunResult<TRunStartAcceptedResult extends RunStartAcceptedResult>(
    result: TRunStartAcceptedResult | RunStartRejectedResult
): result is TRunStartAcceptedResult {
    return result.accepted;
}

interface SubmitPromptInput<
    TPlanStartResult extends PlanStartSuccessResult,
    TRunStartAcceptedResult extends RunStartAcceptedResult,
> {
    prompt: string;
    attachments?: ComposerAttachmentInput[];
    browserContext?: BrowserCommentPacket;
    isStartingRun: boolean;
    selectedSessionId: string | undefined;
    isPlanningMode: boolean;
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    planningDepthSelection: PlanningDepth;
    workspaceFingerprint: string | undefined;
    sandboxId?: EntityId<'sb'>;
    resolvedRunTarget: RunTargetSelection | undefined;
    runtimeOptions: RuntimeRunOptions;
    providerById: Map<RuntimeProviderId, ProviderAuthView>;
    startPlan: (input: ComposerPlanStartInput) => Promise<TPlanStartResult>;
    startRun: (input: SessionStartRunInput) => Promise<TRunStartAcceptedResult | RunStartRejectedResult>;
    onPromptCleared: () => void;
    onPlanStarted: (result: TPlanStartResult) => void;
    onRunStarted: (result: TRunStartAcceptedResult) => void;
    onRunStartRequested?: (input: Pick<OptimisticConversationUserMessage, 'sessionId' | 'prompt'>) => void;
    onRunStartFinished?: () => void;
    onError: (message: string) => void;
}

export async function submitPrompt<
    TPlanStartResult extends PlanStartSuccessResult,
    TRunStartAcceptedResult extends RunStartAcceptedResult,
>(input: SubmitPromptInput<TPlanStartResult, TRunStartAcceptedResult>): Promise<void> {
    const trimmedPrompt = input.prompt.trim();
    const attachments = input.attachments ?? [];
    if ((trimmedPrompt.length === 0 && attachments.length === 0 && !input.browserContext) || input.isStartingRun) {
        return;
    }

    if (!isEntityId(input.selectedSessionId, 'sess')) {
        return;
    }

    if (input.isPlanningMode) {
        if (trimmedPrompt.length === 0) {
            input.onError('Planning runs require a text prompt.');
            return;
        }

        try {
            const result = await input.startPlan({
                profileId: input.profileId,
                sessionId: input.selectedSessionId,
                topLevelTab: input.topLevelTab,
                modeKey: input.modeKey,
                planningDepth: input.planningDepthSelection,
                prompt: trimmedPrompt,
                ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            });
            input.onPromptCleared();
            input.onPlanStarted(result);
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            input.onError(`Plan start failed: ${message}`);
        }
        return;
    }

    if (!input.resolvedRunTarget) {
        input.onError('No runnable provider/model found. Open Settings > Providers to configure one.');
        return;
    }

    const selectedProvider = input.providerById.get(input.resolvedRunTarget.providerId);
    if (selectedProvider && !isProviderRunnable(selectedProvider.authState, selectedProvider.authMethod)) {
        input.onError(
            formatRunStartRejection({
                rejection: {
                    accepted: false,
                    message: `Provider "${input.resolvedRunTarget.providerId}" is not authenticated/configured.`,
                    action: {
                        code: 'provider_not_runnable',
                        providerId: input.resolvedRunTarget.providerId,
                    },
                },
                providerById: input.providerById,
            })
        );
        return;
    }

    try {
        input.onRunStartRequested?.({
            sessionId: input.selectedSessionId,
            prompt: trimmedPrompt,
        });
        const result = await input.startRun({
            profileId: input.profileId,
            sessionId: input.selectedSessionId,
            prompt: trimmedPrompt,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            providerId: input.resolvedRunTarget.providerId,
            modelId: input.resolvedRunTarget.modelId,
            ...(attachments.length > 0 ? { attachments } : {}),
            ...(input.browserContext ? { browserContext: input.browserContext } : {}),
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            ...(input.sandboxId ? { sandboxId: input.sandboxId } : {}),
            runtimeOptions: input.runtimeOptions,
        });
        if (!isAcceptedRunResult(result)) {
            input.onRunStartFinished?.();
            input.onError(
                formatRunStartRejection({
                    rejection: result,
                    providerById: input.providerById,
                })
            );
            return;
        }
        input.onPromptCleared();
        input.onRunStarted(result);
    } catch (error: unknown) {
        input.onRunStartFinished?.();
        const message = error instanceof Error ? error.message : String(error);
        input.onError(`Run failed: ${message}`);
    }
}
