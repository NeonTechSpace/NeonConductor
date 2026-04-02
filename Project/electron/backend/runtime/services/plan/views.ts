import type {
    PlanEvidenceAttachmentView,
    PlanAdvancedSnapshotView,
    PlanPhaseRecordView,
    PlanPhaseRevisionView,
    PlanRecordView,
    PlanResearchBatchView,
} from '@/app/backend/runtime/contracts';
import type {
    PlanEvidenceAttachmentRecord,
    PlanPhaseRecord,
    PlanPhaseRevisionItemRecord,
    PlanPhaseRevisionRecord,
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

function toPlanPhaseRevisionView(input: {
    revision: PlanPhaseRevisionRecord;
    items: PlanPhaseRevisionItemRecord[];
}): PlanPhaseRevisionView {
    return {
        id: input.revision.id,
        planPhaseId: input.revision.planPhaseId,
        revisionNumber: input.revision.revisionNumber,
        summaryMarkdown: input.revision.summaryMarkdown,
        items: input.items.map((item) => ({
            id: item.id,
            sequence: item.sequence,
            description: item.description,
            status: 'pending',
            createdAt: item.createdAt,
        })),
        createdByKind: input.revision.createdByKind,
        createdAt: input.revision.createdAt,
        ...(input.revision.previousRevisionId ? { previousRevisionId: input.revision.previousRevisionId } : {}),
        ...(input.revision.supersededAt ? { supersededAt: input.revision.supersededAt } : {}),
    };
}

function toPlanPhaseView(input: {
    phase: PlanPhaseRecord;
    revisions: PlanPhaseRevisionRecord[];
    revisionItems: PlanPhaseRevisionItemRecord[];
    advancedSnapshot: PlanAdvancedSnapshotView | undefined;
}): PlanPhaseRecordView {
    const itemsByRevisionId = new Map<string, PlanPhaseRevisionItemRecord[]>();
    for (const item of input.revisionItems) {
        const items = itemsByRevisionId.get(item.planPhaseRevisionId) ?? [];
        items.push(item);
        itemsByRevisionId.set(item.planPhaseRevisionId, items);
    }

    const outline = input.advancedSnapshot?.phases.find((phase) => phase.id === input.phase.phaseOutlineId);

    return {
        id: input.phase.id,
        planId: input.phase.planId,
        planRevisionId: input.phase.planRevisionId,
        variantId: input.phase.variantId,
        phaseOutlineId: input.phase.phaseOutlineId,
        phaseSequence: input.phase.phaseSequence,
        title: input.phase.title,
        goalMarkdown: outline?.goalMarkdown ?? input.phase.goalMarkdown,
        exitCriteriaMarkdown: outline?.exitCriteriaMarkdown ?? input.phase.exitCriteriaMarkdown,
        status: input.phase.status,
        currentRevisionId: input.phase.currentRevisionId,
        currentRevisionNumber: input.phase.currentRevisionNumber,
        ...(input.phase.approvedRevisionId ? { approvedRevisionId: input.phase.approvedRevisionId } : {}),
        ...(input.phase.approvedRevisionNumber !== undefined
            ? { approvedRevisionNumber: input.phase.approvedRevisionNumber }
            : {}),
        summaryMarkdown: input.phase.summaryMarkdown,
        items: input.phase.items,
        createdAt: input.phase.createdAt,
        updatedAt: input.phase.updatedAt,
        ...(input.phase.approvedAt ? { approvedAt: input.phase.approvedAt } : {}),
        ...(input.phase.implementedAt ? { implementedAt: input.phase.implementedAt } : {}),
        ...(input.phase.implementationRunId ? { implementationRunId: input.phase.implementationRunId } : {}),
        ...(input.phase.orchestratorRunId ? { orchestratorRunId: input.phase.orchestratorRunId } : {}),
        revisions: input.revisions.map((revision) =>
            toPlanPhaseRevisionView({
                revision,
                items: itemsByRevisionId.get(revision.id) ?? [],
            })
        ),
    };
}

function resolveNextExpandablePhaseOutlineId(input: {
    plan: PlanViewProjection['plan'];
    phaseViews: PlanPhaseRecordView[];
}): string | undefined {
    const roadmapPhases = input.plan.advancedSnapshot?.phases ?? [];
    if (roadmapPhases.length === 0) {
        return undefined;
    }

    const phaseByOutlineId = new Map(input.phaseViews.map((phase) => [phase.phaseOutlineId, phase]));
    for (const roadmapPhase of roadmapPhases) {
        const phase = phaseByOutlineId.get(roadmapPhase.id);
        if (!phase) {
            return roadmapPhase.id;
        }

        if (phase.status === 'cancelled' || phase.status === 'draft' || phase.status === 'approved' || phase.status === 'implementing') {
            return undefined;
        }
    }

    return undefined;
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
    const phaseRevisionsByPhaseId = new Map<string, PlanPhaseRevisionRecord[]>();
    for (const revision of projection.phaseRevisions) {
        const revisions = phaseRevisionsByPhaseId.get(revision.planPhaseId) ?? [];
        revisions.push(revision);
        phaseRevisionsByPhaseId.set(revision.planPhaseId, revisions);
    }
    const phaseItemRevisionIds = new Set(projection.phaseRevisions.map((revision) => revision.id));
    const phaseRevisionItems = projection.phaseRevisionItems.filter((item) => phaseItemRevisionIds.has(item.planPhaseRevisionId));
    const phaseViews = projection.phases
        .slice()
        .sort((left, right) => left.phaseSequence - right.phaseSequence)
        .map((phase) =>
            toPlanPhaseView({
                phase,
                revisions: phaseRevisionsByPhaseId.get(phase.id) ?? [],
                revisionItems: phaseRevisionItems.filter((item) =>
                    (phaseRevisionsByPhaseId.get(phase.id) ?? []).some((revision) => revision.id === item.planPhaseRevisionId)
                ),
                advancedSnapshot: plan.advancedSnapshot,
            })
        );
    const hasOpenPhaseDraft = phaseViews.some(
        (phase) => phase.status === 'draft' || phase.status === 'approved' || phase.status === 'implementing'
    );
    const nextExpandablePhaseOutlineId = !hasOpenPhaseDraft
        ? resolveNextExpandablePhaseOutlineId({
              plan,
              phaseViews,
          })
        : undefined;

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
        phases: phaseViews,
        ...(nextExpandablePhaseOutlineId ? { nextExpandablePhaseOutlineId } : {}),
        hasOpenPhaseDraft,
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
