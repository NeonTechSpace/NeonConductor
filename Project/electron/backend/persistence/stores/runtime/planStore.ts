import { getPersistence } from '@/app/backend/persistence/db';
import type { DatabaseSchema } from '@/app/backend/persistence/schema';
import { planPhaseStore } from '@/app/backend/persistence/stores/runtime/planPhaseStore';
import { runtimeEventStore } from '@/app/backend/persistence/stores/runtime/runtimeEventStore';
import { parseEntityId, parseEnumValue, parseJsonRecord } from '@/app/backend/persistence/stores/shared/rowParsers';
import {
    isJsonRecord,
    isJsonUnknownArray,
    nowIso,
    parseJsonValue,
} from '@/app/backend/persistence/stores/shared/utils';
import type {
    PlanItemRecord,
    PlanFollowUpRecord,
    PlanPhaseRecord,
    PlanPhaseRevisionItemRecord,
    PlanPhaseRevisionRecord,
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
import {
    planItemStatuses,
    planStatuses,
    topLevelTabs,
} from '@/app/backend/runtime/contracts';
import type {
    EntityId,
    PlanAdvancedSnapshotInput,
    PlanAdvancedSnapshotView,
    PlanPlanningDepth,
    TopLevelTab,
} from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';
import { hasUnansweredRequiredQuestions } from '@/app/backend/runtime/services/plan/intake';

import type { Kysely, Transaction } from 'kysely';

type PlanStoreDb = Kysely<DatabaseSchema> | Transaction<DatabaseSchema>;

function isPlanQuestionRecord(value: unknown): value is PlanQuestionRecord {
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

type PlanRecordRow = {
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

type PlanRevisionRow = {
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

type PlanRevisionAdvancedSnapshotRow = {
    plan_revision_id: string;
    evidence_markdown: string;
    observations_markdown: string;
    root_cause_markdown: string;
    phases_json: string;
    created_at: string;
};

type PlanResearchBatchRow = {
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

type PlanResearchWorkerRow = {
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

type PlanEvidenceAttachmentRow = {
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

type PlanVariantRow = {
    id: string;
    plan_id: string;
    name: string;
    created_from_revision_id: string | null;
    created_at: string;
    archived_at: string | null;
};

type PlanFollowUpRow = {
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

type PlanRecoveryBannerProjection = {
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

function parsePlanAnswers(row: { answers_json: string }): Record<string, string> {
    const rawAnswers = parseJsonRecord(row.answers_json);
    const answers: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawAnswers)) {
        if (typeof value === 'string') {
            answers[key] = value;
        }
    }
    return answers;
}

function parsePlanQuestions(row: { questions_json: string }): PlanQuestionRecord[] {
    const rawQuestions = parseJsonValue(row.questions_json, [], isJsonUnknownArray);
    return rawQuestions.filter(isPlanQuestionRecord);
}

function mapPlanRevisionRecord(row: PlanRevisionRow): PlanRevisionRecord {
    return {
        id: parseEntityId(row.id, 'plan_revisions.id', 'prev'),
        planId: parseEntityId(row.plan_id, 'plan_revisions.plan_id', 'plan'),
        variantId: parseEntityId(row.variant_id, 'plan_revisions.variant_id', 'pvar'),
        revisionNumber: row.revision_number,
        summaryMarkdown: row.summary_markdown,
        createdByKind: row.created_by_kind === 'start' ? 'start' : 'revise',
        createdAt: row.created_at,
        ...(row.previous_revision_id
            ? { previousRevisionId: parseEntityId(row.previous_revision_id, 'plan_revisions.previous_revision_id', 'prev') }
            : {}),
        ...(row.superseded_at ? { supersededAt: row.superseded_at } : {}),
    };
}

function mapPlanRevisionItemRecord(row: {
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

function mapPlanItemRecord(row: {
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

function mapPlanVariantRecord(row: PlanVariantRow): PlanVariantRecord {
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

function mapPlanFollowUpRecord(row: PlanFollowUpRow): PlanFollowUpRecord {
    return {
        id: parseEntityId(row.id, 'plan_follow_ups.id', 'pfu'),
        planId: parseEntityId(row.plan_id, 'plan_follow_ups.plan_id', 'plan'),
        variantId: parseEntityId(row.variant_id, 'plan_follow_ups.variant_id', 'pvar'),
        ...(row.source_revision_id
            ? {
                  sourceRevisionId: parseEntityId(
                      row.source_revision_id,
                      'plan_follow_ups.source_revision_id',
                      'prev'
                  ),
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

function mapPlanResearchBatchRecord(row: PlanResearchBatchRow): PlanResearchBatchRecord {
    return {
        id: parseEntityId(row.id, 'plan_research_batches.id', 'prb'),
        planId: parseEntityId(row.plan_id, 'plan_research_batches.plan_id', 'plan'),
        planRevisionId: parseEntityId(row.plan_revision_id, 'plan_research_batches.plan_revision_id', 'prev'),
        variantId: parseEntityId(row.variant_id, 'plan_research_batches.variant_id', 'pvar'),
        promptMarkdown: row.prompt_markdown,
        requestedWorkerCount: row.requested_worker_count,
        recommendedWorkerCount: row.recommended_worker_count,
        hardMaxWorkerCount: row.hard_max_worker_count,
        status: row.status === 'completed' ? 'completed' : row.status === 'failed' ? 'failed' : row.status === 'aborted' ? 'aborted' : 'running',
        createdAt: row.created_at,
        ...(row.completed_at ? { completedAt: row.completed_at } : {}),
        ...(row.aborted_at ? { abortedAt: row.aborted_at } : {}),
    };
}

function mapPlanResearchWorkerRecord(row: PlanResearchWorkerRow): PlanResearchWorkerRecord {
    return {
        id: parseEntityId(row.id, 'plan_research_workers.id', 'prw'),
        batchId: parseEntityId(row.batch_id, 'plan_research_workers.batch_id', 'prb'),
        sequence: row.sequence,
        label: row.label,
        promptMarkdown: row.prompt_markdown,
        status: row.status === 'running'
            ? 'running'
            : row.status === 'completed'
              ? 'completed'
              : row.status === 'failed'
                ? 'failed'
                : row.status === 'aborted'
                  ? 'aborted'
                  : 'queued',
        ...(row.child_thread_id ? { childThreadId: parseEntityId(row.child_thread_id, 'plan_research_workers.child_thread_id', 'thr') } : {}),
        ...(row.child_session_id ? { childSessionId: parseEntityId(row.child_session_id, 'plan_research_workers.child_session_id', 'sess') } : {}),
        ...(row.active_run_id ? { activeRunId: parseEntityId(row.active_run_id, 'plan_research_workers.active_run_id', 'run') } : {}),
        ...(row.run_id ? { runId: parseEntityId(row.run_id, 'plan_research_workers.run_id', 'run') } : {}),
        ...(row.result_summary_markdown ? { resultSummaryMarkdown: row.result_summary_markdown } : {}),
        ...(row.result_details_markdown ? { resultDetailsMarkdown: row.result_details_markdown } : {}),
        ...(row.error_message ? { errorMessage: row.error_message } : {}),
        createdAt: row.created_at,
        ...(row.completed_at ? { completedAt: row.completed_at } : {}),
        ...(row.aborted_at ? { abortedAt: row.aborted_at } : {}),
    };
}

function mapPlanEvidenceAttachmentRecord(row: PlanEvidenceAttachmentRow): PlanEvidenceAttachmentRecord {
    return {
        id: parseEntityId(row.id, 'plan_revision_evidence_attachments.id', 'pea'),
        planRevisionId: parseEntityId(row.plan_revision_id, 'plan_revision_evidence_attachments.plan_revision_id', 'prev'),
        sourceKind: row.source_kind === 'planner_worker' ? 'planner_worker' : 'planner_worker',
        researchBatchId: parseEntityId(row.research_batch_id, 'plan_revision_evidence_attachments.research_batch_id', 'prb'),
        researchWorkerId: parseEntityId(row.research_worker_id, 'plan_revision_evidence_attachments.research_worker_id', 'prw'),
        label: row.label,
        summaryMarkdown: row.summary_markdown,
        detailsMarkdown: row.details_markdown,
        ...(row.child_thread_id ? { childThreadId: parseEntityId(row.child_thread_id, 'plan_revision_evidence_attachments.child_thread_id', 'thr') } : {}),
        ...(row.child_session_id ? { childSessionId: parseEntityId(row.child_session_id, 'plan_revision_evidence_attachments.child_session_id', 'sess') } : {}),
        createdAt: row.created_at,
    };
}

function isPlanPhaseOutlineRecord(
    value: unknown
): value is PlanAdvancedSnapshotView['phases'][number] {
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

function mapPlanAdvancedSnapshotRecord(row: PlanRevisionAdvancedSnapshotRow): PlanRevisionAdvancedSnapshotRecord {
    let parsedPhases: unknown;
    try {
        parsedPhases = JSON.parse(row.phases_json);
    } catch {
        throw new Error(
            `Invalid plan revision advanced snapshot phases JSON for revision ${row.plan_revision_id}.`
        );
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
        planRevisionId: parseEntityId(row.plan_revision_id, 'plan_revision_advanced_snapshots.plan_revision_id', 'prev'),
        evidenceMarkdown: row.evidence_markdown,
        observationsMarkdown: row.observations_markdown,
        rootCauseMarkdown: row.root_cause_markdown,
        phases: normalizedPhases,
        createdAt: row.created_at,
    };
}

function toPlanAdvancedSnapshotView(snapshot: PlanRevisionAdvancedSnapshotRecord | null): PlanAdvancedSnapshotView | undefined {
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

function isOpenFollowUp(followUp: PlanFollowUpRecord): boolean {
    return followUp.status === 'open';
}

function dedupeById<T extends { id: string }>(entries: T[]): T[] {
    const seen = new Set<string>();
    return entries.filter((entry) => {
        if (seen.has(entry.id)) {
            return false;
        }
        seen.add(entry.id);
        return true;
    });
}

function sortHistoryEntries(entries: PlanHistoryEntry[]): PlanHistoryEntry[] {
    const sortedEntries = entries.slice();
    sortedEntries.sort((left, right) => {
        if (left.createdAt === right.createdAt) {
            return right.id.localeCompare(left.id);
        }
        return right.createdAt.localeCompare(left.createdAt);
    });
    return sortedEntries;
}

type PlanHistoryEntry = PlanViewProjection['history'][number];

function buildPlanHistoryEntries(input: {
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
                                    : resolveVariantName(
                                          typeof event.payload['variantId'] === 'string'
                                              ? (event.payload['variantId'] as EntityId<'pvar'>)
                                              : input.plan.currentVariantId
                                      ) ?? 'current',
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
                                    : resolveVariantName(
                                          typeof event.payload['variantId'] === 'string'
                                              ? (event.payload['variantId'] as EntityId<'pvar'>)
                                              : input.plan.currentVariantId
                                      ) ?? 'current',
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
                        typeof event.payload['revisionNumber'] === 'number' ? event.payload['revisionNumber'] : undefined,
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
                                      : input.plan.approvedVariantId ?? undefined
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
                        typeof event.payload['revisionNumber'] === 'number' ? event.payload['revisionNumber'] : undefined,
                    variantId:
                        typeof event.payload['variantId'] === 'string'
                            ? (event.payload['variantId'] as EntityId<'pvar'>)
                            : input.plan.currentVariantId,
                    variantName: resolveVariantName(
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
                        typeof event.payload['revisionNumber'] === 'number' ? event.payload['revisionNumber'] : undefined,
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
                        typeof event.payload['revisionNumber'] === 'number' ? event.payload['revisionNumber'] : undefined,
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
                        typeof event.payload['revisionNumber'] === 'number' ? event.payload['revisionNumber'] : undefined,
                    variantId:
                        typeof event.payload['variantId'] === 'string'
                            ? (event.payload['variantId'] as EntityId<'pvar'>)
                            : undefined,
                    variantName:
                        typeof event.payload['variantName'] === 'string'
                            ? event.payload['variantName']
                            : undefined,
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
                    followUpKind:
                        event.payload['kind'] === 'missing_file' ? 'missing_file' : 'missing_context',
                    variantId:
                        typeof event.payload['variantId'] === 'string'
                            ? (event.payload['variantId'] as EntityId<'pvar'>)
                            : undefined,
                    variantName:
                        typeof event.payload['variantName'] === 'string'
                            ? event.payload['variantName']
                            : undefined,
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
                    title:
                        event.payload['status'] === 'dismissed' ? 'Follow-up dismissed' : 'Follow-up resolved',
                    detail:
                        typeof event.payload['responseMarkdown'] === 'string'
                            ? event.payload['responseMarkdown']
                            : 'Follow-up state updated.',
                    createdAt: event.createdAt,
                    followUpId:
                        typeof event.payload['followUpId'] === 'string'
                            ? (event.payload['followUpId'] as EntityId<'pfu'>)
                            : undefined,
                    followUpKind:
                        event.payload['kind'] === 'missing_file' ? 'missing_file' : 'missing_context',
                    variantId:
                        typeof event.payload['variantId'] === 'string'
                            ? (event.payload['variantId'] as EntityId<'pvar'>)
                            : undefined,
                    variantName:
                        typeof event.payload['variantName'] === 'string'
                            ? event.payload['variantName']
                            : undefined,
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

function buildRecoveryBanner(input: {
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

function buildPlanViewProjection(input: {
    plan: PlanRecord;
    items: PlanItemRecord[];
    revisions: PlanRevisionRecord[];
    variants: PlanVariantRecord[];
    followUps: PlanFollowUpRecord[];
    phases: PlanPhaseRecord[];
    phaseRevisions: PlanPhaseRevisionRecord[];
    phaseRevisionItems: PlanPhaseRevisionItemRecord[];
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

const cancellablePlanStatuses = new Set<PlanRecord['status']>(['awaiting_answers', 'draft', 'approved', 'failed']);

export class PlanStore {
    private getDb(): Kysely<DatabaseSchema> {
        return getPersistence().db;
    }

    private async getPlanRecordRowById(db: PlanStoreDb, planId: EntityId<'plan'>): Promise<PlanRecordRow | null> {
        return (await db.selectFrom('plan_records').selectAll().where('id', '=', planId).executeTakeFirst()) ?? null;
    }

    private async getPlanRevisionRowById(
        db: PlanStoreDb,
        revisionId: EntityId<'prev'>
    ): Promise<PlanRevisionRow | null> {
        return (
            (await db.selectFrom('plan_revisions').selectAll().where('id', '=', revisionId).executeTakeFirst()) ?? null
        );
    }

    private async getPlanRevisionAdvancedSnapshotRowByRevisionId(
        db: PlanStoreDb,
        revisionId: EntityId<'prev'>
    ): Promise<PlanRevisionAdvancedSnapshotRow | null> {
        return (
            (await db
                .selectFrom('plan_revision_advanced_snapshots')
                .selectAll()
                .where('plan_revision_id', '=', revisionId)
                .executeTakeFirst()) ?? null
        );
    }

    private async hydratePlanRevisionRecord(
        db: PlanStoreDb,
        row: PlanRevisionRow
    ): Promise<PlanRevisionRecord> {
        const snapshotRow = await this.getPlanRevisionAdvancedSnapshotRowByRevisionId(
            db,
            parseEntityId(row.id, 'plan_revisions.id', 'prev')
        );

        return {
            ...mapPlanRevisionRecord(row),
            ...(snapshotRow ? { advancedSnapshot: mapPlanAdvancedSnapshotRecord(snapshotRow) } : {}),
        };
    }

    private async getPlanVariantRowById(
        db: PlanStoreDb,
        variantId: EntityId<'pvar'>
    ): Promise<PlanVariantRow | null> {
        return (
            (await db.selectFrom('plan_variants').selectAll().where('id', '=', variantId).executeTakeFirst()) ?? null
        );
    }

    private async getPlanFollowUpRowById(
        db: PlanStoreDb,
        followUpId: EntityId<'pfu'>
    ): Promise<PlanFollowUpRow | null> {
        return (
            (await db.selectFrom('plan_follow_ups').selectAll().where('id', '=', followUpId).executeTakeFirst()) ?? null
        );
    }

    private async getVariantHeadRevisionRow(
        db: PlanStoreDb,
        planId: EntityId<'plan'>,
        variantId: EntityId<'pvar'>
    ): Promise<PlanRevisionRow | null> {
        return (
            (await db
                .selectFrom('plan_revisions')
                .selectAll()
                .where('plan_id', '=', planId)
                .where('variant_id', '=', variantId)
                .orderBy('revision_number', 'desc')
                .executeTakeFirst()) ?? null
        );
    }

    private async getLatestRevisionRowForPlan(db: PlanStoreDb, planId: EntityId<'plan'>): Promise<PlanRevisionRow | null> {
        return (
            (await db
                .selectFrom('plan_revisions')
                .selectAll()
                .where('plan_id', '=', planId)
                .orderBy('revision_number', 'desc')
                .executeTakeFirst()) ?? null
        );
    }

    private async listRevisionItemsInDb(
        db: PlanStoreDb,
        planRevisionId: EntityId<'prev'>
    ): Promise<PlanRevisionItemRecord[]> {
        const rows = await db
            .selectFrom('plan_revision_items')
            .selectAll()
            .where('plan_revision_id', '=', planRevisionId)
            .orderBy('sequence', 'asc')
            .execute();

        return rows.map(mapPlanRevisionItemRecord);
    }

    private async getPlanResearchBatchRowById(db: PlanStoreDb, batchId: EntityId<'prb'>): Promise<PlanResearchBatchRow | null> {
        return (await db.selectFrom('plan_research_batches').selectAll().where('id', '=', batchId).executeTakeFirst()) ?? null;
    }

    private async getPlanResearchWorkerRowById(
        db: PlanStoreDb,
        workerId: EntityId<'prw'>
    ): Promise<PlanResearchWorkerRow | null> {
        return (
            (await db.selectFrom('plan_research_workers').selectAll().where('id', '=', workerId).executeTakeFirst()) ?? null
        );
    }

    private async listResearchBatchesInDb(db: PlanStoreDb, planId: EntityId<'plan'>): Promise<PlanResearchBatchRecord[]> {
        const rows = await db
            .selectFrom('plan_research_batches')
            .selectAll()
            .where('plan_id', '=', planId)
            .orderBy('created_at', 'asc')
            .execute();

        return rows.map(mapPlanResearchBatchRecord);
    }

    private async listResearchWorkersInDb(
        db: PlanStoreDb,
        batchIds: string[]
    ): Promise<PlanResearchWorkerRecord[]> {
        if (batchIds.length === 0) {
            return [];
        }

        const rows = await db
            .selectFrom('plan_research_workers')
            .selectAll()
            .where('batch_id', 'in', batchIds)
            .orderBy('sequence', 'asc')
            .execute();

        return rows.map(mapPlanResearchWorkerRecord);
    }

    private async listEvidenceAttachmentsInDb(
        db: PlanStoreDb,
        planRevisionId: EntityId<'prev'>
    ): Promise<PlanEvidenceAttachmentRecord[]> {
        const rows = await db
            .selectFrom('plan_revision_evidence_attachments')
            .selectAll()
            .where('plan_revision_id', '=', planRevisionId)
            .orderBy('created_at', 'asc')
            .execute();

        return rows.map(mapPlanEvidenceAttachmentRecord);
    }

    private async getActiveResearchBatchRowForRevision(
        db: PlanStoreDb,
        planRevisionId: EntityId<'prev'>
    ): Promise<PlanResearchBatchRow | null> {
        return (
            (await db
                .selectFrom('plan_research_batches')
                .selectAll()
                .where('plan_revision_id', '=', planRevisionId)
                .where('status', '=', 'running')
                .orderBy('created_at', 'desc')
                .executeTakeFirst()) ?? null
        );
    }

    private async hydratePlanRecord(db: PlanStoreDb, row: PlanRecordRow): Promise<PlanRecord> {
        const currentRevisionRow = await this.getPlanRevisionRowById(
            db,
            parseEntityId(row.current_revision_id, 'plan_records.current_revision_id', 'prev')
        );
        if (!currentRevisionRow) {
            throw new Error(`Missing current revision "${row.current_revision_id}" for plan ${row.id}.`);
        }
        const currentRevision = await this.hydratePlanRevisionRecord(db, currentRevisionRow);

        const approvedRevisionRow = row.approved_revision_id
            ? await this.getPlanRevisionRowById(
                  db,
                  parseEntityId(row.approved_revision_id, 'plan_records.approved_revision_id', 'prev')
              )
            : null;
        const approvedRevision = approvedRevisionRow
            ? await this.hydratePlanRevisionRecord(db, approvedRevisionRow)
            : null;
        const advancedSnapshot = currentRevision.advancedSnapshot
            ? toPlanAdvancedSnapshotView(currentRevision.advancedSnapshot)
            : undefined;

        return {
            id: parseEntityId(row.id, 'plan_records.id', 'plan'),
            profileId: row.profile_id,
            sessionId: parseEntityId(row.session_id, 'plan_records.session_id', 'sess'),
            topLevelTab: parseEnumValue(row.top_level_tab, 'plan_records.top_level_tab', topLevelTabs),
            modeKey: row.mode_key,
            planningDepth: parseEnumValue(row.planning_depth, 'plan_records.planning_depth', ['simple', 'advanced']),
            status: parseEnumValue(row.status, 'plan_records.status', planStatuses),
            sourcePrompt: row.source_prompt,
            summaryMarkdown: row.summary_markdown,
            ...(advancedSnapshot ? { advancedSnapshot } : {}),
            questions: parsePlanQuestions(row),
            answers: parsePlanAnswers(row),
            currentRevisionId: parseEntityId(row.current_revision_id, 'plan_records.current_revision_id', 'prev'),
            currentRevisionNumber: currentRevision.revisionNumber,
            currentVariantId: parseEntityId(row.current_variant_id, 'plan_records.current_variant_id', 'pvar'),
            ...(row.approved_revision_id
                ? {
                      approvedRevisionId: parseEntityId(
                          row.approved_revision_id,
                          'plan_records.approved_revision_id',
                          'prev'
                      ),
                }
                : {}),
            ...(approvedRevision ? { approvedRevisionNumber: approvedRevision.revisionNumber } : {}),
            ...(row.approved_variant_id
                ? {
                      approvedVariantId: parseEntityId(
                          row.approved_variant_id,
                          'plan_records.approved_variant_id',
                          'pvar'
                      ),
                  }
                : {}),
            ...(row.workspace_fingerprint ? { workspaceFingerprint: row.workspace_fingerprint } : {}),
            ...(row.implementation_run_id
                ? {
                      implementationRunId: parseEntityId(
                          row.implementation_run_id,
                          'plan_records.implementation_run_id',
                          'run'
                      ),
                  }
                : {}),
            ...(row.orchestrator_run_id
                ? {
                      orchestratorRunId: parseEntityId(
                          row.orchestrator_run_id,
                          'plan_records.orchestrator_run_id',
                          'orch'
                      ),
                  }
                : {}),
            ...(row.approved_at ? { approvedAt: row.approved_at } : {}),
            ...(row.implemented_at ? { implementedAt: row.implemented_at } : {}),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    private async insertRevisionInTransaction(
        db: PlanStoreDb,
        input: {
            planId: EntityId<'plan'>;
            variantId: EntityId<'pvar'>;
            revisionId: EntityId<'prev'>;
            revisionNumber: number;
            summaryMarkdown: string;
            createdByKind: PlanRevisionRecord['createdByKind'];
            previousRevisionId?: EntityId<'prev'>;
            itemDescriptions: string[];
            timestamp: string;
            advancedSnapshot?: PlanAdvancedSnapshotInput;
            copyResearchAttachmentsFromRevisionId?: EntityId<'prev'>;
        }
    ): Promise<void> {
        await db
            .insertInto('plan_revisions')
            .values({
                id: input.revisionId,
                plan_id: input.planId,
                variant_id: input.variantId,
                revision_number: input.revisionNumber,
                summary_markdown: input.summaryMarkdown,
                created_by_kind: input.createdByKind,
                created_at: input.timestamp,
                previous_revision_id: input.previousRevisionId ?? null,
                superseded_at: null,
            })
            .execute();

        if (input.advancedSnapshot) {
            await db
                .insertInto('plan_revision_advanced_snapshots')
                .values({
                    plan_revision_id: input.revisionId,
                    evidence_markdown: input.advancedSnapshot.evidenceMarkdown,
                    observations_markdown: input.advancedSnapshot.observationsMarkdown,
                    root_cause_markdown: input.advancedSnapshot.rootCauseMarkdown,
                    phases_json: JSON.stringify(input.advancedSnapshot.phases),
                    created_at: input.timestamp,
                })
                .execute();
        }

        if (input.itemDescriptions.length === 0) {
            if (input.copyResearchAttachmentsFromRevisionId) {
                await this.copyResearchAttachmentsBetweenRevisionsInTransaction(db, {
                    sourceRevisionId: input.copyResearchAttachmentsFromRevisionId,
                    targetRevisionId: input.revisionId,
                    timestamp: input.timestamp,
                });
            }
            return;
        }

        await db
            .insertInto('plan_revision_items')
            .values(
                input.itemDescriptions.map((description, index) => ({
                    id: createEntityId('step'),
                    plan_revision_id: input.revisionId,
                    sequence: index + 1,
                    description,
                    created_at: input.timestamp,
                }))
            )
            .execute();

        if (input.copyResearchAttachmentsFromRevisionId) {
            await this.copyResearchAttachmentsBetweenRevisionsInTransaction(db, {
                sourceRevisionId: input.copyResearchAttachmentsFromRevisionId,
                targetRevisionId: input.revisionId,
                timestamp: input.timestamp,
            });
        }
    }

    private async copyResearchAttachmentsBetweenRevisionsInTransaction(
        db: PlanStoreDb,
        input: {
            sourceRevisionId: EntityId<'prev'>;
            targetRevisionId: EntityId<'prev'>;
            timestamp: string;
        }
    ): Promise<void> {
        const sourceAttachments = await this.listEvidenceAttachmentsInDb(db, input.sourceRevisionId);
        if (sourceAttachments.length === 0) {
            return;
        }

        await db
            .insertInto('plan_revision_evidence_attachments')
            .values(
                sourceAttachments.map((attachment) => ({
                    id: createEntityId('pea'),
                    plan_revision_id: input.targetRevisionId,
                    source_kind: attachment.sourceKind,
                    research_batch_id: attachment.researchBatchId,
                    research_worker_id: attachment.researchWorkerId,
                    label: attachment.label,
                    summary_markdown: attachment.summaryMarkdown,
                    details_markdown: attachment.detailsMarkdown,
                    child_thread_id: attachment.childThreadId ?? null,
                    child_session_id: attachment.childSessionId ?? null,
                    created_at: input.timestamp,
                }))
            )
            .execute();
    }

    private async settleResearchBatchStatusInTransaction(
        db: PlanStoreDb,
        batchId: EntityId<'prb'>,
        timestamp: string
    ): Promise<void> {
        const rows = await db
            .selectFrom('plan_research_workers')
            .select(['status'])
            .where('batch_id', '=', batchId)
            .execute();

        if (rows.some((row) => row.status === 'queued' || row.status === 'running')) {
            return;
        }

        const statuses = rows.map((row) => row.status);
        const nextStatus = statuses.some((status) => status === 'failed')
            ? 'failed'
            : statuses.every((status) => status === 'aborted')
              ? 'aborted'
              : 'completed';

        await db
            .updateTable('plan_research_batches')
            .set(
                nextStatus === 'aborted'
                    ? {
                          status: nextStatus,
                          aborted_at: timestamp,
                      }
                    : {
                          status: nextStatus,
                          completed_at: timestamp,
                      }
            )
            .where('id', '=', batchId)
            .execute();
    }

    private async replaceLiveItemsInTransaction(
        db: PlanStoreDb,
        planId: EntityId<'plan'>,
        descriptions: string[],
        timestamp: string
    ): Promise<void> {
        await db.deleteFrom('plan_items').where('plan_id', '=', planId).execute();
        if (descriptions.length === 0) {
            return;
        }

        await db
            .insertInto('plan_items')
            .values(
                descriptions.map((description, index) => ({
                    id: createEntityId('step'),
                    plan_id: planId,
                    sequence: index + 1,
                    description,
                    status: 'pending',
                    run_id: null,
                    error_message: null,
                    created_at: timestamp,
                    updated_at: timestamp,
                }))
            )
            .execute();
    }

    async create(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        topLevelTab: TopLevelTab;
        modeKey: string;
        planningDepth?: PlanPlanningDepth;
        sourcePrompt: string;
        summaryMarkdown: string;
        questions: PlanQuestionRecord[];
        advancedSnapshot?: PlanAdvancedSnapshotInput;
        workspaceFingerprint?: string;
    }): Promise<PlanRecord> {
        const db = this.getDb();
        const now = nowIso();
        const planId = createEntityId('plan');
        const revisionId = createEntityId('prev');
        const variantId = createEntityId('pvar');

        await db.transaction().execute(async (transaction) => {
            await transaction
                .insertInto('plan_records')
                .values({
                    id: planId,
                    profile_id: input.profileId,
                    session_id: input.sessionId,
                    top_level_tab: input.topLevelTab,
                    mode_key: input.modeKey,
                    planning_depth: input.planningDepth ?? 'simple',
                    status: input.questions.length > 0 ? 'awaiting_answers' : 'draft',
                    source_prompt: input.sourcePrompt,
                    summary_markdown: input.summaryMarkdown,
                    questions_json: JSON.stringify(input.questions),
                    answers_json: JSON.stringify({}),
                    current_revision_id: revisionId,
                    current_variant_id: variantId,
                    approved_revision_id: null,
                    approved_variant_id: null,
                    workspace_fingerprint: input.workspaceFingerprint ?? null,
                    implementation_run_id: null,
                    orchestrator_run_id: null,
                    approved_at: null,
                    implemented_at: null,
                    created_at: now,
                    updated_at: now,
                })
                .execute();

            await transaction
                .insertInto('plan_variants')
                .values({
                    id: variantId,
                    plan_id: planId,
                    name: 'main',
                    created_from_revision_id: null,
                    created_at: now,
                    archived_at: null,
                })
                .execute();

            await this.insertRevisionInTransaction(transaction, {
                planId,
                variantId,
                revisionId,
                revisionNumber: 1,
                summaryMarkdown: input.summaryMarkdown,
                createdByKind: 'start',
                itemDescriptions: [],
                timestamp: now,
                ...(input.advancedSnapshot ? { advancedSnapshot: input.advancedSnapshot } : {}),
            });
        });

        const row = await this.getPlanRecordRowById(db, planId);
        if (!row) {
            throw new Error(`Expected created plan ${planId} to exist.`);
        }
        return this.hydratePlanRecord(db, row);
    }

    async getById(profileId: string, planId: EntityId<'plan'>): Promise<PlanRecord | null> {
        const db = this.getDb();
        const row = await db
            .selectFrom('plan_records')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('id', '=', planId)
            .executeTakeFirst();

        return row ? this.hydratePlanRecord(db, row) : null;
    }

    async getLatestBySession(
        profileId: string,
        sessionId: EntityId<'sess'>,
        topLevelTab: TopLevelTab
    ): Promise<PlanRecord | null> {
        const db = this.getDb();
        const row = await db
            .selectFrom('plan_records')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('session_id', '=', sessionId)
            .where('top_level_tab', '=', topLevelTab)
            .orderBy('created_at', 'desc')
            .executeTakeFirst();

        return row ? this.hydratePlanRecord(db, row) : null;
    }

    async listItems(planId: EntityId<'plan'>): Promise<PlanItemRecord[]> {
        const rows = await this.getDb()
            .selectFrom('plan_items')
            .selectAll()
            .where('plan_id', '=', planId)
            .orderBy('sequence', 'asc')
            .execute();

        return rows.map(mapPlanItemRecord);
    }

    async listVariants(planId: EntityId<'plan'>): Promise<PlanVariantRecord[]> {
        const rows = await this.getDb()
            .selectFrom('plan_variants')
            .selectAll()
            .where('plan_id', '=', planId)
            .orderBy('created_at', 'asc')
            .execute();

        return rows.map(mapPlanVariantRecord);
    }

    async listFollowUps(planId: EntityId<'plan'>): Promise<PlanFollowUpRecord[]> {
        const rows = await this.getDb()
            .selectFrom('plan_follow_ups')
            .selectAll()
            .where('plan_id', '=', planId)
            .orderBy('created_at', 'asc')
            .execute();

        return rows.map(mapPlanFollowUpRecord);
    }

    async listOpenFollowUps(planId: EntityId<'plan'>): Promise<PlanFollowUpRecord[]> {
        return (await this.listFollowUps(planId)).filter(isOpenFollowUp);
    }

    async getVariantById(planVariantId: EntityId<'pvar'>): Promise<PlanVariantRecord | null> {
        const row = await this.getPlanVariantRowById(this.getDb(), planVariantId);
        return row ? mapPlanVariantRecord(row) : null;
    }

    async getFollowUpById(planFollowUpId: EntityId<'pfu'>): Promise<PlanFollowUpRecord | null> {
        const row = await this.getPlanFollowUpRowById(this.getDb(), planFollowUpId);
        return row ? mapPlanFollowUpRecord(row) : null;
    }

    async listResearchBatches(planId: EntityId<'plan'>): Promise<PlanResearchBatchRecord[]> {
        return this.listResearchBatchesInDb(this.getDb(), planId);
    }

    async listResearchWorkers(researchBatchId: EntityId<'prb'>): Promise<PlanResearchWorkerRecord[]> {
        const rows = await this.getDb()
            .selectFrom('plan_research_workers')
            .selectAll()
            .where('batch_id', '=', researchBatchId)
            .orderBy('sequence', 'asc')
            .execute();

        return rows.map(mapPlanResearchWorkerRecord);
    }

    async listEvidenceAttachments(planRevisionId: EntityId<'prev'>): Promise<PlanEvidenceAttachmentRecord[]> {
        return this.listEvidenceAttachmentsInDb(this.getDb(), planRevisionId);
    }

    async getResearchBatchById(researchBatchId: EntityId<'prb'>): Promise<PlanResearchBatchRecord | null> {
        const row = await this.getPlanResearchBatchRowById(this.getDb(), researchBatchId);
        return row ? mapPlanResearchBatchRecord(row) : null;
    }

    async getResearchWorkerById(researchWorkerId: EntityId<'prw'>): Promise<PlanResearchWorkerRecord | null> {
        const row = await this.getPlanResearchWorkerRowById(this.getDb(), researchWorkerId);
        return row ? mapPlanResearchWorkerRecord(row) : null;
    }

    async getActiveResearchBatchByRevision(planRevisionId: EntityId<'prev'>): Promise<PlanResearchBatchRecord | null> {
        const row = await this.getActiveResearchBatchRowForRevision(this.getDb(), planRevisionId);
        return row ? mapPlanResearchBatchRecord(row) : null;
    }

    async listRevisions(planId: EntityId<'plan'>): Promise<PlanRevisionRecord[]> {
        const db = this.getDb();
        const rows = await db
            .selectFrom('plan_revisions')
            .selectAll()
            .where('plan_id', '=', planId)
            .orderBy('revision_number', 'asc')
            .execute();

        return Promise.all(rows.map((row) => this.hydratePlanRevisionRecord(db, row)));
    }

    async listRevisionItems(planRevisionId: EntityId<'prev'>): Promise<PlanRevisionItemRecord[]> {
        return this.listRevisionItemsInDb(this.getDb(), planRevisionId);
    }

    async getRevisionById(planRevisionId: EntityId<'prev'>): Promise<PlanRevisionRecord | null> {
        const db = this.getDb();
        const row = await this.getPlanRevisionRowById(db, planRevisionId);
        return row ? this.hydratePlanRevisionRecord(db, row) : null;
    }

    async getCurrentRevision(planId: EntityId<'plan'>): Promise<PlanRevisionRecord | null> {
        const row = await this.getPlanRecordRowById(this.getDb(), planId);
        if (!row) {
            return null;
        }

        return this.getRevisionById(parseEntityId(row.current_revision_id, 'plan_records.current_revision_id', 'prev'));
    }

    async getApprovedRevision(planId: EntityId<'plan'>): Promise<PlanRevisionRecord | null> {
        const row = await this.getPlanRecordRowById(this.getDb(), planId);
        if (!row || !row.approved_revision_id) {
            return null;
        }

        return this.getRevisionById(
            parseEntityId(row.approved_revision_id, 'plan_records.approved_revision_id', 'prev')
        );
    }

    async resolveApprovedRevisionSnapshot(input: {
        planId: EntityId<'plan'>;
    }): Promise<
        | { revision: PlanRevisionRecord; items: PlanRevisionItemRecord[]; advancedSnapshot?: PlanRevisionRecord['advancedSnapshot'] }
        | null
    > {
        const revision = await this.getApprovedRevision(input.planId);
        if (!revision) {
            return null;
        }

        const items = await this.listRevisionItems(revision.id);
        return {
            revision,
            items,
            ...(revision.advancedSnapshot ? { advancedSnapshot: revision.advancedSnapshot } : {}),
        };
    }

    async setAnswer(planId: EntityId<'plan'>, questionId: string, answer: string): Promise<PlanRecord | null> {
        const db = this.getDb();
        const row = await this.getPlanRecordRowById(db, planId);
        if (!row) {
            return null;
        }

        const now = nowIso();
        const questions = parsePlanQuestions(row);
        const rawAnswers = parseJsonValue(row.answers_json, {}, isJsonRecord);
        const answers: Record<string, string> = {};
        for (const [key, value] of Object.entries(rawAnswers)) {
            if (typeof value === 'string') {
                answers[key] = value;
            }
        }
        answers[questionId] = answer;
        const hasUnanswered = hasUnansweredRequiredQuestions({
            questions,
            answers,
        });

        const updated = await db
            .updateTable('plan_records')
            .set({
                answers_json: JSON.stringify(answers),
                status: hasUnanswered ? 'awaiting_answers' : 'draft',
                updated_at: now,
            })
            .where('id', '=', planId)
            .returningAll()
            .executeTakeFirst();

        return updated ? this.hydratePlanRecord(db, updated) : null;
    }

    async revise(
        planId: EntityId<'plan'>,
        summaryMarkdown: string,
        descriptions: string[],
        options?: {
            advancedSnapshot?: PlanAdvancedSnapshotInput;
        }
    ): Promise<PlanRecord | null> {
        const db = this.getDb();
        const normalizedDescriptions = descriptions
            .map((description) => description.trim())
            .filter((description) => description.length > 0);

        const revisedPlanId = await db.transaction().execute(async (transaction) => {
            const existing = await this.getPlanRecordRowById(transaction, planId);
            if (!existing) {
                return null;
            }

            const currentRevision = await this.getPlanRevisionRowById(
                transaction,
                parseEntityId(existing.current_revision_id, 'plan_records.current_revision_id', 'prev')
            );
            if (!currentRevision) {
                throw new Error(`Missing current revision "${existing.current_revision_id}" for plan ${planId}.`);
            }

            const currentAdvancedSnapshot = await this.getPlanRevisionAdvancedSnapshotRowByRevisionId(
                transaction,
                parseEntityId(currentRevision.id, 'plan_revisions.id', 'prev')
            );
            const isAdvancedPlan =
                parseEnumValue(existing.planning_depth, 'plan_records.planning_depth', ['simple', 'advanced']) ===
                'advanced';
            if (options?.advancedSnapshot && !isAdvancedPlan) {
                return null;
            }

            const now = nowIso();
            const nextRevisionId = createEntityId('prev');
            const nextRevisionNumber = currentRevision.revision_number + 1;
            const revisionAdvancedSnapshot =
                options?.advancedSnapshot ??
                (currentAdvancedSnapshot ? mapPlanAdvancedSnapshotRecord(currentAdvancedSnapshot) : undefined);

            await transaction
                .updateTable('plan_revisions')
                .set({
                    superseded_at: now,
                })
                .where('id', '=', currentRevision.id)
                .where('superseded_at', 'is', null)
                .execute();

            await this.insertRevisionInTransaction(transaction, {
                planId,
                variantId: parseEntityId(existing.current_variant_id, 'plan_records.current_variant_id', 'pvar'),
                revisionId: nextRevisionId,
                revisionNumber: nextRevisionNumber,
                summaryMarkdown,
                createdByKind: 'revise',
                previousRevisionId: parseEntityId(
                    existing.current_revision_id,
                    'plan_records.current_revision_id',
                    'prev'
                ),
                itemDescriptions: normalizedDescriptions,
                timestamp: now,
                copyResearchAttachmentsFromRevisionId: parseEntityId(
                    existing.current_revision_id,
                    'plan_records.current_revision_id',
                    'prev'
                ),
                ...(revisionAdvancedSnapshot ? { advancedSnapshot: revisionAdvancedSnapshot } : {}),
            });

            await transaction
                .updateTable('plan_records')
                .set({
                    current_revision_id: nextRevisionId,
                    summary_markdown: summaryMarkdown,
                    status:
                        isAdvancedPlan && existing.status === 'awaiting_answers' ? 'awaiting_answers' : 'draft',
                    updated_at: now,
                })
                .where('id', '=', planId)
                .execute();

            await this.replaceLiveItemsInTransaction(transaction, planId, normalizedDescriptions, now);
            return planId;
        });

        if (!revisedPlanId) {
            return null;
        }

        return this.getByIdFromDb(db, revisedPlanId);
    }

    async enterAdvancedPlanning(
        planId: EntityId<'plan'>,
        advancedSnapshot: PlanAdvancedSnapshotInput
    ): Promise<PlanRecord | null> {
        const db = this.getDb();
        const advancedPlanId = await db.transaction().execute(async (transaction) => {
            const existing = await this.getPlanRecordRowById(transaction, planId);
            if (!existing) {
                return null;
            }

            if (
                parseEnumValue(existing.status, 'plan_records.status', planStatuses) === 'implementing' ||
                parseEnumValue(existing.planning_depth, 'plan_records.planning_depth', ['simple', 'advanced']) ===
                    'advanced'
            ) {
                return null;
            }

            const currentRevision = await this.getPlanRevisionRowById(
                transaction,
                parseEntityId(existing.current_revision_id, 'plan_records.current_revision_id', 'prev')
            );
            if (!currentRevision) {
                throw new Error(`Missing current revision "${existing.current_revision_id}" for plan ${planId}.`);
            }

            const currentRevisionItems = await this.listRevisionItemsInDb(
                transaction,
                parseEntityId(currentRevision.id, 'plan_revisions.id', 'prev')
            );
            const now = nowIso();
            const nextRevisionId = createEntityId('prev');
            const nextRevisionNumber = currentRevision.revision_number + 1;
            const nextStatus = existing.status === 'awaiting_answers' ? 'awaiting_answers' : 'draft';

            await transaction
                .updateTable('plan_revisions')
                .set({
                    superseded_at: now,
                })
                .where('id', '=', currentRevision.id)
                .where('superseded_at', 'is', null)
                .execute();

            await this.insertRevisionInTransaction(transaction, {
                planId,
                variantId: parseEntityId(existing.current_variant_id, 'plan_records.current_variant_id', 'pvar'),
                revisionId: nextRevisionId,
                revisionNumber: nextRevisionNumber,
                summaryMarkdown: currentRevision.summary_markdown,
                createdByKind: 'revise',
                previousRevisionId: parseEntityId(
                    existing.current_revision_id,
                    'plan_records.current_revision_id',
                    'prev'
                ),
                itemDescriptions: currentRevisionItems.map((item) => item.description),
                timestamp: now,
                copyResearchAttachmentsFromRevisionId: parseEntityId(
                    existing.current_revision_id,
                    'plan_records.current_revision_id',
                    'prev'
                ),
                advancedSnapshot: advancedSnapshot,
            });

            await transaction
                .updateTable('plan_records')
                .set({
                    current_revision_id: nextRevisionId,
                    summary_markdown: currentRevision.summary_markdown,
                    planning_depth: 'advanced',
                    status: nextStatus,
                    updated_at: now,
                })
                .where('id', '=', planId)
                .execute();

            await this.replaceLiveItemsInTransaction(
                transaction,
                planId,
                currentRevisionItems.map((item) => item.description),
                now
            );

            return planId;
        });

        if (!advancedPlanId) {
            return null;
        }

        return this.getByIdFromDb(db, parseEntityId(advancedPlanId, 'plan_records.id', 'plan'));
    }

    async approve(
        planId: EntityId<'plan'>,
        revisionId: EntityId<'prev'>,
        options?: {
            resetImplementationState?: boolean;
        }
    ): Promise<PlanRecord | null> {
        const db = this.getDb();
        const approvedPlanId = await db.transaction().execute(async (transaction) => {
            const revisionRow = await this.getPlanRevisionRowById(transaction, revisionId);
            if (!revisionRow || revisionRow.plan_id !== planId) {
                return null;
            }

            const now = nowIso();
            const updated = await transaction
                .updateTable('plan_records')
                .set({
                    status: 'approved',
                    approved_revision_id: revisionId,
                    approved_variant_id: parseEntityId(revisionRow.variant_id, 'plan_revisions.variant_id', 'pvar'),
                    approved_at: now,
                    ...(options?.resetImplementationState
                        ? {
                              implementation_run_id: null,
                              orchestrator_run_id: null,
                              implemented_at: null,
                          }
                        : {}),
                    updated_at: now,
                })
                .where('id', '=', planId)
                .returning('id')
                .executeTakeFirst();

            return updated?.id ?? null;
        });

        if (!approvedPlanId) {
            return null;
        }

        return this.getByIdFromDb(db, parseEntityId(approvedPlanId, 'plan_records.id', 'plan'));
    }

    async cancel(planId: EntityId<'plan'>): Promise<PlanRecord | null> {
        const db = this.getDb();
        const cancelledPlanId = await db.transaction().execute(async (transaction) => {
            const existing = await this.getPlanRecordRowById(transaction, planId);
            if (
                !existing ||
                !cancellablePlanStatuses.has(parseEnumValue(existing.status, 'plan_records.status', planStatuses))
            ) {
                return null;
            }

            const now = nowIso();
            const updated = await transaction
                .updateTable('plan_records')
                .set({
                    status: 'cancelled',
                    updated_at: now,
                })
                .where('id', '=', planId)
                .returning('id')
                .executeTakeFirst();

            return updated?.id ?? null;
        });

        if (!cancelledPlanId) {
            return null;
        }

        return this.getByIdFromDb(db, parseEntityId(cancelledPlanId, 'plan_records.id', 'plan'));
    }

    async startResearchBatch(input: {
        planId: EntityId<'plan'>;
        planRevisionId: EntityId<'prev'>;
        variantId: EntityId<'pvar'>;
        promptMarkdown: string;
        requestedWorkerCount: number;
        recommendedWorkerCount: number;
        hardMaxWorkerCount: number;
        workers: Array<{
            sequence: number;
            label: string;
            promptMarkdown: string;
        }>;
    }): Promise<PlanResearchBatchRecord | null> {
        const db = this.getDb();
        const batchId = createEntityId('prb');
        const now = nowIso();

        const createdBatchId = await db.transaction().execute(async (transaction) => {
            const existing = await this.getPlanRecordRowById(transaction, input.planId);
            if (!existing) {
                return null;
            }

            if (existing.current_revision_id !== input.planRevisionId) {
                return null;
            }

            const activeBatch = await this.getActiveResearchBatchRowForRevision(transaction, input.planRevisionId);
            if (activeBatch) {
                return null;
            }

            await transaction
                .insertInto('plan_research_batches')
                .values({
                    id: batchId,
                    plan_id: input.planId,
                    plan_revision_id: input.planRevisionId,
                    variant_id: input.variantId,
                    prompt_markdown: input.promptMarkdown,
                    requested_worker_count: input.requestedWorkerCount,
                    recommended_worker_count: input.recommendedWorkerCount,
                    hard_max_worker_count: input.hardMaxWorkerCount,
                    status: 'running',
                    created_at: now,
                    completed_at: null,
                    aborted_at: null,
                })
                .execute();

            await transaction
                .insertInto('plan_research_workers')
                .values(
                    input.workers.map((worker) => ({
                        id: createEntityId('prw'),
                        batch_id: batchId,
                        sequence: worker.sequence,
                        label: worker.label,
                        prompt_markdown: worker.promptMarkdown,
                        status: 'queued',
                        child_thread_id: null,
                        child_session_id: null,
                        active_run_id: null,
                        run_id: null,
                        result_summary_markdown: null,
                        result_details_markdown: null,
                        error_message: null,
                        created_at: now,
                        completed_at: null,
                        aborted_at: null,
                    }))
                )
                .execute();

            await transaction
                .updateTable('plan_records')
                .set({
                    updated_at: now,
                })
                .where('id', '=', input.planId)
                .execute();

            return batchId;
        });

        if (!createdBatchId) {
            return null;
        }

        return this.getResearchBatchById(createdBatchId);
    }

    async abortResearchBatch(planId: EntityId<'plan'>, researchBatchId: EntityId<'prb'>): Promise<PlanResearchBatchRecord | null> {
        const db = this.getDb();
        const abortedBatchId = await db.transaction().execute(async (transaction) => {
            const batchRow = await this.getPlanResearchBatchRowById(transaction, researchBatchId);
            if (!batchRow || batchRow.plan_id !== planId || batchRow.status !== 'running') {
                return null;
            }

            const now = nowIso();

            await transaction
                .updateTable('plan_research_workers')
                .set({
                    status: 'aborted',
                    aborted_at: now,
                })
                .where('batch_id', '=', researchBatchId)
                .where('status', 'in', ['queued', 'running'])
                .execute();

            await transaction
                .updateTable('plan_research_batches')
                .set({
                    status: 'aborted',
                    aborted_at: now,
                })
                .where('id', '=', researchBatchId)
                .execute();

            await transaction
                .updateTable('plan_records')
                .set({
                    updated_at: now,
                })
                .where('id', '=', planId)
                .execute();

            return researchBatchId;
        });

        if (!abortedBatchId) {
            return null;
        }

        return this.getResearchBatchById(abortedBatchId);
    }

    async markResearchWorkerRunning(input: {
        researchBatchId: EntityId<'prb'>;
        researchWorkerId: EntityId<'prw'>;
        childThreadId: EntityId<'thr'>;
        childSessionId: EntityId<'sess'>;
        activeRunId: EntityId<'run'>;
    }): Promise<PlanResearchWorkerRecord | null> {
        const db = this.getDb();
        const runningWorkerId = await db.transaction().execute(async (transaction) => {
            const batchRow = await this.getPlanResearchBatchRowById(transaction, input.researchBatchId);
            if (!batchRow || batchRow.status !== 'running') {
                return null;
            }

            const workerRow = await this.getPlanResearchWorkerRowById(transaction, input.researchWorkerId);
            if (!workerRow || workerRow.batch_id !== input.researchBatchId) {
                return null;
            }

            const now = nowIso();
            const updatedWorker = await transaction
                .updateTable('plan_research_workers')
                .set({
                    status: 'running',
                    child_thread_id: input.childThreadId,
                    child_session_id: input.childSessionId,
                    active_run_id: input.activeRunId,
                    run_id: null,
                    error_message: null,
                    completed_at: null,
                    aborted_at: null,
                })
                .where('id', '=', input.researchWorkerId)
                .where('status', '=', 'queued')
                .returning('id')
                .executeTakeFirst();
            if (!updatedWorker) {
                return null;
            }

            await transaction
                .updateTable('plan_records')
                .set({
                    updated_at: now,
                })
                .where('id', '=', batchRow.plan_id)
                .execute();

            return input.researchWorkerId;
        });

        if (!runningWorkerId) {
            return null;
        }

        return this.getResearchWorkerById(runningWorkerId);
    }

    async recordResearchWorkerCompletion(input: {
        researchBatchId: EntityId<'prb'>;
        researchWorkerId: EntityId<'prw'>;
        resultSummaryMarkdown: string;
        resultDetailsMarkdown: string;
        childThreadId?: EntityId<'thr'>;
        childSessionId?: EntityId<'sess'>;
        activeRunId?: EntityId<'run'>;
        runId?: EntityId<'run'>;
    }): Promise<PlanResearchWorkerRecord | null> {
        const db = this.getDb();
        const completedWorkerId = await db.transaction().execute(async (transaction) => {
            const batchRow = await this.getPlanResearchBatchRowById(transaction, input.researchBatchId);
            if (!batchRow || batchRow.status === 'aborted') {
                return null;
            }

            const workerRow = await this.getPlanResearchWorkerRowById(transaction, input.researchWorkerId);
            if (!workerRow || workerRow.batch_id !== input.researchBatchId) {
                return null;
            }

            const now = nowIso();
            const updatedWorker = await transaction
                .updateTable('plan_research_workers')
                .set({
                    status: 'completed',
                    ...(input.childThreadId ? { child_thread_id: input.childThreadId } : {}),
                    ...(input.childSessionId ? { child_session_id: input.childSessionId } : {}),
                    ...(input.activeRunId ? { active_run_id: input.activeRunId } : {}),
                    ...(input.runId ? { run_id: input.runId } : {}),
                    result_summary_markdown: input.resultSummaryMarkdown,
                    result_details_markdown: input.resultDetailsMarkdown,
                    error_message: null,
                    completed_at: now,
                    aborted_at: null,
                })
                .where('id', '=', input.researchWorkerId)
                .where('status', 'in', ['queued', 'running'])
                .returning('id')
                .executeTakeFirst();
            if (!updatedWorker) {
                return null;
            }

            await transaction
                .insertInto('plan_revision_evidence_attachments')
                .values({
                    id: createEntityId('pea'),
                    plan_revision_id: parseEntityId(batchRow.plan_revision_id, 'plan_research_batches.plan_revision_id', 'prev'),
                    source_kind: 'planner_worker',
                    research_batch_id: input.researchBatchId,
                    research_worker_id: input.researchWorkerId,
                    label: workerRow.label,
                    summary_markdown: input.resultSummaryMarkdown,
                    details_markdown: input.resultDetailsMarkdown,
                    ...(input.childThreadId ? { child_thread_id: input.childThreadId } : { child_thread_id: null }),
                    ...(input.childSessionId ? { child_session_id: input.childSessionId } : { child_session_id: null }),
                    created_at: now,
                })
                .execute();

            await this.settleResearchBatchStatusInTransaction(transaction, input.researchBatchId, now);

            await transaction
                .updateTable('plan_records')
                .set({
                    updated_at: now,
                })
                .where('id', '=', batchRow.plan_id)
                .execute();

            return input.researchWorkerId;
        });

        if (!completedWorkerId) {
            return null;
        }

        return this.getResearchWorkerById(completedWorkerId);
    }

    async recordResearchWorkerFailure(input: {
        researchBatchId: EntityId<'prb'>;
        researchWorkerId: EntityId<'prw'>;
        errorMessage: string;
        childThreadId?: EntityId<'thr'>;
        childSessionId?: EntityId<'sess'>;
        activeRunId?: EntityId<'run'>;
        runId?: EntityId<'run'>;
    }): Promise<PlanResearchWorkerRecord | null> {
        const db = this.getDb();
        const failedWorkerId = await db.transaction().execute(async (transaction) => {
            const batchRow = await this.getPlanResearchBatchRowById(transaction, input.researchBatchId);
            if (!batchRow || batchRow.status === 'aborted') {
                return null;
            }

            const workerRow = await this.getPlanResearchWorkerRowById(transaction, input.researchWorkerId);
            if (!workerRow || workerRow.batch_id !== input.researchBatchId) {
                return null;
            }

            const now = nowIso();
            const updatedWorker = await transaction
                .updateTable('plan_research_workers')
                .set({
                    status: 'failed',
                    ...(input.childThreadId ? { child_thread_id: input.childThreadId } : {}),
                    ...(input.childSessionId ? { child_session_id: input.childSessionId } : {}),
                    ...(input.activeRunId ? { active_run_id: input.activeRunId } : {}),
                    ...(input.runId ? { run_id: input.runId } : {}),
                    error_message: input.errorMessage,
                    result_summary_markdown: null,
                    result_details_markdown: null,
                    completed_at: now,
                    aborted_at: null,
                })
                .where('id', '=', input.researchWorkerId)
                .where('status', 'in', ['queued', 'running'])
                .returning('id')
                .executeTakeFirst();
            if (!updatedWorker) {
                return null;
            }

            await this.settleResearchBatchStatusInTransaction(transaction, input.researchBatchId, now);

            await transaction
                .updateTable('plan_records')
                .set({
                    updated_at: now,
                })
                .where('id', '=', batchRow.plan_id)
                .execute();

            return input.researchWorkerId;
        });

        if (!failedWorkerId) {
            return null;
        }

        return this.getResearchWorkerById(failedWorkerId);
    }

    async createVariant(planId: EntityId<'plan'>, sourceRevisionId: EntityId<'prev'>): Promise<PlanRecord | null> {
        const db = this.getDb();
        const createdPlanId = await db.transaction().execute(async (transaction) => {
            const existing = await this.getPlanRecordRowById(transaction, planId);
            if (!existing) {
                return null;
            }

            const sourceRevision = await this.getPlanRevisionRowById(transaction, sourceRevisionId);
            if (!sourceRevision || sourceRevision.plan_id !== planId) {
                return null;
            }
            const sourceRevisionAdvancedSnapshot = await this.getPlanRevisionAdvancedSnapshotRowByRevisionId(
                transaction,
                sourceRevisionId
            );

            const sourceRevisionItems = await this.listRevisionItemsInDb(transaction, sourceRevisionId);
            const variantRows = await transaction
                .selectFrom('plan_variants')
                .selectAll()
                .where('plan_id', '=', planId)
                .orderBy('created_at', 'asc')
                .execute();
            const variantName = `variant-${String(variantRows.length + 1)}`;
            const variantId = createEntityId('pvar');
            const now = nowIso();
            const latestRevision = await this.getLatestRevisionRowForPlan(transaction, planId);
            const nextRevisionNumber = (latestRevision?.revision_number ?? 0) + 1;
            const nextRevisionId = createEntityId('prev');

            await transaction
                .insertInto('plan_variants')
                .values({
                    id: variantId,
                    plan_id: planId,
                    name: variantName,
                    created_from_revision_id: sourceRevisionId,
                    created_at: now,
                    archived_at: null,
                })
                .execute();

            await this.insertRevisionInTransaction(transaction, {
                planId,
                variantId,
                revisionId: nextRevisionId,
                revisionNumber: nextRevisionNumber,
                summaryMarkdown: sourceRevision.summary_markdown,
                createdByKind: 'revise',
                previousRevisionId: sourceRevisionId,
                itemDescriptions: sourceRevisionItems.map((item) => item.description),
                timestamp: now,
                copyResearchAttachmentsFromRevisionId: sourceRevisionId,
                ...(sourceRevisionAdvancedSnapshot
                    ? { advancedSnapshot: mapPlanAdvancedSnapshotRecord(sourceRevisionAdvancedSnapshot) }
                    : {}),
            });

            await transaction
                .updateTable('plan_records')
                .set({
                    current_revision_id: nextRevisionId,
                    current_variant_id: variantId,
                    summary_markdown: sourceRevision.summary_markdown,
                    status: 'draft',
                    updated_at: now,
                })
                .where('id', '=', planId)
                .execute();

            await this.replaceLiveItemsInTransaction(
                transaction,
                planId,
                sourceRevisionItems.map((item) => item.description),
                now
            );

            return planId;
        });

        if (!createdPlanId) {
            return null;
        }

        return this.getByIdFromDb(db, createdPlanId);
    }

    async activateVariant(planId: EntityId<'plan'>, variantId: EntityId<'pvar'>): Promise<PlanRecord | null> {
        const db = this.getDb();
        const activatedPlanId = await db.transaction().execute(async (transaction) => {
            const existing = await this.getPlanRecordRowById(transaction, planId);
            if (!existing) {
                return null;
            }

            const variantRow = await this.getPlanVariantRowById(transaction, variantId);
            if (!variantRow || variantRow.plan_id !== planId) {
                return null;
            }

            const headRevision = await this.getVariantHeadRevisionRow(transaction, planId, variantId);
            if (!headRevision) {
                return null;
            }
            const headRevisionItems = await this.listRevisionItemsInDb(
                transaction,
                parseEntityId(headRevision.id, 'plan_revisions.id', 'prev')
            );

            const now = nowIso();
            const nextStatus =
                existing.approved_revision_id &&
                existing.approved_variant_id === variantId &&
                existing.approved_revision_id === headRevision.id
                    ? 'approved'
                    : 'draft';

            await transaction
                .updateTable('plan_records')
                .set({
                    current_revision_id: headRevision.id,
                    current_variant_id: variantId,
                    summary_markdown: headRevision.summary_markdown,
                    status: nextStatus,
                    updated_at: now,
                })
                .where('id', '=', planId)
                .execute();

            await this.replaceLiveItemsInTransaction(
                transaction,
                planId,
                headRevisionItems.map((item) => item.description),
                now
            );

            return planId;
        });

        if (!activatedPlanId) {
            return null;
        }

        return this.getByIdFromDb(db, activatedPlanId);
    }

    async resumeFromRevision(
        planId: EntityId<'plan'>,
        sourceRevisionId: EntityId<'prev'>,
        variantId?: EntityId<'pvar'>
    ): Promise<PlanRecord | null> {
        const db = this.getDb();
        const resumedPlanId = await db.transaction().execute(async (transaction) => {
            const existing = await this.getPlanRecordRowById(transaction, planId);
            if (!existing) {
                return null;
            }

            const sourceRevision = await this.getPlanRevisionRowById(transaction, sourceRevisionId);
            if (!sourceRevision || sourceRevision.plan_id !== planId) {
                return null;
            }
            const sourceRevisionAdvancedSnapshot = await this.getPlanRevisionAdvancedSnapshotRowByRevisionId(
                transaction,
                sourceRevisionId
            );

            const targetVariantId = variantId ?? parseEntityId(existing.current_variant_id, 'plan_records.current_variant_id', 'pvar');
            const targetVariant = await this.getPlanVariantRowById(transaction, targetVariantId);
            if (!targetVariant || targetVariant.plan_id !== planId) {
                return null;
            }

            const sourceRevisionItems = await this.listRevisionItemsInDb(transaction, sourceRevisionId);
            const latestRevision = await this.getLatestRevisionRowForPlan(transaction, planId);
            const nextRevisionNumber = (latestRevision?.revision_number ?? 0) + 1;
            const nextRevisionId = createEntityId('prev');
            const now = nowIso();
            const targetVariantHead = await this.getVariantHeadRevisionRow(transaction, planId, targetVariantId);
            if (!targetVariantHead) {
                return null;
            }

            await transaction
                .updateTable('plan_revisions')
                .set({
                    superseded_at: now,
                })
                .where('id', '=', targetVariantHead.id)
                .where('superseded_at', 'is', null)
                .execute();

            await this.insertRevisionInTransaction(transaction, {
                planId,
                variantId: targetVariantId,
                revisionId: nextRevisionId,
                revisionNumber: nextRevisionNumber,
                summaryMarkdown: sourceRevision.summary_markdown,
                createdByKind: 'revise',
                previousRevisionId: parseEntityId(targetVariantHead.id, 'plan_revisions.id', 'prev'),
                itemDescriptions: sourceRevisionItems.map((item) => item.description),
                timestamp: now,
                copyResearchAttachmentsFromRevisionId: sourceRevisionId,
                ...(sourceRevisionAdvancedSnapshot
                    ? { advancedSnapshot: mapPlanAdvancedSnapshotRecord(sourceRevisionAdvancedSnapshot) }
                    : {}),
            });

            await transaction
                .updateTable('plan_records')
                .set({
                    current_revision_id: nextRevisionId,
                    current_variant_id: targetVariantId,
                    summary_markdown: sourceRevision.summary_markdown,
                    status: 'draft',
                    updated_at: now,
                })
                .where('id', '=', planId)
                .execute();

            await this.replaceLiveItemsInTransaction(
                transaction,
                planId,
                sourceRevisionItems.map((item) => item.description),
                now
            );

            return planId;
        });

        if (!resumedPlanId) {
            return null;
        }

        return this.getByIdFromDb(db, resumedPlanId);
    }

    async raiseFollowUp(input: {
        planId: EntityId<'plan'>;
        kind: 'missing_context' | 'missing_file';
        promptMarkdown: string;
        sourceRevisionId?: EntityId<'prev'>;
    }): Promise<PlanRecord | null> {
        const db = this.getDb();
        const raisedPlanId = await db.transaction().execute(async (transaction) => {
            const existing = await this.getPlanRecordRowById(transaction, input.planId);
            if (!existing) {
                return null;
            }

            const variantId = parseEntityId(existing.current_variant_id, 'plan_records.current_variant_id', 'pvar');
            const sourceRevisionId =
                input.sourceRevisionId ?? parseEntityId(existing.current_revision_id, 'plan_records.current_revision_id', 'prev');
            const now = nowIso();

            await transaction
                .insertInto('plan_follow_ups')
                .values({
                    id: createEntityId('pfu'),
                    plan_id: input.planId,
                    variant_id: variantId,
                    source_revision_id: sourceRevisionId,
                    kind: input.kind,
                    status: 'open',
                    prompt_markdown: input.promptMarkdown,
                    response_markdown: null,
                    created_by_kind: 'user',
                    created_at: now,
                    resolved_at: null,
                    dismissed_at: null,
                })
                .execute();

            await transaction
                .updateTable('plan_records')
                .set({
                    updated_at: now,
                })
                .where('id', '=', input.planId)
                .execute();

            return input.planId;
        });

        if (!raisedPlanId) {
            return null;
        }

        return this.getByIdFromDb(db, raisedPlanId);
    }

    async resolveFollowUp(input: {
        planId: EntityId<'plan'>;
        followUpId: EntityId<'pfu'>;
        status: 'resolved' | 'dismissed';
        responseMarkdown?: string;
    }): Promise<PlanRecord | null> {
        const db = this.getDb();
        const resolvedPlanId = await db.transaction().execute(async (transaction) => {
            const existing = await this.getPlanRecordRowById(transaction, input.planId);
            if (!existing) {
                return null;
            }

            const followUpRow = await this.getPlanFollowUpRowById(transaction, input.followUpId);
            if (!followUpRow || followUpRow.plan_id !== input.planId || followUpRow.status !== 'open') {
                return null;
            }

            const now = nowIso();
            await transaction
                .updateTable('plan_follow_ups')
                .set({
                    status: input.status,
                    response_markdown: input.responseMarkdown ?? null,
                    resolved_at: input.status === 'resolved' ? now : null,
                    dismissed_at: input.status === 'dismissed' ? now : null,
                })
                .where('id', '=', input.followUpId)
                .execute();

            await transaction
                .updateTable('plan_records')
                .set({
                    updated_at: now,
                })
                .where('id', '=', input.planId)
                .execute();

            return input.planId;
        });

        if (!resolvedPlanId) {
            return null;
        }

        return this.getByIdFromDb(db, resolvedPlanId);
    }

    async getProjectionById(profileId: string, planId: EntityId<'plan'>): Promise<PlanViewProjection | null> {
        const db = this.getDb();
        const plan = await this.getById(profileId, planId);
        if (!plan) {
            return null;
        }

        const [items, revisions, variants, followUps, phaseProjection, researchBatches, evidenceAttachments, events] =
            await Promise.all(
            [
                this.listItems(planId),
                this.listRevisions(planId),
                this.listVariants(planId),
                this.listFollowUps(planId),
                planPhaseStore.listProjectionData(planId),
                this.listResearchBatchesInDb(db, planId),
                this.listEvidenceAttachmentsInDb(db, plan.currentRevisionId),
                runtimeEventStore.listByEntity({
                    entityType: 'plan',
                    entityId: planId,
                    limit: 1000,
                }),
            ]
        );

        const researchWorkers = researchBatches.length
            ? await this.listResearchWorkersInDb(db, researchBatches.map((batch) => batch.id))
            : [];

        const history = buildPlanHistoryEntries({
            plan,
            variants,
            followUps,
            events,
        });

        const recoveryBanner = buildRecoveryBanner({
            plan,
            variants,
            followUps,
        });

        return buildPlanViewProjection({
            plan,
            items,
            revisions,
            variants,
            followUps,
            phases: phaseProjection.phases,
            phaseRevisions: phaseProjection.phaseRevisions,
            phaseRevisionItems: phaseProjection.phaseRevisionItems,
            researchBatches,
            researchWorkers,
            evidenceAttachments,
            history,
            ...(recoveryBanner ? { recoveryBanner } : {}),
        });
    }

    async resetItemsForFreshImplementation(planId: EntityId<'plan'>): Promise<PlanItemRecord[]> {
        const now = nowIso();

        await this.getDb()
            .updateTable('plan_items')
            .set({
                status: 'pending',
                run_id: null,
                error_message: null,
                updated_at: now,
            })
            .where('plan_id', '=', planId)
            .execute();

        return this.listItems(planId);
    }

    async markImplementing(
        planId: EntityId<'plan'>,
        implementationRunId?: EntityId<'run'>,
        orchestratorRunId?: EntityId<'orch'>
    ): Promise<PlanRecord | null> {
        const db = this.getDb();
        const now = nowIso();
        const updated = await db
            .updateTable('plan_records')
            .set({
                status: 'implementing',
                implementation_run_id: implementationRunId ?? null,
                orchestrator_run_id: orchestratorRunId ?? null,
                updated_at: now,
            })
            .where('id', '=', planId)
            .returningAll()
            .executeTakeFirst();

        return updated ? this.hydratePlanRecord(db, updated) : null;
    }

    async markImplemented(planId: EntityId<'plan'>): Promise<PlanRecord | null> {
        const db = this.getDb();
        const now = nowIso();
        const updated = await db
            .updateTable('plan_records')
            .set({
                status: 'implemented',
                implemented_at: now,
                updated_at: now,
            })
            .where('id', '=', planId)
            .returningAll()
            .executeTakeFirst();

        return updated ? this.hydratePlanRecord(db, updated) : null;
    }

    async markFailed(planId: EntityId<'plan'>): Promise<PlanRecord | null> {
        const db = this.getDb();
        const now = nowIso();
        const updated = await db
            .updateTable('plan_records')
            .set({
                status: 'failed',
                updated_at: now,
            })
            .where('id', '=', planId)
            .returningAll()
            .executeTakeFirst();

        return updated ? this.hydratePlanRecord(db, updated) : null;
    }

    async setItemStatus(
        itemId: EntityId<'step'>,
        status: PlanItemRecord['status'],
        runId?: EntityId<'run'>,
        errorMessage?: string
    ): Promise<PlanItemRecord | null> {
        const now = nowIso();
        const updated = await this.getDb()
            .updateTable('plan_items')
            .set({
                status,
                run_id: runId ?? null,
                error_message: errorMessage ?? null,
                updated_at: now,
            })
            .where('id', '=', itemId)
            .returningAll()
            .executeTakeFirst();

        return updated ? mapPlanItemRecord(updated) : null;
    }

    private async getByIdFromDb(db: PlanStoreDb, planId: EntityId<'plan'>): Promise<PlanRecord | null> {
        const row = await this.getPlanRecordRowById(db, planId);
        return row ? this.hydratePlanRecord(db, row) : null;
    }
}

export const planStore = new PlanStore();
