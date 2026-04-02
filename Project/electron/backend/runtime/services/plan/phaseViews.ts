import type {
    PlanPhaseRecord,
    PlanPhaseRevisionItemRecord,
    PlanPhaseRevisionRecord,
} from '@/app/backend/persistence/types';
import type {
    PlanAdvancedSnapshotView,
    PlanPhaseRecordView,
    PlanPhaseRevisionItemView,
    PlanPhaseRevisionView,
} from '@/app/backend/runtime/contracts';
import { DataCorruptionError } from '@/app/backend/runtime/services/common/fatalErrors';

function toPhaseRevisionItemView(record: PlanPhaseRevisionItemRecord): PlanPhaseRevisionItemView {
    return {
        id: record.id,
        sequence: record.sequence,
        description: record.description,
        status: 'pending',
        createdAt: record.createdAt,
    };
}

function buildRevisionItemsByRevisionId(
    phaseRevisionItems: PlanPhaseRevisionItemRecord[]
): Map<string, PlanPhaseRevisionItemRecord[]> {
    const itemsByRevisionId = new Map<string, PlanPhaseRevisionItemRecord[]>();
    for (const item of phaseRevisionItems) {
        const items = itemsByRevisionId.get(item.planPhaseRevisionId) ?? [];
        items.push(item);
        itemsByRevisionId.set(item.planPhaseRevisionId, items);
    }

    for (const items of itemsByRevisionId.values()) {
        items.sort((left, right) => left.sequence - right.sequence);
    }

    return itemsByRevisionId;
}

function buildRevisionsByPhaseId(
    phaseRevisions: PlanPhaseRevisionRecord[]
): Map<string, PlanPhaseRevisionRecord[]> {
    const revisionsByPhaseId = new Map<string, PlanPhaseRevisionRecord[]>();
    for (const revision of phaseRevisions) {
        const revisions = revisionsByPhaseId.get(revision.planPhaseId) ?? [];
        revisions.push(revision);
        revisionsByPhaseId.set(revision.planPhaseId, revisions);
    }

    for (const revisions of revisionsByPhaseId.values()) {
        revisions.sort((left, right) => left.revisionNumber - right.revisionNumber);
    }

    return revisionsByPhaseId;
}

function resolveOutlineForPhase(
    advancedSnapshot: PlanAdvancedSnapshotView | undefined,
    phase: PlanPhaseRecord
): PlanAdvancedSnapshotView['phases'][number] | undefined {
    return advancedSnapshot?.phases.find((outline) => outline.id === phase.phaseOutlineId);
}

function computeNextExpandablePhaseOutlineId(input: {
    advancedSnapshot: PlanAdvancedSnapshotView | undefined;
    phases: PlanPhaseRecord[];
}): string | undefined {
    const outlines = input.advancedSnapshot?.phases.slice().sort((left, right) => left.sequence - right.sequence) ?? [];
    if (outlines.length === 0) {
        return undefined;
    }

    if (input.phases.some((phase) => phase.status === 'cancelled')) {
        return undefined;
    }
    if (input.phases.some((phase) => phase.status === 'draft' || phase.status === 'approved' || phase.status === 'implementing')) {
        return undefined;
    }

    const phaseBySequence = new Map(input.phases.map((phase) => [phase.phaseSequence, phase] as const));
    for (const outline of outlines) {
        const phase = phaseBySequence.get(outline.sequence);
        if (!phase) {
            const allPriorImplemented = outlines
                .filter((priorOutline) => priorOutline.sequence < outline.sequence)
                .every((priorOutline) => phaseBySequence.get(priorOutline.sequence)?.status === 'implemented');
            return allPriorImplemented ? outline.id : undefined;
        }

        if (phase.status !== 'implemented') {
            return undefined;
        }
    }

    return undefined;
}

