import type { ProviderRuntimePart, ProviderRuntimeTransportSelection, ProviderRuntimeUsage } from '@/app/backend/providers/types';
import type { RuntimeProviderId, TopLevelTab } from '@/app/backend/runtime/contracts';
import { neonObservabilityService } from '@/app/backend/runtime/services/observability/service';
import type { EntityId } from '@/shared/contracts';

interface ObservabilityRunContext {
    profileId: string;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
    providerId: RuntimeProviderId | string;
    modelId: string;
}

function publishStreamChunk(
    context: ObservabilityRunContext,
    source: 'provider.stream' | 'runtime.run_execution' | 'runtime.terminal_state',
    chunk:
        | {
              kind: 'text_delta';
              text: string;
          }
        | {
              kind: 'reasoning_delta';
              text: string;
              summary: boolean;
          }
        | {
              kind: 'tool_call';
              toolCallId: string;
              toolName: string;
              argumentsText: string;
          }
        | {
              kind: 'tool_result';
              toolCallId: string;
              toolName: string;
              outputText: string;
              isError: boolean;
          }
        | {
              kind: 'status';
              code?: string;
              label: string;
              elapsedMs?: number;
          }
        | ({
              kind: 'usage';
          } & {
              inputTokens?: number;
              outputTokens?: number;
              cachedTokens?: number;
              reasoningTokens?: number;
              totalTokens?: number;
              latencyMs?: number;
              costMicrounits?: number;
          })
        | {
              kind: 'done';
          }
        | {
              kind: 'error';
              code: string;
              message: string;
          }
): void {
    neonObservabilityService.publish({
        ...context,
        kind: 'stream_chunk',
        source,
        chunk,
    });
}

export function publishRunStartedObservabilityEvent(input: ObservabilityRunContext & {
    topLevelTab: TopLevelTab;
    modeKey: string;
}): void {
    neonObservabilityService.publish({
        ...input,
        kind: 'run_started',
        source: 'runtime.run_execution',
    });
}

export function publishRunCompletedObservabilityEvent(input: ObservabilityRunContext): void {
    neonObservabilityService.publish({
        ...input,
        kind: 'run_completed',
        source: 'runtime.run_execution',
    });
    publishStreamChunk(input, 'runtime.run_execution', {
        kind: 'done',
    });
}

export function publishRunFailedObservabilityEvent(input: ObservabilityRunContext & {
    errorCode: string;
    errorMessage: string;
}): void {
    neonObservabilityService.publish({
        ...input,
        kind: 'run_failed',
        source: 'runtime.terminal_state',
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
    });
    publishStreamChunk(input, 'runtime.terminal_state', {
        kind: 'error',
        code: input.errorCode,
        message: input.errorMessage,
    });
}

export function publishRunAbortedObservabilityEvent(input: ObservabilityRunContext): void {
    neonObservabilityService.publish({
        ...input,
        kind: 'run_aborted',
        source: 'runtime.terminal_state',
    });
    publishStreamChunk(input, 'runtime.terminal_state', {
        kind: 'error',
        code: 'aborted',
        message: 'Run aborted.',
    });
}

export function publishTransportSelectedObservabilityEvent(
    input: ObservabilityRunContext & {
        selection: ProviderRuntimeTransportSelection;
    }
): void {
    neonObservabilityService.publish({
        ...input,
        kind: 'transport_selected',
        source: 'runtime.transport',
        requestedTransportFamily: input.selection.requested,
        selectedTransportFamily: input.selection.selected,
        degraded: input.selection.degraded,
        ...(input.selection.degradedReason ? { degradedReason: input.selection.degradedReason } : {}),
    });
}

