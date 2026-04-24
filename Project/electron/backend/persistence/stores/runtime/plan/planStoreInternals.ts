import type { DatabaseSchema } from '@/app/backend/persistence/schema';
import { parseEntityId, parseEnumValue, parseJsonRecord } from '@/app/backend/persistence/stores/shared/rowParsers';
import { isJsonUnknownArray, parseJsonValue } from '@/app/backend/persistence/stores/shared/utils';
import type {
    PlanItemRecord,
    PlanFollowUpRecord,
    PlanPhaseRecord,
    PlanPhaseRevisionItemRecord,
    PlanPhaseRevisionRecord,
    PlanPhaseVerificationDiscrepancyRecord,
    PlanPhaseVerificationRecord,
    PlanEvidenceAttachmentRecord,
    PlanResearchBatchRecord,
    PlanResearchWorkerRecord,
    PlanRevisionAdvancedSnapshotRecord,
    PlanQuestionRecord,
    PlanRecord,
    PlanRevisionItemRecord,
    PlanRevisionRecord,
    PlanVariantRecord,
    PlanViewProjection,
    RuntimeEventRecordV1,
} from '@/app/backend/persistence/types';
import { planItemStatuses } from '@/app/backend/runtime/contracts';
import type { EntityId, PlanAdvancedSnapshotView } from '@/app/backend/runtime/contracts';

import type { Kysely, Transaction } from 'kysely';

export type PlanStoreDb = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;

export function isPlanQuestionRecord(value: unknown): value is PlanQuestionRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    const record: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value)) {
        record[key] = entryValue;
    }
    const id = record['id'];
    const question = record['question'];
    const category = record['category'];
    const required = record['required'];
    const placeholderText = record['placeholderText'];
    const helpText = record['helpText'];
    return (
        typeof id === 'string' &&
        typeof question === 'string' &&
        (category === 'goal' ||
            category === 'deliverable' ||
            category === 'constraints' ||
            category === 'environment' ||
            category === 'validation' ||
            category === 'missing_context') &&
        typeof required === 'boolean' &&
        (placeholderText === undefined || typeof placeholderText === 'string') &&
        (helpText === undefined || typeof helpText === 'string')
    );
}

export type PlanRecordRow = {
    id: string;
    profile_id: string;
    session_id: string;
    top_level_tab: string;
    mode_key: string;
    planning_depth: string;
    status: string;
    source_prompt: string;
    summary_markdown: string;
    questions_json: string;
    answers_json: string;
    current_revision_id: string;
    current_variant_id: string;
    approved_revision_id: string | null;
    approved_variant_id: string | null;
    workspace_fingerprint: string | null;
    implementation_run_id: string | null;
    orchestrator_run_id: string | null;
    approved_at: string | null;
    implemented_at: string | null;
    created_at: string;
    updated_at: string;
};

export type PlanRevisionRow = {
    id: string;
    plan_id: string;
    variant_id: string;
    revision_number: number;
    summary_markdown: string;
    created_by_kind: string;
    created_at: string;
    previous_revision_id: string | null;
    superseded_at: string | null;
};

export type PlanRevisionAdvancedSnapshotRow = {
    plan_revision_id: string;
    evidence_markdown: string;
    observations_markdown: string;
    root_cause_markdown: string;
    phases_json: string;
    created_at: string;
};

export type PlanResearchBatchRow = {
    id: string;
    plan_id: string;
    plan_revision_id: string;
    variant_id: string;
    prompt_markdown: string;
    requested_worker_count: number;
    recommended_worker_count: number;
    hard_max_worker_count: number;
    status: string;
    created_at: string;
    completed_at: string | null;
    aborted_at: string | null;
};

export type PlanResearchWorkerRow = {
    id: string;
    batch_id: string;
    sequence: number;
    label: string;
    prompt_markdown: string;
    status: string;
    child_thread_id: string | null;
    child_session_id: string | null;
    active_run_id: string | null;
    run_id: string | null;
    result_summary_markdown: string | null;
    result_details_markdown: string | null;
    error_message: string | null;
    created_at: string;
    completed_at: string | null;
    aborted_at: string | null;
};

export type PlanEvidenceAttachmentRow = {
    id: string;
    plan_revision_id: string;
    source_kind: string;
    research_batch_id: string;
    research_worker_id: string;
    label: string;
    summary_markdown: string;
    details_markdown: string;
    child_thread_id: string | null;
    child_session_id: string | null;
    created_at: string;
};

export type PlanVariantRow = {
    id: string;
    plan_id: string;
    name: string;
    created_from_revision_id: string | null;
    created_at: string;
    archived_at: string | null;
};

export type PlanFollowUpRow = {
    id: string;
    plan_id: string;
    variant_id: string;
    source_revision_id: string | null;
    kind: string;
    status: string;
    prompt_markdown: string;
    response_markdown: string | null;
    created_by_kind: string;
    created_at: string;
    resolved_at: string | null;
    dismissed_at: string | null;
};

export type PlanRecoveryBannerProjection = {
    tone: 'info' | 'warning' | 'destructive';
    title: string;
    message: string;
    actions: Array<{
        kind: 'resume_editing' | 'resolve_follow_up' | 'switch_to_approved_variant';
        label: string;
        revisionId?: EntityId<'prev'>;
        variantId?: EntityId<'pvar'>;
        followUpId?: EntityId<'pfu'>;
    }>;
};

export function parsePlanAnswers(row: { answers_json: string }): Record<string, string> {
    const rawAnswers = parseJsonRecord(row.answers_json);
    const answers: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawAnswers)) {
        if (typeof value === 'string') {
            answers[key] = value;
        }
    }
    return answers;
}

export function parsePlanQuestions(row: { questions_json: string }): PlanQuestionRecord[] {
    const rawQuestions = parseJsonValue(row.questions_json, [], isJsonUnknownArray);
    return rawQuestions.filter(isPlanQuestionRecord);
}

export function mapPlanRevisionRecord(row: PlanRevisionRow): PlanRevisionRecord {
    return {
        id: parseEntityId(row.id, 'plan_revisions.id', 'prev'),
        planId: parseEntityId(row.plan_id, 'plan_revisions.plan_id', 'plan'),
        variantId: parseEntityId(row.variant_id, 'plan_revisions.variant_id', 'pvar'),
        revisionNumber: row.revision_number,
        summaryMarkdown: row.summary_markdown,
        createdByKind: row.created_by_kind === 'start' ? 'start' : 'revise',
        createdAt: row.created_at,
        ...(row.previous_revision_id
            ? {
                  previousRevisionId: parseEntityId(
                      row.previous_revision_id,
                      'plan_revisions.previous_revision_id',
                      'prev'
                  ),
              }
            : {}),
        ...(row.superseded_at ? { supersededAt: row.superseded_at } : {}),
    };
}