function toPhaseRevisionView(
    revision: PlanPhaseRevisionRecord,
    revisionItemsByRevisionId: Map<string, PlanPhaseRevisionItemRecord[]>
): PlanPhaseRevisionView {
    const items = revisionItemsByRevisionId.get(revision.id) ?? revision.items ?? [];
    return {
        id: revision.id,
        planPhaseId: revision.planPhaseId,
        revisionNumber: revision.revisionNumber,
        summaryMarkdown: revision.summaryMarkdown,
        items: items.map(toPhaseRevisionItemView),
        createdByKind: revision.createdByKind,
        createdAt: revision.createdAt,
        ...(revision.previousRevisionId ? { previousRevisionId: revision.previousRevisionId } : {}),
        ...(revision.supersededAt ? { supersededAt: revision.supersededAt } : {}),
    };
}

export function buildPlanPhaseViews(input: {
    phases: PlanPhaseRecord[];
    phaseRevisions: PlanPhaseRevisionRecord[];
    phaseRevisionItems: PlanPhaseRevisionItemRecord[];
    advancedSnapshot: PlanAdvancedSnapshotView | undefined;
}): {
    phases: PlanPhaseRecordView[];
    nextExpandablePhaseOutlineId?: string;
    hasOpenPhaseDraft: boolean;
} {
    const revisionsByPhaseId = buildRevisionsByPhaseId(input.phaseRevisions);
    const revisionItemsByRevisionId = buildRevisionItemsByRevisionId(input.phaseRevisionItems);

    const phases = input.phases.map((phase) => {
        const phaseRevisions = revisionsByPhaseId.get(phase.id) ?? [];
        const currentRevision = phaseRevisions.find((revision) => revision.id === phase.currentRevisionId);
        if (!currentRevision) {
            throw new DataCorruptionError(`Missing current phase revision "${phase.currentRevisionId}" for phase "${phase.id}".`);
        }

        const outline = resolveOutlineForPhase(input.advancedSnapshot, phase);

        return {
            id: phase.id,
            planId: phase.planId,
            planRevisionId: phase.planRevisionId,
            variantId: phase.variantId,
            phaseOutlineId: phase.phaseOutlineId,
            phaseSequence: phase.phaseSequence,
            title: phase.title,
            goalMarkdown: outline?.goalMarkdown ?? phase.goalMarkdown,
            exitCriteriaMarkdown: outline?.exitCriteriaMarkdown ?? phase.exitCriteriaMarkdown,
            status: phase.status,
            currentRevisionId: phase.currentRevisionId,
            currentRevisionNumber: phase.currentRevisionNumber,
            ...(phase.approvedRevisionId ? { approvedRevisionId: phase.approvedRevisionId } : {}),
            ...(phase.approvedRevisionNumber !== undefined ? { approvedRevisionNumber: phase.approvedRevisionNumber } : {}),
            summaryMarkdown: currentRevision.summaryMarkdown,
            items: (currentRevision.items ?? []).map(toPhaseRevisionItemView),
            createdAt: phase.createdAt,
            updatedAt: phase.updatedAt,
            ...(phase.approvedAt ? { approvedAt: phase.approvedAt } : {}),
            ...(phase.implementedAt ? { implementedAt: phase.implementedAt } : {}),
            ...(phase.implementationRunId ? { implementationRunId: phase.implementationRunId } : {}),
            ...(phase.orchestratorRunId ? { orchestratorRunId: phase.orchestratorRunId } : {}),
            ...(phaseRevisions.length > 0
                ? {
                      revisions: phaseRevisions.map((revision) => toPhaseRevisionView(revision, revisionItemsByRevisionId)),
                  }
                : {}),
        } satisfies PlanPhaseRecordView;
    });

    const nextExpandablePhaseOutlineId = computeNextExpandablePhaseOutlineId({
        advancedSnapshot: input.advancedSnapshot,
        phases: input.phases,
    });

    return {
        phases,
        ...(nextExpandablePhaseOutlineId ? { nextExpandablePhaseOutlineId } : {}),
        hasOpenPhaseDraft: input.phases.some((phase) => phase.status === 'draft' || phase.status === 'approved' || phase.status === 'implementing'),
    };
}
