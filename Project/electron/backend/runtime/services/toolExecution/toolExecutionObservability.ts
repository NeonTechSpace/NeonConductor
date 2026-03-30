import type { ToolInvocationObservabilityContext, ToolInvokeInput } from '@/app/backend/runtime/contracts';
import { publishToolStateChangedObservabilityEvent } from '@/app/backend/runtime/services/observability/publishers';
import type {
    AllowedToolInvocation,
    ToolDispatchExecutionResult,
} from '@/app/backend/runtime/services/toolExecution/toolExecutionLifecycle.types';
import type { ToolBlockedInvocationOutcome } from '@/app/backend/runtime/services/toolExecution/types';
import { appLog } from '@/app/main/logging';

function toolLogContext(input: ToolInvokeInput, toolId: string, source?: string) {
    return {
        profileId: input.profileId,
        toolId,
        ...(source ? { source } : {}),
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
    };
}

export function publishBlockedOutcomeObservability(input: {
    request: ToolInvokeInput;
    outcome: ToolBlockedInvocationOutcome;
    observability: ToolInvocationObservabilityContext | undefined;
}): void {
    if (!input.observability) {
        return;
    }

    publishToolStateChangedObservabilityEvent({
        profileId: input.request.profileId,
        sessionId: input.observability.sessionId,
        runId: input.observability.runId,
        providerId: input.observability.providerId,
        modelId: input.observability.modelId,
        toolCallId: input.observability.toolCallId,
        toolName: input.observability.toolName,
        state: input.outcome.kind === 'approval_required' ? 'approval_required' : 'denied',
        argumentsText: input.observability.argumentsText,
        ...(input.outcome.kind === 'approval_required' ? { requestId: input.outcome.requestId } : {}),
        policySource: input.outcome.policy.source,
    });
}

export function publishAllowedExecutionObservability(input: {
    request: ToolInvokeInput;
    observability: ToolInvocationObservabilityContext | undefined;
    allowed: AllowedToolInvocation;
}): void {
    if (!input.observability) {
        return;
    }

    publishToolStateChangedObservabilityEvent({
        profileId: input.request.profileId,
        sessionId: input.observability.sessionId,
        runId: input.observability.runId,
        providerId: input.observability.providerId,
        modelId: input.observability.modelId,
        toolCallId: input.observability.toolCallId,
        toolName: input.observability.toolName,
        state: 'approved',
        argumentsText: input.observability.argumentsText,
        policySource: input.allowed.policy.source,
    });
    publishToolStateChangedObservabilityEvent({
        profileId: input.request.profileId,
        sessionId: input.observability.sessionId,
        runId: input.observability.runId,
        providerId: input.observability.providerId,
        modelId: input.observability.modelId,
        toolCallId: input.observability.toolCallId,
        toolName: input.observability.toolName,
        state: 'executing',
        argumentsText: input.observability.argumentsText,
        policySource: input.allowed.policy.source,
    });
}

export function publishDispatchOutcomeObservability(input: {
    request: ToolInvokeInput;
    outcome: ToolDispatchExecutionResult;
    observability: ToolInvocationObservabilityContext | undefined;
}): void {
    if (!input.observability) {
        return;
    }

    publishToolStateChangedObservabilityEvent({
        profileId: input.request.profileId,
        sessionId: input.observability.sessionId,
        runId: input.observability.runId,
        providerId: input.observability.providerId,
        modelId: input.observability.modelId,
        toolCallId: input.observability.toolCallId,
        toolName: input.observability.toolName,
        state: input.outcome.kind === 'executed' ? 'completed' : 'failed',
        argumentsText: input.observability.argumentsText,
        ...(input.outcome.kind === 'failed' ? { error: input.outcome.message } : {}),
        ...(input.outcome.policy ? { policySource: input.outcome.policy.source } : {}),
    });
}

export function logBlockedOutcome(input: { request: ToolInvokeInput; outcome: ToolBlockedInvocationOutcome }): void {
    appLog[input.outcome.kind === 'denied' ? 'warn' : 'info']({
        tag: 'tool-execution',
        message:
            input.outcome.kind === 'denied'
                ? 'Blocked tool invocation by deny policy.'
                : 'Tool invocation requires permission approval.',
        ...toolLogContext(input.request, input.outcome.toolId, input.outcome.policy.source),
        ...(input.outcome.kind === 'approval_required' ? { requestId: input.outcome.requestId } : {}),
    });
}

export function logDispatchOutcome(input: { request: ToolInvokeInput; outcome: ToolDispatchExecutionResult }): void {
    if (input.outcome.kind === 'failed') {
        appLog.warn({
            tag: 'tool-execution',
            message: 'Tool invocation failed.',
            ...toolLogContext(input.request, input.outcome.toolId, input.outcome.policy?.source),
            errorCode: input.outcome.error,
            errorMessage: input.outcome.message,
        });
        return;
    }

    appLog.debug({
        tag: 'tool-execution',
        message: 'Completed tool invocation.',
        ...toolLogContext(input.request, input.outcome.toolId, input.outcome.policy.source),
    });
}
