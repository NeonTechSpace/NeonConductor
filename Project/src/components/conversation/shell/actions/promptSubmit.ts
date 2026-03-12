import {
    isEntityId,
    isProviderRunnable,
    toActionableRunError,
    type RunTargetSelection,
} from '@/web/components/conversation/shell/workspace/helpers';

import type { RuntimeRunOptions } from '@/shared/contracts';
import type {
    ComposerImageAttachmentInput,
    EntityId,
    PlanStartInput,
    PlanRecordView,
    RuntimeProviderId,
    SessionStartRunInput,
    TopLevelTab,
} from '@/shared/contracts';

interface ProviderAuthView {
    label: string;
    authState: string;
    authMethod: string;
}

type PlanStartSuccessResult = { plan: PlanRecordView };
type RunStartAcceptedResult = { accepted: true };
type RunStartRejectedResult = { accepted: false; message?: string };

function isAcceptedRunResult<
    TRunStartAcceptedResult extends RunStartAcceptedResult,
>(
    result: TRunStartAcceptedResult | RunStartRejectedResult
): result is TRunStartAcceptedResult {
    return result.accepted;
}

interface SubmitPromptInput<
    TPlanStartResult extends PlanStartSuccessResult,
    TRunStartAcceptedResult extends RunStartAcceptedResult,
> {
    prompt: string;
    attachments?: ComposerImageAttachmentInput[];
    isStartingRun: boolean;
    selectedSessionId: string | undefined;
    isPlanningMode: boolean;
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    workspaceFingerprint: string | undefined;
    worktreeId?: EntityId<'wt'>;
    resolvedRunTarget: RunTargetSelection | undefined;
    runtimeOptions: RuntimeRunOptions;
    providerById: Map<RuntimeProviderId, ProviderAuthView>;
    startPlan: (input: PlanStartInput) => Promise<TPlanStartResult>;
    startRun: (input: SessionStartRunInput) => Promise<TRunStartAcceptedResult | RunStartRejectedResult>;
    onPromptCleared: () => void;
    onPlanStarted: (result: TPlanStartResult) => void;
    onRunStarted: (result: TRunStartAcceptedResult) => void;
    onError: (message: string) => void;
}

export async function submitPrompt<
    TPlanStartResult extends PlanStartSuccessResult,
    TRunStartAcceptedResult extends RunStartAcceptedResult,
>(
    input: SubmitPromptInput<TPlanStartResult, TRunStartAcceptedResult>
): Promise<void> {
    const trimmedPrompt = input.prompt.trim();
    const attachments = input.attachments ?? [];
    if ((trimmedPrompt.length === 0 && attachments.length === 0) || input.isStartingRun) {
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
    const providerLabel = selectedProvider?.label ?? input.resolvedRunTarget.providerId;
    if (selectedProvider && !isProviderRunnable(selectedProvider.authState, selectedProvider.authMethod)) {
        input.onError(toActionableRunError('Provider is not authenticated.', selectedProvider.label));
        return;
    }

    try {
        const result = await input.startRun({
            profileId: input.profileId,
            sessionId: input.selectedSessionId,
            prompt: trimmedPrompt,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            providerId: input.resolvedRunTarget.providerId,
            modelId: input.resolvedRunTarget.modelId,
            ...(attachments.length > 0 ? { attachments } : {}),
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            ...(input.worktreeId ? { worktreeId: input.worktreeId } : {}),
            runtimeOptions: input.runtimeOptions,
        });
        if (!isAcceptedRunResult(result)) {
            const message = typeof result.message === 'string' ? result.message : 'Run start was rejected.';
            input.onError(toActionableRunError(message, providerLabel));
            return;
        }
        input.onPromptCleared();
        input.onRunStarted(result);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        input.onError(toActionableRunError(message, providerLabel));
    }
}

