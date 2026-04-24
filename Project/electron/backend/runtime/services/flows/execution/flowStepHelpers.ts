import type {
    FlowModeRunStepDefinition,
    FlowWorkflowStepDefinition,
    PlanStatus,
} from '@/app/backend/runtime/contracts';
import type { OperationalErrorCode } from '@/app/backend/runtime/services/common/operationalError';
import type { PlanServiceErrorCode } from '@/app/backend/runtime/services/plan/errors';

export type RequiredPlanCheckpointStatus = 'draft' | 'approved';

export function readPlanCheckpointStatus(step: FlowWorkflowStepDefinition): RequiredPlanCheckpointStatus {
    return step.requireApprovedPlan === false ? 'draft' : 'approved';
}

export function readPlanCheckpointReason(requiredPlanStatus: RequiredPlanCheckpointStatus): string {
    return requiredPlanStatus === 'approved'
        ? 'Flow is waiting for the linked plan to be approved before continuing.'
        : 'Flow is waiting for the linked plan to reach draft status before continuing.';
}

export function isPlanCheckpointSatisfied(
    status: PlanStatus,
    requiredPlanStatus: RequiredPlanCheckpointStatus
): boolean {
    if (requiredPlanStatus === 'draft') {
        return ['draft', 'approved', 'implementing', 'implemented'].includes(status);
    }

    return ['approved', 'implementing', 'implemented'].includes(status);
}

export function readPlanTerminalFailureMessage(status: PlanStatus): string | null {
    if (status === 'failed') {
        return 'Linked planning artifact failed before the required checkpoint was reached.';
    }

    if (status === 'cancelled') {
        return 'Linked planning artifact was cancelled before the required checkpoint was reached.';
    }
    return null;
}

export function readModeRunThreadTitle(step: FlowModeRunStepDefinition): string {
    return `Flow: ${step.label}`;
}

export function readInvalidPlanCheckpointMessage(requiredPlanStatus: RequiredPlanCheckpointStatus): string {
    return requiredPlanStatus === 'approved'
        ? 'Flow instance cannot resume until the linked plan is approved.'
        : 'Flow instance cannot resume until the linked plan reaches draft status.';
}

export function mapPlanErrorCodeToOperational(code: PlanServiceErrorCode): OperationalErrorCode {
    switch (code) {
        case 'invalid_mode':
            return 'invalid_mode';
        case 'unsupported_tab':
            return 'unsupported_tab';
        case 'invalid_tab':
            return 'invalid_input';
        default:
            return 'invalid_input';
    }
}

export function wasSignalAborted(signal: AbortSignal): boolean {
    return signal.aborted;
}
