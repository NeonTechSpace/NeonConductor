import type { ToolInvocationObservabilityContext, ToolInvokeInput } from '@/app/backend/runtime/contracts';
import { getExecutionPreset } from '@/app/backend/runtime/services/profile/executionPreset';
import { emitToolCompletedEvent, emitToolFailedEvent } from '@/app/backend/runtime/services/toolExecution/events';
import { serializeToolInvocationOutcome } from '@/app/backend/runtime/services/toolExecution/results';
import { resolveToolApprovalDecision } from '@/app/backend/runtime/services/toolExecution/toolApprovalLifecycle';
import { resolveToolBoundaryDecision } from '@/app/backend/runtime/services/toolExecution/toolBoundaryPolicy';
import { dispatchToolInvocation } from '@/app/backend/runtime/services/toolExecution/toolDispatchExecutor';
import {
    logBlockedOutcome,
    logDispatchOutcome,
    publishAllowedExecutionObservability,
    publishBlockedOutcomeObservability,
    publishDispatchOutcomeObservability,
} from '@/app/backend/runtime/services/toolExecution/toolExecutionObservability';
import { resolveToolRequestContext } from '@/app/backend/runtime/services/toolExecution/toolRequestContextResolver';
import type {
    ToolExecutionResult,
    ToolInvocationOutcome,
} from '@/app/backend/runtime/services/toolExecution/types';

export class ToolExecutionService {
    async invoke(
        input: ToolInvokeInput,
        observability?: ToolInvocationObservabilityContext
    ): Promise<ToolExecutionResult> {
        const outcome = await this.invokeWithOutcome(input, observability);
        return serializeToolInvocationOutcome(outcome);
    }

    async invokeWithOutcome(
        input: ToolInvokeInput,
        observability?: ToolInvocationObservabilityContext
    ): Promise<ToolInvocationOutcome> {
        const requestContext = await resolveToolRequestContext(input);
        if ('kind' in requestContext) {
            return requestContext;
        }

        const executionPreset = await getExecutionPreset(input.profileId);
        const boundaryOutcome = await resolveToolBoundaryDecision({
            request: input,
            context: requestContext,
            executionPreset,
        });
        if (boundaryOutcome) {
            logBlockedOutcome({
                request: input,
                outcome: boundaryOutcome,
            });
            publishBlockedOutcomeObservability({
                request: input,
                outcome: boundaryOutcome,
                observability,
            });
            return boundaryOutcome;
        }

        const approvalDecision = await resolveToolApprovalDecision({
            request: input,
            context: requestContext,
            executionPreset,
        });
        if ('kind' in approvalDecision && approvalDecision.kind !== 'allow') {
            logBlockedOutcome({
                request: input,
                outcome: approvalDecision,
            });
            publishBlockedOutcomeObservability({
                request: input,
                outcome: approvalDecision,
                observability,
            });
            return approvalDecision;
        }

        publishAllowedExecutionObservability({
            request: input,
            observability,
            allowed: approvalDecision,
        });

        const dispatchOutcome = await dispatchToolInvocation({
            context: requestContext,
            allowed: approvalDecision,
        });
        if (dispatchOutcome.kind === 'failed') {
            await emitToolFailedEvent({
                toolId: dispatchOutcome.toolId,
                profileId: input.profileId,
                resource: approvalDecision.resource,
                policy: 'allow',
                source: approvalDecision.policy.source,
                error: dispatchOutcome.message,
            });
        } else {
            await emitToolCompletedEvent({
                toolId: dispatchOutcome.toolId,
                profileId: input.profileId,
                resource: approvalDecision.resource,
                policy: 'allow',
                source: approvalDecision.policy.source,
            });
        }
        logDispatchOutcome({
            request: input,
            outcome: dispatchOutcome,
        });
        publishDispatchOutcomeObservability({
            request: input,
            outcome: dispatchOutcome,
            observability,
        });
        return dispatchOutcome;
    }
}

export const toolExecutionService = new ToolExecutionService();
