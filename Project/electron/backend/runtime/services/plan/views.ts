import type {
    PlanEvidenceAttachmentView,
    PlanRecordView,
    PlanResearchBatchView,
} from '@/app/backend/runtime/contracts';
import type {
    PlanEvidenceAttachmentRecord,
    PlanResearchBatchRecord,
    PlanResearchWorkerRecord,
    PlanViewProjection,
} from '@/app/backend/persistence/types';
import { InvariantError } from '@/app/backend/runtime/services/common/fatalErrors';
import { readPlannerResearchCapacity } from '@/app/backend/runtime/services/plan/capacity';
import { buildPlanResearchRecommendation } from '@/app/backend/runtime/services/plan/recommendation';

function groupWorkersByBatchId(workers: PlanResearchWorkerRecord[]): Map<string, PlanResearchWorkerRecord[]> {
    const workersByBatchId = new Map<string, PlanResearchWorkerRecord[]>();
    for (const worker of workers) {
        const batchWorkers = workersByBatchId.get(worker.batchId) ?? [];
        batchWorkers.push(worker);
        workersByBatchId.set(worker.batchId, batchWorkers);
    }

    for (const batchWorkers of workersByBatchId.values()) {
        batchWorkers.sort((left, right) => left.sequence - right.sequence);
    }

    return workersByBatchId;
}

function toPlanResearchBatchView(
    batch: PlanResearchBatchRecord,
    workersByBatchId: Map<string, PlanResearchWorkerRecord[]>
): PlanResearchBatchView {
    const workers = workersByBatchId.get(batch.id) ?? [];
    return {
        id: batch.id,
        planId: batch.planId,
        planRevisionId: batch.planRevisionId,
        variantId: batch.variantId,
        promptMarkdown: batch.promptMarkdown,
        requestedWorkerCount: batch.requestedWorkerCount,
        recommendedWorkerCount: batch.recommendedWorkerCount,
        hardMaxWorkerCount: batch.hardMaxWorkerCount,
        status: batch.status,
        workers: workers.map((worker) => ({
            id: worker.id,
            batchId: worker.batchId,
            sequence: worker.sequence,
            label: worker.label,
            promptMarkdown: worker.promptMarkdown,
            status: worker.status,
            ...(worker.childThreadId ? { childThreadId: worker.childThreadId } : {}),
            ...(worker.childSessionId ? { childSessionId: worker.childSessionId } : {}),
            ...(worker.activeRunId ? { activeRunId: worker.activeRunId } : {}),
            ...(worker.runId ? { runId: worker.runId } : {}),
            ...(worker.resultSummaryMarkdown ? { resultSummaryMarkdown: worker.resultSummaryMarkdown } : {}),
            ...(worker.resultDetailsMarkdown ? { resultDetailsMarkdown: worker.resultDetailsMarkdown } : {}),
            ...(worker.errorMessage ? { errorMessage: worker.errorMessage } : {}),
            createdAt: worker.createdAt,
            ...(worker.completedAt ? { completedAt: worker.completedAt } : {}),
            ...(worker.abortedAt ? { abortedAt: worker.abortedAt } : {}),
        })),
        createdAt: batch.createdAt,
        ...(batch.completedAt ? { completedAt: batch.completedAt } : {}),
        ...(batch.abortedAt ? { abortedAt: batch.abortedAt } : {}),
    };
}

function toPlanEvidenceAttachmentView(record: PlanEvidenceAttachmentRecord): PlanEvidenceAttachmentView {
    return {
        id: record.id,
        planRevisionId: record.planRevisionId,
        sourceKind: record.sourceKind,
        researchBatchId: record.researchBatchId,
        researchWorkerId: record.researchWorkerId,
        label: record.label,
        summaryMarkdown: record.summaryMarkdown,
        detailsMarkdown: record.detailsMarkdown,
        ...(record.childThreadId ? { childThreadId: record.childThreadId } : {}),
        ...(record.childSessionId ? { childSessionId: record.childSessionId } : {}),
        createdAt: record.createdAt,
    };
}

