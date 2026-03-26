import type { ToolExecutionResult, ToolInvocationOutcome } from '@/app/backend/runtime/services/toolExecution/types';

export function serializeToolInvocationOutcome(outcome: ToolInvocationOutcome): ToolExecutionResult {
    if (outcome.kind === 'executed') {
        return {
            ok: true,
            toolId: outcome.toolId,
            output: outcome.output,
            at: outcome.at,
            policy: outcome.policy,
        };
    }

    if (outcome.kind === 'approval_required') {
        return {
            ok: false,
            toolId: outcome.toolId,
            error: 'permission_required',
            message: outcome.message,
            args: outcome.args,
            at: outcome.at,
            requestId: outcome.requestId,
            policy: outcome.policy,
        };
    }

    if (outcome.kind === 'denied') {
        return {
            ok: false,
            toolId: outcome.toolId,
            error: 'policy_denied',
            message: outcome.message,
            args: outcome.args,
            at: outcome.at,
            policy: outcome.policy,
        };
    }

    return {
        ok: false,
        toolId: outcome.toolId,
        error: outcome.error,
        message: outcome.message,
        args: outcome.args,
        at: outcome.at,
        ...(outcome.policy ? { policy: outcome.policy } : {}),
    };
}
