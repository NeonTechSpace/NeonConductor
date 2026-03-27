import type { ProviderRuntimePart } from '@/app/backend/providers/types';
import { publishProviderPartObservabilityEvent } from '@/app/backend/runtime/services/observability/publishers';
import { createAssistantStatusPartPayload } from '@/shared/contracts/types/messagePart';
import type { EntityId, RuntimeProviderId } from '@/shared/contracts';

export const FIRST_OUTPUT_STALLED_MS = 10_000;
export const FIRST_OUTPUT_TIMEOUT_MS = 30_000;

interface PartRecorder {
    recordPart(part: ProviderRuntimePart): Promise<void>;
}

export async function appendAssistantLifecycleStatusPart(input: {
    partRecorder: PartRecorder;
    code: 'received' | 'stalled' | 'failed_before_output';
    label: string;
    elapsedMs?: number;
    observabilityContext?: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        runId: EntityId<'run'>;
        providerId: RuntimeProviderId;
        modelId: string;
    };
}): Promise<void> {
    const payload = createAssistantStatusPartPayload({
        code: input.code,
        label: input.label,
        ...(input.elapsedMs !== undefined ? { elapsedMs: input.elapsedMs } : {}),
    });

    if (input.observabilityContext) {
        publishProviderPartObservabilityEvent({
            ...input.observabilityContext,
            part: {
                partType: 'status',
                payload,
            },
        });
    }

    await input.partRecorder.recordPart({
        partType: 'status',
        payload,
    });
}

export interface FirstOutputWatchdog {
    timeoutSignal: AbortSignal;
    markRenderableOutputReceived(): void;
    dispose(): void;
    hasTimedOut(): boolean;
}

export function createFirstOutputWatchdog(input: {
    partRecorder: PartRecorder;
    signal: AbortSignal;
    observabilityContext: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        runId: EntityId<'run'>;
        providerId: RuntimeProviderId;
        modelId: string;
    };
}): FirstOutputWatchdog {
    const timeoutController = new AbortController();
    const timeoutSignal = AbortSignal.any([input.signal, timeoutController.signal]);
    let firstRenderableOutputReceived = false;
    let firstOutputTimedOut = false;
    const dispose = (): void => {
        globalThis.clearTimeout(stalledTimer);
        globalThis.clearTimeout(timeoutTimer);
    };

    const stalledTimer = globalThis.setTimeout(() => {
        if (firstRenderableOutputReceived || firstOutputTimedOut || input.signal.aborted) {
            return;
        }

        void appendAssistantLifecycleStatusPart({
            partRecorder: input.partRecorder,
            code: 'stalled',
            label: 'Still waiting for the first response chunk...',
            elapsedMs: FIRST_OUTPUT_STALLED_MS,
            observabilityContext: input.observabilityContext,
        }).catch(() => undefined);
    }, FIRST_OUTPUT_STALLED_MS);

    const timeoutTimer = globalThis.setTimeout(() => {
        if (firstRenderableOutputReceived || firstOutputTimedOut || input.signal.aborted) {
            return;
        }

        firstOutputTimedOut = true;
        timeoutController.abort();
    }, FIRST_OUTPUT_TIMEOUT_MS);

    return {
        timeoutSignal,
        markRenderableOutputReceived(): void {
            firstRenderableOutputReceived = true;
            dispose();
        },
        dispose,
        hasTimedOut(): boolean {
            return firstOutputTimedOut;
        },
    };
}