function toPlanViewFromProjection(projection: PlanViewProjection | null): PlanRecordView | null {
    if (!projection) {
        return null;
    }

    const { plan, items, variants, followUps, researchBatches, researchWorkers, evidenceAttachments, history, recoveryBanner } =
        projection;
    const currentVariant = variants.find((variant) => variant.id === plan.currentVariantId);
    const approvedVariant = plan.approvedVariantId
        ? variants.find((variant) => variant.id === plan.approvedVariantId)
        : undefined;
    const capacity = readPlannerResearchCapacity();
    const researchRecommendation = buildPlanResearchRecommendation({
        plan,
        items,
        followUps,
        evidenceAttachments,
        capacity,
        ...(plan.advancedSnapshot ? { advancedSnapshot: plan.advancedSnapshot } : {}),
    });
    const workersByBatchId = groupWorkersByBatchId(researchWorkers);

    return {
        id: plan.id,
        profileId: plan.profileId,
        sessionId: plan.sessionId,
        topLevelTab: plan.topLevelTab,
        modeKey: plan.modeKey,
        ...(plan.planningDepth ? { planningDepth: plan.planningDepth } : {}),
        status: plan.status,
        sourcePrompt: plan.sourcePrompt,
        summaryMarkdown: plan.summaryMarkdown,
        ...(plan.advancedSnapshot ? { advancedSnapshot: plan.advancedSnapshot } : {}),
        researchBatches: researchBatches.map((batch) => toPlanResearchBatchView(batch, workersByBatchId)),
        evidenceAttachments: evidenceAttachments.map((attachment) => toPlanEvidenceAttachmentView(attachment)),
        researchRecommendation,
        researchCapacity: capacity,
        currentRevisionId: plan.currentRevisionId,
        currentRevisionNumber: plan.currentRevisionNumber,
        currentVariantId: plan.currentVariantId,
        currentVariantName: currentVariant?.name ?? 'main',
        ...(plan.approvedRevisionId ? { approvedRevisionId: plan.approvedRevisionId } : {}),
        ...(plan.approvedRevisionNumber !== undefined ? { approvedRevisionNumber: plan.approvedRevisionNumber } : {}),
        ...(plan.approvedVariantId ? { approvedVariantId: plan.approvedVariantId } : {}),
        ...(approvedVariant?.name ? { approvedVariantName: approvedVariant.name } : {}),
        questions: plan.questions.map((question) => ({
            id: question.id,
            question: question.question,
            category: question.category,
            required: question.required,
            ...(question.placeholderText ? { placeholderText: question.placeholderText } : {}),
            ...(question.helpText ? { helpText: question.helpText } : {}),
            ...(plan.answers[question.id] ? { answer: plan.answers[question.id] } : {}),
        })),
        variants,
        followUps,
        history,
        ...(recoveryBanner ? { recoveryBanner } : {}),
        items: items.map((item) => ({
            id: item.id,
            sequence: item.sequence,
            description: item.description,
            status: item.status,
            ...(item.runId ? { runId: item.runId } : {}),
            ...(item.errorMessage ? { errorMessage: item.errorMessage } : {}),
        })),
        ...(plan.workspaceFingerprint ? { workspaceFingerprint: plan.workspaceFingerprint } : {}),
        ...(plan.implementationRunId ? { implementationRunId: plan.implementationRunId } : {}),
        ...(plan.orchestratorRunId ? { orchestratorRunId: plan.orchestratorRunId } : {}),
        ...(plan.approvedAt ? { approvedAt: plan.approvedAt } : {}),
        ...(plan.implementedAt ? { implementedAt: plan.implementedAt } : {}),
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
    };
}

export function toPlanView(projection: PlanViewProjection | null): PlanRecordView | null {
    return toPlanViewFromProjection(projection);
}

export function requirePlanView(projection: PlanViewProjection | null, context: string): PlanRecordView {
    const view = toPlanView(projection);
    if (!view) {
        throw new InvariantError(`Expected plan view during ${context}.`);
    }

    return view;
}