export function publishProviderPartObservabilityEvent(
    input: ObservabilityRunContext & {
        part: ProviderRuntimePart;
    }
): void {
    const part = input.part;

    if (part.partType === 'text') {
        const text = part.payload['text'];
        if (typeof text === 'string' && text.length > 0) {
            publishStreamChunk(input, 'provider.stream', {
                kind: 'text_delta',
                text,
            });
        }
        return;
    }

    if (part.partType === 'reasoning' || part.partType === 'reasoning_summary') {
        const text = part.payload['text'];
        if (typeof text === 'string' && text.length > 0) {
            publishStreamChunk(input, 'provider.stream', {
                kind: 'reasoning_delta',
                text,
                summary: part.partType === 'reasoning_summary',
            });
        }
        return;
    }

    if (part.partType === 'tool_call') {
        const toolCallId = part.payload['callId'];
        const toolName = part.payload['toolName'];
        const argumentsText = part.payload['argumentsText'];
        if (typeof toolCallId === 'string' && typeof toolName === 'string' && typeof argumentsText === 'string') {
            publishStreamChunk(input, 'provider.stream', {
                kind: 'tool_call',
                toolCallId,
                toolName,
                argumentsText,
            });
        }
        return;
    }

    if (part.partType === 'tool_result') {
        const toolCallId = part.payload['callId'];
        const toolName = part.payload['toolName'];
        const outputText = part.payload['outputText'];
        const isError = part.payload['isError'];
        if (
            typeof toolCallId === 'string' &&
            typeof toolName === 'string' &&
            typeof outputText === 'string' &&
            typeof isError === 'boolean'
        ) {
            publishStreamChunk(input, 'provider.stream', {
                kind: 'tool_result',
                toolCallId,
                toolName,
                outputText,
                isError,
            });
        }
        return;
    }

    if (part.partType === 'status') {
        const label = part.payload['label'];
        const code = part.payload['code'];
        const elapsedMs = part.payload['elapsedMs'];
        if (typeof label === 'string' && label.length > 0) {
            publishStreamChunk(input, 'provider.stream', {
                kind: 'status',
                label,
                ...(typeof code === 'string' ? { code } : {}),
                ...(typeof elapsedMs === 'number' ? { elapsedMs } : {}),
            });
        }
        return;
    }

    if (part.partType === 'error') {
        const message = part.payload['message'];
        const code = part.payload['code'];
        if (typeof message === 'string' && message.length > 0) {
            publishStreamChunk(input, 'provider.stream', {
                kind: 'error',
                code: typeof code === 'string' ? code : 'provider_error',
                message,
            });
        }
    }
}

export function publishUsageObservabilityEvent(input: ObservabilityRunContext & {
    usage: ProviderRuntimeUsage;
}): void {
    neonObservabilityService.publish({
        ...input,
        kind: 'usage_updated',
        source: 'provider.stream',
        usage: input.usage,
    });
    publishStreamChunk(input, 'provider.stream', {
        kind: 'usage',
        ...input.usage,
    });
}

export function publishToolStateChangedObservabilityEvent(input: ObservabilityRunContext & {
    toolCallId: string;
    toolName: string;
    state:
        | 'proposed'
        | 'input_complete'
        | 'approval_required'
        | 'approved'
        | 'denied'
        | 'executing'
        | 'completed'
        | 'failed'
        | 'cancelled';
    argumentsText?: string;
    requestId?: string;
    error?: string;
    policySource?: string;
}): void {
    neonObservabilityService.publish({
        ...input,
        kind: 'tool_state_changed',
        source: 'runtime.tool_execution',
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        state: input.state,
        ...(input.argumentsText ? { argumentsText: input.argumentsText } : {}),
        ...(input.requestId ? { requestId: input.requestId } : {}),
        ...(input.error ? { error: input.error } : {}),
        ...(input.policySource ? { policySource: input.policySource } : {}),
    });
}

export function publishToolResultChunkObservabilityEvent(input: ObservabilityRunContext & {
    toolCallId: string;
    toolName: string;
    outputText: string;
    isError: boolean;
}): void {
    publishStreamChunk(input, 'runtime.run_execution', {
        kind: 'tool_result',
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        outputText: input.outputText,
        isError: input.isError,
    });
}
