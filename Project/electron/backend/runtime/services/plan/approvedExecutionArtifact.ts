import { planStore } from '@/app/backend/persistence/stores';
import type { PlanRecord } from '@/app/backend/persistence/types';
import { InvariantError } from '@/app/backend/runtime/services/common/fatalErrors';

export interface ApprovedPlanExecutionArtifactItem {
    sequence: number;
    description: string;
}

export interface ApprovedPlanExecutionArtifact {
    planId: PlanRecord['id'];
    sessionId: PlanRecord['sessionId'];
    topLevelTab: PlanRecord['topLevelTab'];
    approvedRevisionId: NonNullable<PlanRecord['approvedRevisionId']>;
    approvedRevisionNumber: NonNullable<PlanRecord['approvedRevisionNumber']>;
    summaryMarkdown: string;
    items: ApprovedPlanExecutionArtifactItem[];
}

export async function resolveApprovedPlanExecutionArtifact(
    plan: PlanRecord
): Promise<ApprovedPlanExecutionArtifact | null> {
    if (!plan.approvedRevisionId || plan.approvedRevisionNumber === undefined) {
        return null;
    }

    const approvedSnapshot = await planStore.resolveApprovedRevisionSnapshot({
        planId: plan.id,
    });
    if (!approvedSnapshot) {
        return null;
    }

    if (approvedSnapshot.revision.id !== plan.approvedRevisionId) {
        throw new InvariantError(
            `Approved revision snapshot mismatch for plan "${plan.id}": expected "${plan.approvedRevisionId}" but resolved "${approvedSnapshot.revision.id}".`
        );
    }

    return {
        planId: plan.id,
        sessionId: plan.sessionId,
        topLevelTab: plan.topLevelTab,
        approvedRevisionId: approvedSnapshot.revision.id,
        approvedRevisionNumber: approvedSnapshot.revision.revisionNumber,
        summaryMarkdown: approvedSnapshot.revision.summaryMarkdown,
        items: approvedSnapshot.items.map((item) => ({
            sequence: item.sequence,
            description: item.description,
        })),
    };
}