export function mapPlanRevisionItemRecord(row: {
    id: string;
    plan_revision_id: string;
    sequence: number;
    description: string;
    created_at: string;
}): PlanRevisionItemRecord {
    return {
        id: parseEntityId(row.id, 'plan_revision_items.id', 'step'),
        planRevisionId: parseEntityId(row.plan_revision_id, 'plan_revision_items.plan_revision_id', 'prev'),
        sequence: row.sequence,
        description: row.description,
        createdAt: row.created_at,
    };
}

export function mapPlanItemRecord(row: {
    id: string;
    plan_id: string;
    sequence: number;
    description: string;
    status: string;
    run_id: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
}): PlanItemRecord {
    return {
        id: parseEntityId(row.id, 'plan_items.id', 'step'),
        planId: parseEntityId(row.plan_id, 'plan_items.plan_id', 'plan'),
        sequence: row.sequence,
        description: row.description,
        status: parseEnumValue(row.status, 'plan_items.status', planItemStatuses),
        ...(row.run_id ? { runId: parseEntityId(row.run_id, 'plan_items.run_id', 'run') } : {}),
        ...(row.error_message ? { errorMessage: row.error_message } : {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export function mapPlanVariantRecord(row: PlanVariantRow): PlanVariantRecord {
    return {
        id: parseEntityId(row.id, 'plan_variants.id', 'pvar'),
        planId: parseEntityId(row.plan_id, 'plan_variants.plan_id', 'plan'),
        name: row.name,
        ...(row.created_from_revision_id
            ? {
                  createdFromRevisionId: parseEntityId(
                      row.created_from_revision_id,
                      'plan_variants.created_from_revision_id',
                      'prev'
                  ),
              }
            : {}),
        createdAt: row.created_at,
        ...(row.archived_at ? { archivedAt: row.archived_at } : {}),
    };
}

export function mapPlanFollowUpRecord(row: PlanFollowUpRow): PlanFollowUpRecord {
    return {
        id: parseEntityId(row.id, 'plan_follow_ups.id', 'pfu'),
        planId: parseEntityId(row.plan_id, 'plan_follow_ups.plan_id', 'plan'),
        variantId: parseEntityId(row.variant_id, 'plan_follow_ups.variant_id', 'pvar'),
        ...(row.source_revision_id
            ? {
                  sourceRevisionId: parseEntityId(row.source_revision_id, 'plan_follow_ups.source_revision_id', 'prev'),
              }
            : {}),
        kind: row.kind === 'missing_file' ? 'missing_file' : 'missing_context',
        status: row.status === 'resolved' ? 'resolved' : row.status === 'dismissed' ? 'dismissed' : 'open',
        promptMarkdown: row.prompt_markdown,
        ...(row.response_markdown ? { responseMarkdown: row.response_markdown } : {}),
        createdByKind: row.created_by_kind === 'system' ? 'system' : 'user',
        createdAt: row.created_at,
        ...(row.resolved_at ? { resolvedAt: row.resolved_at } : {}),
        ...(row.dismissed_at ? { dismissedAt: row.dismissed_at } : {}),
    };
}

export function mapPlanResearchBatchRecord(row: PlanResearchBatchRow): PlanResearchBatchRecord {
    return {
        id: parseEntityId(row.id, 'plan_research_batches.id', 'prb'),
        planId: parseEntityId(row.plan_id, 'plan_research_batches.plan_id', 'plan'),
        planRevisionId: parseEntityId(row.plan_revision_id, 'plan_research_batches.plan_revision_id', 'prev'),
        variantId: parseEntityId(row.variant_id, 'plan_research_batches.variant_id', 'pvar'),
        promptMarkdown: row.prompt_markdown,
        requestedWorkerCount: row.requested_worker_count,
        recommendedWorkerCount: row.recommended_worker_count,
        hardMaxWorkerCount: row.hard_max_worker_count,
        status:
            row.status === 'completed'
                ? 'completed'
                : row.status === 'failed'
                  ? 'failed'
                  : row.status === 'aborted'
                    ? 'aborted'
                    : 'running',
        createdAt: row.created_at,
        ...(row.completed_at ? { completedAt: row.completed_at } : {}),
        ...(row.aborted_at ? { abortedAt: row.aborted_at } : {}),
    };
}

export function mapPlanResearchWorkerRecord(row: PlanResearchWorkerRow): PlanResearchWorkerRecord {
    return {
        id: parseEntityId(row.id, 'plan_research_workers.id', 'prw'),
        batchId: parseEntityId(row.batch_id, 'plan_research_workers.batch_id', 'prb'),
        sequence: row.sequence,
        label: row.label,
        promptMarkdown: row.prompt_markdown,
        status:
            row.status === 'running'
                ? 'running'
                : row.status === 'completed'
                  ? 'completed'
                  : row.status === 'failed'
                    ? 'failed'
                    : row.status === 'aborted'
                      ? 'aborted'
                      : 'queued',
        ...(row.child_thread_id
            ? { childThreadId: parseEntityId(row.child_thread_id, 'plan_research_workers.child_thread_id', 'thr') }
            : {}),
        ...(row.child_session_id
            ? { childSessionId: parseEntityId(row.child_session_id, 'plan_research_workers.child_session_id', 'sess') }
            : {}),
        ...(row.active_run_id
            ? { activeRunId: parseEntityId(row.active_run_id, 'plan_research_workers.active_run_id', 'run') }
            : {}),
        ...(row.run_id ? { runId: parseEntityId(row.run_id, 'plan_research_workers.run_id', 'run') } : {}),
        ...(row.result_summary_markdown ? { resultSummaryMarkdown: row.result_summary_markdown } : {}),
        ...(row.result_details_markdown ? { resultDetailsMarkdown: row.result_details_markdown } : {}),
        ...(row.error_message ? { errorMessage: row.error_message } : {}),
        createdAt: row.created_at,
        ...(row.completed_at ? { completedAt: row.completed_at } : {}),
        ...(row.aborted_at ? { abortedAt: row.aborted_at } : {}),
    };
}

export function mapPlanEvidenceAttachmentRecord(row: PlanEvidenceAttachmentRow): PlanEvidenceAttachmentRecord {
    return {
        id: parseEntityId(row.id, 'plan_revision_evidence_attachments.id', 'pea'),
        planRevisionId: parseEntityId(
            row.plan_revision_id,
            'plan_revision_evidence_attachments.plan_revision_id',
            'prev'
        ),
        sourceKind: row.source_kind === 'planner_worker' ? 'planner_worker' : 'planner_worker',
        researchBatchId: parseEntityId(
            row.research_batch_id,
            'plan_revision_evidence_attachments.research_batch_id',
            'prb'
        ),
        researchWorkerId: parseEntityId(
            row.research_worker_id,
            'plan_revision_evidence_attachments.research_worker_id',
            'prw'
        ),
        label: row.label,
        summaryMarkdown: row.summary_markdown,
        detailsMarkdown: row.details_markdown,
        ...(row.child_thread_id
            ? {
                  childThreadId: parseEntityId(
                      row.child_thread_id,
                      'plan_revision_evidence_attachments.child_thread_id',
                      'thr'
                  ),
              }
            : {}),
        ...(row.child_session_id
            ? {
                  childSessionId: parseEntityId(
                      row.child_session_id,
                      'plan_revision_evidence_attachments.child_session_id',
                      'sess'
                  ),
              }
            : {}),
        createdAt: row.created_at,
    };
}

export function isPlanPhaseOutlineRecord(value: unknown): value is PlanAdvancedSnapshotView['phases'][number] {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    const record = value as Record<string, unknown>;
    return (
        typeof record['id'] === 'string' &&
        typeof record['sequence'] === 'number' &&
        Number.isInteger(record['sequence']) &&
        record['sequence'] > 0 &&
        typeof record['title'] === 'string' &&
        typeof record['goalMarkdown'] === 'string' &&
        typeof record['exitCriteriaMarkdown'] === 'string'
    );
}

export function mapPlanAdvancedSnapshotRecord(
    row: PlanRevisionAdvancedSnapshotRow
): PlanRevisionAdvancedSnapshotRecord {
    let parsedPhases: unknown;
    try {
        parsedPhases = JSON.parse(row.phases_json);
    } catch {
        throw new Error(`Invalid plan revision advanced snapshot phases JSON for revision ${row.plan_revision_id}.`);
    }

    if (!isJsonUnknownArray(parsedPhases)) {
        throw new Error(
            `Invalid plan revision advanced snapshot phases JSON for revision ${row.plan_revision_id}: expected array.`
        );
    }

    const phases = parsedPhases;
    const normalizedPhases = phases.map((phase, index) => {
        if (!isPlanPhaseOutlineRecord(phase)) {
            throw new Error(
                `Invalid plan revision advanced snapshot phase at index ${String(index)} for revision ${row.plan_revision_id}.`
            );
        }

        return {
            id: phase.id,
            sequence: phase.sequence,
            title: phase.title,
            goalMarkdown: phase.goalMarkdown,
            exitCriteriaMarkdown: phase.exitCriteriaMarkdown,
        };
    });

    return {
        planRevisionId: parseEntityId(
            row.plan_revision_id,
            'plan_revision_advanced_snapshots.plan_revision_id',
            'prev'
        ),
        evidenceMarkdown: row.evidence_markdown,
        observationsMarkdown: row.observations_markdown,
        rootCauseMarkdown: row.root_cause_markdown,
        phases: normalizedPhases,
        createdAt: row.created_at,
    };
}

export function toPlanAdvancedSnapshotView(
    snapshot: PlanRevisionAdvancedSnapshotRecord | null
): PlanAdvancedSnapshotView | undefined {
    if (!snapshot) {
        return undefined;
    }

    return {
        evidenceMarkdown: snapshot.evidenceMarkdown,
        observationsMarkdown: snapshot.observationsMarkdown,
        rootCauseMarkdown: snapshot.rootCauseMarkdown,
        phases: snapshot.phases,
        createdAt: snapshot.createdAt,
    };
}

export function isOpenFollowUp(followUp: PlanFollowUpRecord): boolean {
    return followUp.status === 'open';
}

export function dedupeById<T extends { id: string }>(entries: T[]): T[] {
    const seen = new Set<string>();
    return entries.filter((entry) => {
        if (seen.has(entry.id)) {
            return false;
        }
        seen.add(entry.id);
        return true;
    });
}

export function sortHistoryEntries(entries: PlanHistoryEntry[]): PlanHistoryEntry[] {
    const sortedEntries = entries.slice();
    sortedEntries.sort((left, right) => {
        if (left.createdAt === right.createdAt) {
            return right.id.localeCompare(left.id);
        }
        return right.createdAt.localeCompare(left.createdAt);
    });
    return sortedEntries;
}

export type PlanHistoryEntry = PlanViewProjection['history'][number];

export function buildPlanHistoryEntries(input: {
    plan: PlanRecord;
    variants: PlanVariantRecord[];
    followUps: PlanFollowUpRecord[];
    events: RuntimeEventRecordV1[];
}): PlanHistoryEntry[] {
    const variantById = new Map(input.variants.map((variant) => [variant.id, variant]));
    const entries: PlanHistoryEntry[] = [];

    function resolveVariantName(variantId?: EntityId<'pvar'>): string | undefined {
        return variantId ? variantById.get(variantId)?.name : undefined;
    }

    function buildHistoryEntry(
        base: Pick<PlanHistoryEntry, 'id' | 'kind' | 'title' | 'detail' | 'createdAt'>,
        optionals?: {
            revisionId?: EntityId<'prev'>;
            revisionNumber?: number;
            variantId?: EntityId<'pvar'>;
            variantName?: string;
            followUpId?: EntityId<'pfu'>;
            followUpKind?: 'missing_context' | 'missing_file';
            actions?: PlanHistoryEntry['actions'];
        }
    ): PlanHistoryEntry {
        return {
            ...base,
            ...(optionals?.revisionId ? { revisionId: optionals.revisionId } : {}),
            ...(optionals?.revisionNumber !== undefined ? { revisionNumber: optionals.revisionNumber } : {}),
            ...(optionals?.variantId ? { variantId: optionals.variantId } : {}),
            ...(optionals?.variantName ? { variantName: optionals.variantName } : {}),
            ...(optionals?.followUpId ? { followUpId: optionals.followUpId } : {}),
            ...(optionals?.followUpKind ? { followUpKind: optionals.followUpKind } : {}),
            ...(optionals?.actions ? { actions: optionals.actions } : {}),
        };
    }

    for (const event of input.events) {
        switch (event.eventType) {
            case 'plan.started':
                entries.push(
                    buildHistoryEntry(
                        {
                            id: event.eventId,
                            kind: 'plan_started',
                            title: 'Plan started',
                            detail:
                                typeof event.payload['revisionNumber'] === 'number'
                                    ? `Started with revision ${String(event.payload['revisionNumber'])}.`
                                    : 'Started a new plan.',
                            createdAt: event.createdAt,
                        },
                        {
                            ...(typeof event.payload['revisionId'] === 'string'
                                ? { revisionId: event.payload['revisionId'] as EntityId<'prev'> }
                                : {}),
                            ...(typeof event.payload['revisionNumber'] === 'number'
                                ? { revisionNumber: event.payload['revisionNumber'] }
                                : {}),
                            variantId:
                                typeof event.payload['variantId'] === 'string'
                                    ? (event.payload['variantId'] as EntityId<'pvar'>)
                                    : input.plan.currentVariantId,
                            variantName:
                                typeof event.payload['variantName'] === 'string'
                                    ? event.payload['variantName']
                                    : (resolveVariantName(
                                          typeof event.payload['variantId'] === 'string'
                                              ? (event.payload['variantId'] as EntityId<'pvar'>)
                                              : input.plan.currentVariantId
                                      ) ?? 'current'),
                        }
                    )
                );
                break;
            case 'plan.revised':
                entries.push(
                    buildHistoryEntry(
                        {
                            id: event.eventId,
                            kind: 'revision_created',
                            title:
                                typeof event.payload['revisionNumber'] === 'number'
                                    ? `Revision ${String(event.payload['revisionNumber'])} created`
                                    : 'Revision created',
                            detail: 'Saved a new draft revision.',
                            createdAt: event.createdAt,
                        },
                        {
                            ...(typeof event.payload['revisionId'] === 'string'
                                ? { revisionId: event.payload['revisionId'] as EntityId<'prev'> }
                                : {}),
                            ...(typeof event.payload['revisionNumber'] === 'number'
                                ? { revisionNumber: event.payload['revisionNumber'] }
                                : {}),
                            variantId:
                                typeof event.payload['variantId'] === 'string'
                                    ? (event.payload['variantId'] as EntityId<'pvar'>)
                                    : input.plan.currentVariantId,
                            variantName:
                                typeof event.payload['variantName'] === 'string'
                                    ? event.payload['variantName']
                                    : (resolveVariantName(
                                          typeof event.payload['variantId'] === 'string'
                                              ? (event.payload['variantId'] as EntityId<'pvar'>)
                                              : input.plan.currentVariantId
                                      ) ?? 'current'),
                            ...(typeof event.payload['revisionId'] === 'string'
                                ? {
                                      actions: [
                                          {
                                              kind: 'resume_from_here',
                                              label: 'Resume From Here',
                                              revisionId: event.payload['revisionId'] as EntityId<'prev'>,
                                          },
                                          {
                                              kind: 'branch_from_here',
                                              label: 'Branch From Here',
                                              revisionId: event.payload['revisionId'] as EntityId<'prev'>,
                                          },
                                      ],
                                  }
                                : {}),
                        }
                    )
                );
                break;
            case 'plan.approved':
                entries.push({
                    id: event.eventId,
                    kind: 'revision_approved',
                    title:
                        typeof event.payload['revisionNumber'] === 'number'
                            ? `Revision ${String(event.payload['revisionNumber'])} approved`
                            : 'Revision approved',
                    detail: 'Approved for implementation.',
                    createdAt: event.createdAt,
                    revisionId:
                        typeof event.payload['revisionId'] === 'string'
                            ? (event.payload['revisionId'] as EntityId<'prev'>)
                            : input.plan.approvedRevisionId,
                    revisionNumber:
                        typeof event.payload['revisionNumber'] === 'number'
                            ? event.payload['revisionNumber']
                            : undefined,
                    variantId:
                        typeof event.payload['variantId'] === 'string'
                            ? (event.payload['variantId'] as EntityId<'pvar'>)
                            : input.plan.approvedVariantId,
                    variantName:
                        typeof event.payload['variantName'] === 'string'
                            ? event.payload['variantName']
                            : resolveVariantName(
                                  typeof event.payload['variantId'] === 'string'
                                      ? (event.payload['variantId'] as EntityId<'pvar'>)
                                      : (input.plan.approvedVariantId ?? undefined)
                              ),
                });
                break;
            case 'plan.cancelled':
                entries.push({
                    id: event.eventId,
                    kind: 'plan_cancelled',
                    title: 'Plan cancelled',
                    detail:
                        typeof event.payload['previousStatus'] === 'string'
                            ? `Cancelled from ${event.payload['previousStatus']}.`
                            : 'Cancelled the plan.',
                    createdAt: event.createdAt,
                    revisionId:
                        typeof event.payload['revisionId'] === 'string'
                            ? (event.payload['revisionId'] as EntityId<'prev'>)
                            : input.plan.currentRevisionId,
                    revisionNumber:
                        typeof event.payload['revisionNumber'] === 'number'
                            ? event.payload['revisionNumber']
                            : undefined,
                    variantId:
                        typeof event.payload['variantId'] === 'string'
                            ? (event.payload['variantId'] as EntityId<'pvar'>)
                            : input.plan.currentVariantId,
                    variantName:
                        resolveVariantName(
                            typeof event.payload['variantId'] === 'string'
                                ? (event.payload['variantId'] as EntityId<'pvar'>)
                                : input.plan.currentVariantId
                        ) ?? 'current',
                });
                break;
            case 'plan.variant_created':
                entries.push({
                    id: event.eventId,
                    kind: 'variant_created',
                    title: 'Variant created',
                    detail:
                        typeof event.payload['sourceRevisionNumber'] === 'number'
                            ? `Forked from revision ${String(event.payload['sourceRevisionNumber'])}.`
                            : 'Forked a new branch variant.',
                    createdAt: event.createdAt,
                    revisionId:
                        typeof event.payload['revisionId'] === 'string'
                            ? (event.payload['revisionId'] as EntityId<'prev'>)
                            : undefined,
                    revisionNumber:
                        typeof event.payload['revisionNumber'] === 'number'
                            ? event.payload['revisionNumber']
                            : undefined,
                    variantId:
                        typeof event.payload['variantId'] === 'string'
                            ? (event.payload['variantId'] as EntityId<'pvar'>)
                            : undefined,
                    variantName:
                        typeof event.payload['variantName'] === 'string'
                            ? event.payload['variantName']
                            : resolveVariantName(
                                  typeof event.payload['variantId'] === 'string'
                                      ? (event.payload['variantId'] as EntityId<'pvar'>)
                                      : undefined
                              ),
                    actions:
                        typeof event.payload['revisionId'] === 'string'
                            ? [
                                  {
                                      kind: 'branch_from_here',
                                      label: 'Branch From Here',
                                      revisionId: event.payload['revisionId'] as EntityId<'prev'>,
                                  },
                              ]
                            : undefined,
                });
                break;
            case 'plan.variant_activated':
                entries.push({
                    id: event.eventId,
                    kind: 'variant_activated',
                    title: 'Variant activated',
                    detail: 'Switched the active draft to this branch.',
                    createdAt: event.createdAt,
                    revisionId:
                        typeof event.payload['revisionId'] === 'string'
                            ? (event.payload['revisionId'] as EntityId<'prev'>)
                            : undefined,
                    revisionNumber:
                        typeof event.payload['revisionNumber'] === 'number'
                            ? event.payload['revisionNumber']
                            : undefined,
                    variantId:
                        typeof event.payload['variantId'] === 'string'
                            ? (event.payload['variantId'] as EntityId<'pvar'>)
                            : undefined,
                    variantName:
                        typeof event.payload['variantName'] === 'string'
                            ? event.payload['variantName']
                            : resolveVariantName(
                                  typeof event.payload['variantId'] === 'string'
                                      ? (event.payload['variantId'] as EntityId<'pvar'>)
                                      : undefined
                              ),
                    actions:
                        typeof event.payload['revisionId'] === 'string'
                            ? [
                                  {
                                      kind: 'resume_from_here',
                                      label: 'Resume From Here',
                                      revisionId: event.payload['revisionId'] as EntityId<'prev'>,
                                  },
                              ]
                            : undefined,
                });
                break;
            case 'plan.resumed':
                entries.push({
                    id: event.eventId,
                    kind: 'plan_resumed',
                    title: 'Plan resumed',
                    detail: 'Created a new head revision from historical context.',
                    createdAt: event.createdAt,
                    revisionId:
                        typeof event.payload['revisionId'] === 'string'
                            ? (event.payload['revisionId'] as EntityId<'prev'>)
                            : undefined,
                    revisionNumber:
                        typeof event.payload['revisionNumber'] === 'number'
                            ? event.payload['revisionNumber']
                            : undefined,
                    variantId:
                        typeof event.payload['variantId'] === 'string'
                            ? (event.payload['variantId'] as EntityId<'pvar'>)
                            : undefined,
                    variantName:
                        typeof event.payload['variantName'] === 'string' ? event.payload['variantName'] : undefined,
                    actions:
                        typeof event.payload['revisionId'] === 'string'
                            ? [
                                  {
                                      kind: 'resume_from_here',
                                      label: 'Resume From Here',
                                      revisionId: event.payload['revisionId'] as EntityId<'prev'>,
                                  },
                              ]
                            : undefined,
                });
                break;
            case 'plan.follow_up_raised':
                entries.push({
                    id: event.eventId,
                    kind: 'follow_up_raised',
                    title: 'Follow-up raised',
                    detail:
                        typeof event.payload['kind'] === 'string'
                            ? `Open ${event.payload['kind'].replace('_', ' ')} follow-up.`
                            : 'Open follow-up created.',
                    createdAt: event.createdAt,
                    followUpId:
                        typeof event.payload['followUpId'] === 'string'
                            ? (event.payload['followUpId'] as EntityId<'pfu'>)
                            : undefined,
                    followUpKind: event.payload['kind'] === 'missing_file' ? 'missing_file' : 'missing_context',
                    variantId:
                        typeof event.payload['variantId'] === 'string'
                            ? (event.payload['variantId'] as EntityId<'pvar'>)
                            : undefined,
                    variantName:
                        typeof event.payload['variantName'] === 'string' ? event.payload['variantName'] : undefined,
                    actions:
                        typeof event.payload['followUpId'] === 'string'
                            ? [
                                  {
                                      kind: 'view_follow_up',
                                      label: 'View Follow-Up',
                                      followUpId: event.payload['followUpId'] as EntityId<'pfu'>,
                                  },
                              ]
                            : undefined,
                });
                break;
            case 'plan.follow_up_resolved':
                entries.push({
                    id: event.eventId,
                    kind: 'follow_up_resolved',
                    title: event.payload['status'] === 'dismissed' ? 'Follow-up dismissed' : 'Follow-up resolved',
                    detail:
                        typeof event.payload['responseMarkdown'] === 'string'
                            ? event.payload['responseMarkdown']
                            : 'Follow-up state updated.',
                    createdAt: event.createdAt,
                    followUpId:
                        typeof event.payload['followUpId'] === 'string'
                            ? (event.payload['followUpId'] as EntityId<'pfu'>)
                            : undefined,
                    followUpKind: event.payload['kind'] === 'missing_file' ? 'missing_file' : 'missing_context',
                    variantId:
                        typeof event.payload['variantId'] === 'string'
                            ? (event.payload['variantId'] as EntityId<'pvar'>)
                            : undefined,
                    variantName:
                        typeof event.payload['variantName'] === 'string' ? event.payload['variantName'] : undefined,
                    actions:
                        typeof event.payload['followUpId'] === 'string'
                            ? [
                                  {
                                      kind: 'view_follow_up',
                                      label: 'View Follow-Up',
                                      followUpId: event.payload['followUpId'] as EntityId<'pfu'>,
                                  },
                              ]
                            : undefined,
                });
                break;
            case 'plan.phase.expanded':
                entries.push({
                    id: event.eventId,
                    kind: 'phase_expanded',
                    title:
                        typeof event.payload['phaseTitle'] === 'string'
                            ? `Phase expanded: ${event.payload['phaseTitle']}`
                            : typeof event.payload['title'] === 'string'
                              ? `Phase expanded: ${event.payload['title']}`
                              : 'Phase expanded',
                    detail:
                        typeof event.payload['phaseSequence'] === 'number'
                            ? `Opened detailed work for roadmap phase ${String(event.payload['phaseSequence'])}.`
                            : 'Opened a detailed phase lane.',
                    createdAt: event.createdAt,
                    phaseId:
                        typeof event.payload['phaseId'] === 'string'
                            ? (event.payload['phaseId'] as EntityId<'pph'>)
                            : undefined,
                    phaseRevisionId:
                        typeof event.payload['phaseRevisionId'] === 'string'
                            ? (event.payload['phaseRevisionId'] as EntityId<'pprv'>)
                            : undefined,
                    phaseSequence:
                        typeof event.payload['phaseSequence'] === 'number' ? event.payload['phaseSequence'] : undefined,
                    phaseTitle:
                        typeof event.payload['phaseTitle'] === 'string'
                            ? event.payload['phaseTitle']
                            : typeof event.payload['title'] === 'string'
                              ? event.payload['title']
                              : undefined,
                    revisionId:
                        typeof event.payload['phaseRevisionId'] === 'string'
                            ? (event.payload['phaseRevisionId'] as EntityId<'prev'>)
                            : undefined,
                    revisionNumber:
                        typeof event.payload['revisionNumber'] === 'number'
                            ? event.payload['revisionNumber']
                            : undefined,
                    variantId:
                        typeof event.payload['variantId'] === 'string'
                            ? (event.payload['variantId'] as EntityId<'pvar'>)
                            : undefined,
                    variantName:
                        typeof event.payload['variantId'] === 'string'
                            ? resolveVariantName(event.payload['variantId'] as EntityId<'pvar'>)
                            : undefined,
                });
                break;
            case 'plan.phase.revised':
                entries.push({
                    id: event.eventId,
                    kind: 'phase_revision_created',
                    title:
                        typeof event.payload['phaseTitle'] === 'string'
                            ? `Phase revised: ${event.payload['phaseTitle']}`
                            : typeof event.payload['title'] === 'string'
                              ? `Phase revised: ${event.payload['title']}`
                              : 'Phase revised',
                    detail:
                        typeof event.payload['revisionNumber'] === 'number'
                            ? `Saved phase revision ${String(event.payload['revisionNumber'])}.`
                            : typeof event.payload['phaseRevisionNumber'] === 'number'
                              ? `Saved phase revision ${String(event.payload['phaseRevisionNumber'])}.`
                              : 'Saved a new phase revision.',
                    createdAt: event.createdAt,
                    phaseId:
                        typeof event.payload['phaseId'] === 'string'
                            ? (event.payload['phaseId'] as EntityId<'pph'>)
                            : undefined,
                    phaseRevisionId:
                        typeof event.payload['phaseRevisionId'] === 'string'
                            ? (event.payload['phaseRevisionId'] as EntityId<'pprv'>)
                            : undefined,
                    revisionNumber:
                        typeof event.payload['revisionNumber'] === 'number'
                            ? event.payload['revisionNumber']
                            : typeof event.payload['phaseRevisionNumber'] === 'number'
                              ? event.payload['phaseRevisionNumber']
                              : undefined,
                    phaseSequence:
                        typeof event.payload['phaseSequence'] === 'number' ? event.payload['phaseSequence'] : undefined,
                    phaseTitle:
                        typeof event.payload['phaseTitle'] === 'string'
                            ? event.payload['phaseTitle']
                            : typeof event.payload['title'] === 'string'
                              ? event.payload['title']
                              : undefined,
                    variantId:
                        typeof event.payload['variantId'] === 'string'
                            ? (event.payload['variantId'] as EntityId<'pvar'>)
                            : undefined,
                    variantName:
                        typeof event.payload['variantId'] === 'string'
                            ? resolveVariantName(event.payload['variantId'] as EntityId<'pvar'>)
                            : undefined,
                });
                break;
            case 'plan.phase.approved':
                entries.push({
                    id: event.eventId,
                    kind: 'phase_approved',
                    title:
                        typeof event.payload['phaseTitle'] === 'string'
                            ? `Phase approved: ${event.payload['phaseTitle']}`
                            : typeof event.payload['title'] === 'string'
                              ? `Phase approved: ${event.payload['title']}`
                              : 'Phase approved',
                    detail: 'Approved the current detailed phase for execution.',
                    createdAt: event.createdAt,
                    phaseId:
                        typeof event.payload['phaseId'] === 'string'
                            ? (event.payload['phaseId'] as EntityId<'pph'>)
                            : undefined,
                    phaseRevisionId:
                        typeof event.payload['phaseRevisionId'] === 'string'
                            ? (event.payload['phaseRevisionId'] as EntityId<'pprv'>)
                            : undefined,
                    revisionNumber:
                        typeof event.payload['revisionNumber'] === 'number'
                            ? event.payload['revisionNumber']
                            : typeof event.payload['phaseRevisionNumber'] === 'number'
                              ? event.payload['phaseRevisionNumber']
                              : undefined,
                    phaseSequence:
                        typeof event.payload['phaseSequence'] === 'number' ? event.payload['phaseSequence'] : undefined,
                    phaseTitle:
                        typeof event.payload['phaseTitle'] === 'string'
                            ? event.payload['phaseTitle']
                            : typeof event.payload['title'] === 'string'
                              ? event.payload['title']
                              : undefined,
                    variantId:
                        typeof event.payload['variantId'] === 'string'
                            ? (event.payload['variantId'] as EntityId<'pvar'>)
                            : undefined,
                    variantName:
                        typeof event.payload['variantId'] === 'string'
                            ? resolveVariantName(event.payload['variantId'] as EntityId<'pvar'>)
                            : undefined,
                });
                break;
            case 'plan.phase.implementation.started':
                entries.push({
                    id: event.eventId,
                    kind: 'phase_implementation_started',
                    title:
                        typeof event.payload['phaseTitle'] === 'string'
                            ? `Phase implementation started: ${event.payload['phaseTitle']}`
                            : typeof event.payload['title'] === 'string'
                              ? `Phase implementation started: ${event.payload['title']}`
                              : 'Phase implementation started',
                    detail:
                        typeof event.payload['mode'] === 'string'
                            ? `Started via ${event.payload['mode']}.`
                            : 'Started phase execution.',
                    createdAt: event.createdAt,
                    phaseId:
                        typeof event.payload['phaseId'] === 'string'
                            ? (event.payload['phaseId'] as EntityId<'pph'>)
                            : undefined,
                    phaseRevisionId:
                        typeof event.payload['phaseRevisionId'] === 'string'
                            ? (event.payload['phaseRevisionId'] as EntityId<'pprv'>)
                            : undefined,
                    revisionNumber:
                        typeof event.payload['revisionNumber'] === 'number'
                            ? event.payload['revisionNumber']
                            : typeof event.payload['phaseRevisionNumber'] === 'number'
                              ? event.payload['phaseRevisionNumber']
                              : undefined,
                    phaseSequence:
                        typeof event.payload['phaseSequence'] === 'number' ? event.payload['phaseSequence'] : undefined,
                    phaseTitle:
                        typeof event.payload['phaseTitle'] === 'string'
                            ? event.payload['phaseTitle']
                            : typeof event.payload['title'] === 'string'
                              ? event.payload['title']
                              : undefined,
                });
                break;
            case 'plan.phase.implementation.completed':
                entries.push({
                    id: event.eventId,
                    kind: 'phase_implementation_completed',
                    title:
                        typeof event.payload['phaseTitle'] === 'string'
                            ? `Phase implementation completed: ${event.payload['phaseTitle']}`
                            : typeof event.payload['title'] === 'string'
                              ? `Phase implementation completed: ${event.payload['title']}`
                              : 'Phase implementation completed',
                    detail: 'The detailed phase completed successfully.',
                    createdAt: event.createdAt,
                    phaseId:
                        typeof event.payload['phaseId'] === 'string'
                            ? (event.payload['phaseId'] as EntityId<'pph'>)
                            : undefined,
                    phaseRevisionId:
                        typeof event.payload['phaseRevisionId'] === 'string'
                            ? (event.payload['phaseRevisionId'] as EntityId<'pprv'>)
                            : undefined,
                    revisionNumber:
                        typeof event.payload['revisionNumber'] === 'number'
                            ? event.payload['revisionNumber']
                            : typeof event.payload['phaseRevisionNumber'] === 'number'
                              ? event.payload['phaseRevisionNumber']
                              : undefined,
                    phaseSequence:
                        typeof event.payload['phaseSequence'] === 'number' ? event.payload['phaseSequence'] : undefined,
                    phaseTitle:
                        typeof event.payload['phaseTitle'] === 'string'
                            ? event.payload['phaseTitle']
                            : typeof event.payload['title'] === 'string'
                              ? event.payload['title']
                              : undefined,
                });
                break;
            case 'plan.phase.implementation.failed':
                entries.push({
                    id: event.eventId,
                    kind: 'phase_implementation_failed',
                    title:
                        typeof event.payload['phaseTitle'] === 'string'
                            ? `Phase implementation failed: ${event.payload['phaseTitle']}`
                            : typeof event.payload['title'] === 'string'
                              ? `Phase implementation failed: ${event.payload['title']}`
                              : 'Phase implementation failed',
                    detail:
                        typeof event.payload['errorMessage'] === 'string'
                            ? event.payload['errorMessage']
                            : typeof event.payload['failureKind'] === 'string'
                              ? `Execution stopped with ${event.payload['failureKind']}.`
                              : 'Execution stopped before completion.',
                    createdAt: event.createdAt,
                    phaseId:
                        typeof event.payload['phaseId'] === 'string'
                            ? (event.payload['phaseId'] as EntityId<'pph'>)
                            : undefined,
                    phaseRevisionId:
                        typeof event.payload['phaseRevisionId'] === 'string'
                            ? (event.payload['phaseRevisionId'] as EntityId<'pprv'>)
                            : undefined,
                    revisionNumber:
                        typeof event.payload['revisionNumber'] === 'number'
                            ? event.payload['revisionNumber']
                            : typeof event.payload['phaseRevisionNumber'] === 'number'
                              ? event.payload['phaseRevisionNumber']
                              : undefined,
                    phaseSequence:
                        typeof event.payload['phaseSequence'] === 'number' ? event.payload['phaseSequence'] : undefined,
                    phaseTitle:
                        typeof event.payload['phaseTitle'] === 'string'
                            ? event.payload['phaseTitle']
                            : typeof event.payload['title'] === 'string'
                              ? event.payload['title']
                              : undefined,
                });
                break;
            case 'plan.phase.cancelled':
                entries.push({
                    id: event.eventId,
                    kind: 'phase_cancelled',
                    title:
                        typeof event.payload['phaseTitle'] === 'string'
                            ? `Phase cancelled: ${event.payload['phaseTitle']}`
                            : typeof event.payload['title'] === 'string'
                              ? `Phase cancelled: ${event.payload['title']}`
                              : 'Phase cancelled',
                    detail:
                        typeof event.payload['previousStatus'] === 'string'
                            ? `Cancelled from ${event.payload['previousStatus']}.`
                            : 'Cancelled the detailed phase lane.',
                    createdAt: event.createdAt,
                    phaseId:
                        typeof event.payload['phaseId'] === 'string'
                            ? (event.payload['phaseId'] as EntityId<'pph'>)
                            : undefined,
                    phaseRevisionId:
                        typeof event.payload['phaseRevisionId'] === 'string'
                            ? (event.payload['phaseRevisionId'] as EntityId<'pprv'>)
                            : undefined,
                    revisionNumber:
                        typeof event.payload['revisionNumber'] === 'number'
                            ? event.payload['revisionNumber']
                            : typeof event.payload['phaseRevisionNumber'] === 'number'
                              ? event.payload['phaseRevisionNumber']
                              : undefined,
                    phaseSequence:
                        typeof event.payload['phaseSequence'] === 'number' ? event.payload['phaseSequence'] : undefined,
                    phaseTitle:
                        typeof event.payload['phaseTitle'] === 'string'
                            ? event.payload['phaseTitle']
                            : typeof event.payload['title'] === 'string'
                              ? event.payload['title']
                              : undefined,
                });
                break;
            case 'plan.phase.verification.recorded':
                entries.push({
                    id: event.eventId,
                    kind: 'phase_verification_recorded',
                    title:
                        typeof event.payload['phaseTitle'] === 'string'
                            ? `Phase verified: ${event.payload['phaseTitle']}`
                            : 'Phase verified',
                    detail:
                        event.payload['outcome'] === 'failed'
                            ? typeof event.payload['discrepancyCount'] === 'number'
                                ? `Verification failed with ${String(event.payload['discrepancyCount'])} discrepancies.`
                                : 'Verification failed.'
                            : 'Verification passed.',
                    createdAt: event.createdAt,
                    phaseId:
                        typeof event.payload['phaseId'] === 'string'
                            ? (event.payload['phaseId'] as EntityId<'pph'>)
                            : undefined,
                    phaseRevisionId:
                        typeof event.payload['phaseRevisionId'] === 'string'
                            ? (event.payload['phaseRevisionId'] as EntityId<'pprv'>)
                            : undefined,
                    phaseSequence:
                        typeof event.payload['phaseSequence'] === 'number' ? event.payload['phaseSequence'] : undefined,
                    phaseTitle:
                        typeof event.payload['phaseTitle'] === 'string' ? event.payload['phaseTitle'] : undefined,
                    phaseRevisionNumber:
                        typeof event.payload['phaseRevisionNumber'] === 'number'
                            ? event.payload['phaseRevisionNumber']
                            : undefined,
                    verificationId:
                        typeof event.payload['verificationId'] === 'string'
                            ? (event.payload['verificationId'] as EntityId<'ppv'>)
                            : undefined,
                    verificationOutcome:
                        event.payload['outcome'] === 'failed'
                            ? 'failed'
                            : event.payload['outcome'] === 'passed'
                              ? 'passed'
                              : undefined,
                    discrepancyCount:
                        typeof event.payload['discrepancyCount'] === 'number'
                            ? event.payload['discrepancyCount']
                            : undefined,
                });
                break;
            case 'plan.phase.replan.started':
                entries.push({
                    id: event.eventId,
                    kind: 'phase_replan_started',
                    title:
                        typeof event.payload['phaseTitle'] === 'string'
                            ? `Phase replan started: ${event.payload['phaseTitle']}`
                            : 'Phase replan started',
                    detail: 'Opened a new draft from the failed verification without rewriting implemented history.',
                    createdAt: event.createdAt,
                    phaseId:
                        typeof event.payload['phaseId'] === 'string'
                            ? (event.payload['phaseId'] as EntityId<'pph'>)
                            : undefined,
                    phaseRevisionId:
                        typeof event.payload['phaseRevisionId'] === 'string'
                            ? (event.payload['phaseRevisionId'] as EntityId<'pprv'>)
                            : undefined,
                    phaseSequence:
                        typeof event.payload['phaseSequence'] === 'number' ? event.payload['phaseSequence'] : undefined,
                    phaseTitle:
                        typeof event.payload['phaseTitle'] === 'string' ? event.payload['phaseTitle'] : undefined,
                    phaseRevisionNumber:
                        typeof event.payload['phaseRevisionNumber'] === 'number'
                            ? event.payload['phaseRevisionNumber']
                            : undefined,
                    sourceVerificationId:
                        typeof event.payload['sourceVerificationId'] === 'string'
                            ? (event.payload['sourceVerificationId'] as EntityId<'ppv'>)
                            : undefined,
                });
                break;
            default:
                break;
        }
    }

    if (input.plan.status === 'implemented' || input.plan.status === 'failed') {
        entries.push({
            id: `${input.plan.id}:${input.plan.status}`,
            kind: input.plan.status === 'implemented' ? 'implementation_completed' : 'implementation_failed',
            title: input.plan.status === 'implemented' ? 'Implementation completed' : 'Implementation failed',
            detail:
                input.plan.status === 'implemented'
                    ? 'The approved plan completed implementation.'
                    : 'The approved plan failed during implementation.',
            createdAt: input.plan.implementedAt ?? input.plan.updatedAt,
            revisionId: input.plan.approvedRevisionId ?? input.plan.currentRevisionId,
            revisionNumber: input.plan.approvedRevisionNumber ?? input.plan.currentRevisionNumber,
            variantId: input.plan.approvedVariantId ?? input.plan.currentVariantId,
            variantName:
                (input.plan.approvedVariantId ? resolveVariantName(input.plan.approvedVariantId) : undefined) ??
                resolveVariantName(input.plan.currentVariantId) ??
                'current',
        });
    }

    return sortHistoryEntries(dedupeById(entries));
}

export function buildRecoveryBanner(input: {
    plan: PlanRecord;
    followUps: PlanFollowUpRecord[];
    variants: PlanVariantRecord[];
}): PlanRecoveryBannerProjection | undefined {
    const currentVariant = input.variants.find((variant) => variant.id === input.plan.currentVariantId);
    const approvedVariant = input.plan.approvedVariantId
        ? input.variants.find((variant) => variant.id === input.plan.approvedVariantId)
        : undefined;
    const openFollowUps = input.followUps.filter(isOpenFollowUp);

    if (openFollowUps.length > 0) {
        return {
            tone: 'warning',
            title: 'Open follow-ups need attention',
            message: 'Resolve or dismiss the open follow-up items before approving the current draft.',
            actions: openFollowUps.slice(0, 2).map((followUp) => ({
                kind: 'resolve_follow_up' as const,
                label: 'Resolve Follow-Up',
                followUpId: followUp.id,
            })),
        };
    }

    if (input.plan.status === 'failed') {
        return {
            tone: 'destructive',
            title: 'Plan implementation failed',
            message: 'Resume editing or branch from a prior revision to recover.',
            actions: [
                {
                    kind: 'resume_editing' as const,
                    label: 'Resume Editing',
                    revisionId: input.plan.currentRevisionId,
                },
                ...(input.plan.approvedVariantId
                    ? [
                          {
                              kind: 'switch_to_approved_variant' as const,
                              label: 'Switch To Approved Variant',
                              variantId: input.plan.approvedVariantId,
                          },
                      ]
                    : []),
            ],
        };
    }

    if (input.plan.status === 'cancelled') {
        return {
            tone: 'info',
            title: 'Plan is cancelled',
            message: 'You can resume editing or switch back to the last approved variant if needed.',
            actions: [
                {
                    kind: 'resume_editing' as const,
                    label: 'Resume Editing',
                    revisionId: input.plan.currentRevisionId,
                },
                ...(input.plan.approvedVariantId
                    ? [
                          {
                              kind: 'switch_to_approved_variant' as const,
                              label: 'Switch To Approved Variant',
                              variantId: input.plan.approvedVariantId,
                          },
                      ]
                    : []),
            ],
        };
    }

    if (input.plan.approvedVariantId && input.plan.currentVariantId !== input.plan.approvedVariantId) {
        return {
            tone: 'warning',
            title: 'Current draft differs from the approved variant',
            message: `You are editing ${currentVariant?.name ?? 'a branch'} while ${approvedVariant?.name ?? 'the approved variant'} remains the last approved path.`,
            actions: [
                {
                    kind: 'switch_to_approved_variant' as const,
                    label: 'Switch To Approved Variant',
                    variantId: input.plan.approvedVariantId,
                },
            ],
        };
    }

    return undefined;
}

export function buildPlanViewProjection(input: {
    plan: PlanRecord;
    items: PlanItemRecord[];
    revisions: PlanRevisionRecord[];
    variants: PlanVariantRecord[];
    followUps: PlanFollowUpRecord[];
    phases: PlanPhaseRecord[];
    phaseRevisions: PlanPhaseRevisionRecord[];
    phaseRevisionItems: PlanPhaseRevisionItemRecord[];
    phaseVerifications: PlanPhaseVerificationRecord[];
    phaseVerificationDiscrepancies: PlanPhaseVerificationDiscrepancyRecord[];
    researchBatches: PlanResearchBatchRecord[];
    researchWorkers: PlanResearchWorkerRecord[];
    evidenceAttachments: PlanEvidenceAttachmentRecord[];
    history: PlanHistoryEntry[];
    recoveryBanner?: PlanRecoveryBannerProjection;
}): PlanViewProjection {
    const latestRevisionByVariant = new Map<EntityId<'pvar'>, PlanRevisionRecord>();
    for (const revision of input.revisions) {
        const existing = latestRevisionByVariant.get(revision.variantId);
        if (!existing || existing.revisionNumber < revision.revisionNumber) {
            latestRevisionByVariant.set(revision.variantId, revision);
        }
    }

    const projection: PlanViewProjection = {
        plan: input.plan,
        items: input.items,
        variants: input.variants.map((variant) => {
            const headRevision = latestRevisionByVariant.get(variant.id);
            const isCurrent = variant.id === input.plan.currentVariantId;
            const isApproved = variant.id === input.plan.approvedVariantId;
            return {
                id: variant.id,
                name: variant.name,
                ...(variant.createdFromRevisionId ? { createdFromRevisionId: variant.createdFromRevisionId } : {}),
                currentRevisionId: headRevision?.id ?? input.plan.currentRevisionId,
                currentRevisionNumber: headRevision?.revisionNumber ?? input.plan.currentRevisionNumber,
                isCurrent,
                isApproved,
                createdAt: variant.createdAt,
                ...(variant.archivedAt ? { archivedAt: variant.archivedAt } : {}),
            };
        }),
        followUps: input.followUps.map((followUp) => ({
            id: followUp.id,
            planId: followUp.planId,
            variantId: followUp.variantId,
            ...(followUp.sourceRevisionId ? { sourceRevisionId: followUp.sourceRevisionId } : {}),
            kind: followUp.kind,
            status: followUp.status,
            promptMarkdown: followUp.promptMarkdown,
            ...(followUp.responseMarkdown ? { responseMarkdown: followUp.responseMarkdown } : {}),
            createdByKind: followUp.createdByKind,
            createdAt: followUp.createdAt,
            ...(followUp.resolvedAt ? { resolvedAt: followUp.resolvedAt } : {}),
            ...(followUp.dismissedAt ? { dismissedAt: followUp.dismissedAt } : {}),
        })),
        phases: input.phases,
        phaseRevisions: input.phaseRevisions,
        phaseRevisionItems: input.phaseRevisionItems,
        phaseVerifications: input.phaseVerifications,
        phaseVerificationDiscrepancies: input.phaseVerificationDiscrepancies,
        researchBatches: input.researchBatches,
        researchWorkers: input.researchWorkers,
        evidenceAttachments: input.evidenceAttachments,
        history: input.history,
    };

    if (input.recoveryBanner) {
        projection.recoveryBanner = input.recoveryBanner;
    }

    return projection;
}

export const cancellablePlanStatuses = new Set<PlanRecord['status']>([
    'awaiting_answers',
    'draft',
    'approved',
    'failed',
]);
