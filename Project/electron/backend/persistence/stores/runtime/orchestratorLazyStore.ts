import { getPersistence } from '@/app/backend/persistence/db';
import { parseEntityId, parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso, parseJsonValue } from '@/app/backend/persistence/stores/shared/utils';
import type {
    OrchestratorLazyExecutionPhaseRecord,
    OrchestratorLazyInteractionCheckpointRecord,
    OrchestratorLazyObjectiveRecord,
    OrchestratorLazyObjectiveSegmentRecord,
    OrchestratorLazyPackageAssessmentRecord,
    OrchestratorLazyTaskRecord,
    OrchestratorLazyTechDecisionRecord,
    OrchestratorLazyWalkthroughRecord,
    OrchestratorLazyWorkingArtifactRecord,
} from '@/app/backend/persistence/types';
import {
    orchestratorLazyCapabilityGroups,
    orchestratorLazyCheckpointKinds,
    orchestratorLazyCheckpointStatuses,
    orchestratorLazyDecisionStatuses,
    orchestratorLazyExecutionKinds,
    orchestratorLazyExecutionPhaseKinds,
    orchestratorLazyObjectiveSegmentKinds,
    orchestratorLazyObjectiveStatuses,
    orchestratorLazyPackageAssessmentStatuses,
    orchestratorLazyPackagePolicies,
    orchestratorLazyResearchDepths,
    orchestratorLazyTaskStatuses,
    orchestratorLazyWorkingArtifactKinds,
} from '@/app/backend/runtime/contracts';
import type {
    EntityId,
    OrchestratorLazyCapabilityGroup,
    OrchestratorLazyCheckpointKind,
    OrchestratorLazyDecisionStatus,
    OrchestratorLazyExecutionKind,
    OrchestratorLazyExecutionPhaseKind,
    OrchestratorLazyObjectiveSegmentKind,
    OrchestratorLazyPackageAssessmentStatus,
    OrchestratorLazyPackagePolicy,
    OrchestratorLazyResearchDepth,
    OrchestratorLazyTaskStatus,
    OrchestratorLazyWorkingArtifactKind,
} from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';

function parseStringArray(value: string): string[] {
    const parsed = parseJsonValue(value, [], Array.isArray);
    return parsed.filter((item): item is string => typeof item === 'string');
}

function parseEntityIdArray<P extends 'ltask'>(value: string, field: string, prefix: P): Array<EntityId<P>> {
    return parseStringArray(value).map((item, index) =>
        parseEntityId(item, `${field}[${String(index)}]`, prefix)
    );
}

function mapObjective(row: {
    id: string;
    orchestrator_run_id: string;
    objective_markdown: string;
    success_criteria_markdown: string | null;
    constraints_markdown: string | null;
    evidence_requirements_markdown: string | null;
    allowed_capability_groups_json: string;
    research_depth: string;
    package_policy: string;
    status: string;
    created_at: string;
    updated_at: string;
}): OrchestratorLazyObjectiveRecord {
    return {
        id: parseEntityId(row.id, 'orchestrator_lazy_objectives.id', 'lobj'),
        orchestratorRunId: parseEntityId(row.orchestrator_run_id, 'orchestrator_lazy_objectives.orchestrator_run_id', 'orch'),
        objectiveMarkdown: row.objective_markdown,
        ...(row.success_criteria_markdown ? { successCriteriaMarkdown: row.success_criteria_markdown } : {}),
        ...(row.constraints_markdown ? { constraintsMarkdown: row.constraints_markdown } : {}),
        ...(row.evidence_requirements_markdown ? { evidenceRequirementsMarkdown: row.evidence_requirements_markdown } : {}),
        allowedCapabilityGroups: parseStringArray(row.allowed_capability_groups_json).map((item, index) =>
            parseEnumValue(
                item,
                `orchestrator_lazy_objectives.allowed_capability_groups_json[${String(index)}]`,
                orchestratorLazyCapabilityGroups
            )
        ),
        researchDepth: parseEnumValue(row.research_depth, 'orchestrator_lazy_objectives.research_depth', orchestratorLazyResearchDepths),
        packagePolicy: parseEnumValue(row.package_policy, 'orchestrator_lazy_objectives.package_policy', orchestratorLazyPackagePolicies),
        status: parseEnumValue(row.status, 'orchestrator_lazy_objectives.status', orchestratorLazyObjectiveStatuses),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapSegment(row: {
    id: string;
    orchestrator_run_id: string;
    objective_id: string;
    sequence: number;
    kind: string;
    content_markdown: string;
    created_at: string;
}): OrchestratorLazyObjectiveSegmentRecord {
    return {
        id: parseEntityId(row.id, 'orchestrator_lazy_objective_segments.id', 'lseg'),
        orchestratorRunId: parseEntityId(
            row.orchestrator_run_id,
            'orchestrator_lazy_objective_segments.orchestrator_run_id',
            'orch'
        ),
        objectiveId: parseEntityId(row.objective_id, 'orchestrator_lazy_objective_segments.objective_id', 'lobj'),
        sequence: row.sequence,
        kind: parseEnumValue(row.kind, 'orchestrator_lazy_objective_segments.kind', orchestratorLazyObjectiveSegmentKinds),
        contentMarkdown: row.content_markdown,
        createdAt: row.created_at,
    };
}

function mapTask(row: {
    id: string;
    orchestrator_run_id: string;
    parent_task_id: string | null;
    step_id: string | null;
    sequence: number;
    title: string;
    description_markdown: string;
    execution_kind: string;
    status: string;
    dependency_task_ids_json: string;
    verification_markdown: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
}): OrchestratorLazyTaskRecord {
    return {
        id: parseEntityId(row.id, 'orchestrator_lazy_tasks.id', 'ltask'),
        orchestratorRunId: parseEntityId(row.orchestrator_run_id, 'orchestrator_lazy_tasks.orchestrator_run_id', 'orch'),
        ...(row.parent_task_id ? { parentTaskId: parseEntityId(row.parent_task_id, 'orchestrator_lazy_tasks.parent_task_id', 'ltask') } : {}),
        ...(row.step_id ? { stepId: parseEntityId(row.step_id, 'orchestrator_lazy_tasks.step_id', 'step') } : {}),
        sequence: row.sequence,
        title: row.title,
        descriptionMarkdown: row.description_markdown,
        executionKind: parseEnumValue(row.execution_kind, 'orchestrator_lazy_tasks.execution_kind', orchestratorLazyExecutionKinds),
        status: parseEnumValue(row.status, 'orchestrator_lazy_tasks.status', orchestratorLazyTaskStatuses),
        dependencyTaskIds: parseEntityIdArray(
            row.dependency_task_ids_json,
            'orchestrator_lazy_tasks.dependency_task_ids_json',
            'ltask'
        ),
        ...(row.verification_markdown ? { verificationMarkdown: row.verification_markdown } : {}),
        ...(row.error_message ? { errorMessage: row.error_message } : {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapCheckpoint(row: {
    id: string;
    orchestrator_run_id: string;
    task_id: string | null;
    kind: string;
    status: string;
    prompt_markdown: string;
    choices_json: string | null;
    response_markdown: string | null;
    resume_token: string | null;
    created_at: string;
    resolved_at: string | null;
    cancelled_at: string | null;
}): OrchestratorLazyInteractionCheckpointRecord {
    return {
        id: parseEntityId(row.id, 'orchestrator_lazy_interaction_checkpoints.id', 'lchk'),
        orchestratorRunId: parseEntityId(
            row.orchestrator_run_id,
            'orchestrator_lazy_interaction_checkpoints.orchestrator_run_id',
            'orch'
        ),
        ...(row.task_id ? { taskId: parseEntityId(row.task_id, 'orchestrator_lazy_interaction_checkpoints.task_id', 'ltask') } : {}),
        kind: parseEnumValue(row.kind, 'orchestrator_lazy_interaction_checkpoints.kind', orchestratorLazyCheckpointKinds),
        status: parseEnumValue(
            row.status,
            'orchestrator_lazy_interaction_checkpoints.status',
            orchestratorLazyCheckpointStatuses
        ),
        promptMarkdown: row.prompt_markdown,
        ...(row.choices_json ? { choicesJson: row.choices_json } : {}),
        ...(row.response_markdown ? { responseMarkdown: row.response_markdown } : {}),
        ...(row.resume_token ? { resumeToken: row.resume_token } : {}),
        createdAt: row.created_at,
        ...(row.resolved_at ? { resolvedAt: row.resolved_at } : {}),
        ...(row.cancelled_at ? { cancelledAt: row.cancelled_at } : {}),
    };
}

function mapDecision(row: {
    id: string;
    orchestrator_run_id: string;
    task_id: string | null;
    title: string;
    decision_markdown: string;
    rationale_markdown: string;
    status: string;
    created_at: string;
    updated_at: string;
}): OrchestratorLazyTechDecisionRecord {
    return {
        id: parseEntityId(row.id, 'orchestrator_lazy_tech_decisions.id', 'ldec'),
        orchestratorRunId: parseEntityId(row.orchestrator_run_id, 'orchestrator_lazy_tech_decisions.orchestrator_run_id', 'orch'),
        ...(row.task_id ? { taskId: parseEntityId(row.task_id, 'orchestrator_lazy_tech_decisions.task_id', 'ltask') } : {}),
        title: row.title,
        decisionMarkdown: row.decision_markdown,
        rationaleMarkdown: row.rationale_markdown,
        status: parseEnumValue(row.status, 'orchestrator_lazy_tech_decisions.status', orchestratorLazyDecisionStatuses),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapPackageAssessment(row: {
    id: string;
    orchestrator_run_id: string;
    task_id: string | null;
    package_name: string;
    ecosystem: string | null;
    requested_version: string | null;
    assessment_markdown: string;
    status: string;
    created_at: string;
    updated_at: string;
}): OrchestratorLazyPackageAssessmentRecord {
    return {
        id: parseEntityId(row.id, 'orchestrator_lazy_package_assessments.id', 'lpkg'),
        orchestratorRunId: parseEntityId(row.orchestrator_run_id, 'orchestrator_lazy_package_assessments.orchestrator_run_id', 'orch'),
        ...(row.task_id ? { taskId: parseEntityId(row.task_id, 'orchestrator_lazy_package_assessments.task_id', 'ltask') } : {}),
        packageName: row.package_name,
        ...(row.ecosystem ? { ecosystem: row.ecosystem } : {}),
        ...(row.requested_version ? { requestedVersion: row.requested_version } : {}),
        assessmentMarkdown: row.assessment_markdown,
        status: parseEnumValue(
            row.status,
            'orchestrator_lazy_package_assessments.status',
            orchestratorLazyPackageAssessmentStatuses
        ),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapArtifact(row: {
    id: string;
    orchestrator_run_id: string;
    task_id: string | null;
    kind: string;
    title: string;
    content_markdown: string;
    source_run_id: string | null;
    created_at: string;
}): OrchestratorLazyWorkingArtifactRecord {
    return {
        id: parseEntityId(row.id, 'orchestrator_lazy_working_artifacts.id', 'lart'),
        orchestratorRunId: parseEntityId(row.orchestrator_run_id, 'orchestrator_lazy_working_artifacts.orchestrator_run_id', 'orch'),
        ...(row.task_id ? { taskId: parseEntityId(row.task_id, 'orchestrator_lazy_working_artifacts.task_id', 'ltask') } : {}),
        kind: parseEnumValue(row.kind, 'orchestrator_lazy_working_artifacts.kind', orchestratorLazyWorkingArtifactKinds),
        title: row.title,
        contentMarkdown: row.content_markdown,
        ...(row.source_run_id ? { sourceRunId: parseEntityId(row.source_run_id, 'orchestrator_lazy_working_artifacts.source_run_id', 'run') } : {}),
        createdAt: row.created_at,
    };
}

function mapPhase(row: {
    id: string;
    orchestrator_run_id: string;
    task_id: string | null;
    sequence: number;
    phase_kind: string;
    execution_kind: string | null;
    status: string;
    child_run_id: string | null;
    summary_markdown: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
}): OrchestratorLazyExecutionPhaseRecord {
    return {
        id: parseEntityId(row.id, 'orchestrator_lazy_execution_phases.id', 'lphase'),
        orchestratorRunId: parseEntityId(row.orchestrator_run_id, 'orchestrator_lazy_execution_phases.orchestrator_run_id', 'orch'),
        ...(row.task_id ? { taskId: parseEntityId(row.task_id, 'orchestrator_lazy_execution_phases.task_id', 'ltask') } : {}),
        sequence: row.sequence,
        phaseKind: parseEnumValue(row.phase_kind, 'orchestrator_lazy_execution_phases.phase_kind', orchestratorLazyExecutionPhaseKinds),
        ...(row.execution_kind ? { executionKind: parseEnumValue(row.execution_kind, 'orchestrator_lazy_execution_phases.execution_kind', orchestratorLazyExecutionKinds) } : {}),
        status: parseEnumValue(row.status, 'orchestrator_lazy_execution_phases.status', orchestratorLazyTaskStatuses),
        ...(row.child_run_id ? { childRunId: parseEntityId(row.child_run_id, 'orchestrator_lazy_execution_phases.child_run_id', 'run') } : {}),
        ...(row.summary_markdown ? { summaryMarkdown: row.summary_markdown } : {}),
        ...(row.error_message ? { errorMessage: row.error_message } : {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapWalkthrough(row: {
    id: string;
    orchestrator_run_id: string;
    content_markdown: string;
    validation_summary_markdown: string | null;
    risk_markdown: string | null;
    created_at: string;
}): OrchestratorLazyWalkthroughRecord {
    return {
        id: parseEntityId(row.id, 'orchestrator_lazy_walkthroughs.id', 'lwalk'),
        orchestratorRunId: parseEntityId(row.orchestrator_run_id, 'orchestrator_lazy_walkthroughs.orchestrator_run_id', 'orch'),
        contentMarkdown: row.content_markdown,
        ...(row.validation_summary_markdown ? { validationSummaryMarkdown: row.validation_summary_markdown } : {}),
        ...(row.risk_markdown ? { riskMarkdown: row.risk_markdown } : {}),
        createdAt: row.created_at,
    };
}

export class OrchestratorLazyStore {
    async createObjective(input: {
        orchestratorRunId: EntityId<'orch'>;
        objectiveMarkdown: string;
        successCriteriaMarkdown?: string;
        constraintsMarkdown?: string;
        evidenceRequirementsMarkdown?: string;
        allowedCapabilityGroups: OrchestratorLazyCapabilityGroup[];
        researchDepth: OrchestratorLazyResearchDepth;
        packagePolicy: OrchestratorLazyPackagePolicy;
    }): Promise<OrchestratorLazyObjectiveRecord> {
        const { db } = getPersistence();
        const now = nowIso();
        const id = createEntityId('lobj');
        await db
            .insertInto('orchestrator_lazy_objectives')
            .values({
                id,
                orchestrator_run_id: input.orchestratorRunId,
                objective_markdown: input.objectiveMarkdown,
                success_criteria_markdown: input.successCriteriaMarkdown ?? null,
                constraints_markdown: input.constraintsMarkdown ?? null,
                evidence_requirements_markdown: input.evidenceRequirementsMarkdown ?? null,
                allowed_capability_groups_json: JSON.stringify(input.allowedCapabilityGroups),
                research_depth: input.researchDepth,
                package_policy: input.packagePolicy,
                status: 'active',
                created_at: now,
                updated_at: now,
            })
            .execute();
        return this.getObjectiveByRunId(input.orchestratorRunId).then((objective) => {
            if (!objective) {
                throw new Error(`Expected Lazy objective "${id}" to exist.`);
            }
            return objective;
        });
    }

    async getObjectiveByRunId(orchestratorRunId: EntityId<'orch'>): Promise<OrchestratorLazyObjectiveRecord | null> {
        const row = await getPersistence()
            .db.selectFrom('orchestrator_lazy_objectives')
            .selectAll()
            .where('orchestrator_run_id', '=', orchestratorRunId)
            .executeTakeFirst();
        return row ? mapObjective(row) : null;
    }

    async appendObjectiveSegment(input: {
        orchestratorRunId: EntityId<'orch'>;
        objectiveId: EntityId<'lobj'>;
        kind: OrchestratorLazyObjectiveSegmentKind;
        contentMarkdown: string;
    }): Promise<OrchestratorLazyObjectiveSegmentRecord> {
        const { db } = getPersistence();
        const now = nowIso();
        const latest = await db
            .selectFrom('orchestrator_lazy_objective_segments')
            .select('sequence')
            .where('orchestrator_run_id', '=', input.orchestratorRunId)
            .orderBy('sequence', 'desc')
            .executeTakeFirst();
        const id = createEntityId('lseg');
        await db
            .insertInto('orchestrator_lazy_objective_segments')
            .values({
                id,
                orchestrator_run_id: input.orchestratorRunId,
                objective_id: input.objectiveId,
                sequence: (latest?.sequence ?? 0) + 1,
                kind: input.kind,
                content_markdown: input.contentMarkdown,
                created_at: now,
            })
            .execute();
        return mapSegment(
            await db
                .selectFrom('orchestrator_lazy_objective_segments')
                .selectAll()
                .where('id', '=', id)
                .executeTakeFirstOrThrow()
        );
    }

    async createTask(input: {
        orchestratorRunId: EntityId<'orch'>;
        stepId?: EntityId<'step'>;
        sequence: number;
        title: string;
        descriptionMarkdown: string;
        executionKind: OrchestratorLazyExecutionKind;
        dependencyTaskIds?: Array<EntityId<'ltask'>>;
        verificationMarkdown?: string;
    }): Promise<OrchestratorLazyTaskRecord> {
        const { db } = getPersistence();
        const now = nowIso();
        const id = createEntityId('ltask');
        await db
            .insertInto('orchestrator_lazy_tasks')
            .values({
                id,
                orchestrator_run_id: input.orchestratorRunId,
                parent_task_id: null,
                step_id: input.stepId ?? null,
                sequence: input.sequence,
                title: input.title,
                description_markdown: input.descriptionMarkdown,
                execution_kind: input.executionKind,
                status: 'pending',
                dependency_task_ids_json: JSON.stringify(input.dependencyTaskIds ?? []),
                verification_markdown: input.verificationMarkdown ?? null,
                error_message: null,
                created_at: now,
                updated_at: now,
            })
            .execute();
        return mapTask(await db.selectFrom('orchestrator_lazy_tasks').selectAll().where('id', '=', id).executeTakeFirstOrThrow());
    }

    async updateTask(
        taskId: EntityId<'ltask'>,
        input: { status?: OrchestratorLazyTaskStatus; errorMessage?: string | null }
    ): Promise<OrchestratorLazyTaskRecord> {
        const { db } = getPersistence();
        const now = nowIso();
        const row = await db
            .updateTable('orchestrator_lazy_tasks')
            .set({
                ...(input.status ? { status: input.status } : {}),
                ...(input.errorMessage !== undefined ? { error_message: input.errorMessage } : {}),
                updated_at: now,
            })
            .where('id', '=', taskId)
            .returningAll()
            .executeTakeFirstOrThrow();
        return mapTask(row);
    }

    async createExecutionPhase(input: {
        orchestratorRunId: EntityId<'orch'>;
        taskId?: EntityId<'ltask'>;
        sequence: number;
        phaseKind: OrchestratorLazyExecutionPhaseKind;
        executionKind?: OrchestratorLazyExecutionKind;
    }): Promise<OrchestratorLazyExecutionPhaseRecord> {
        const { db } = getPersistence();
        const now = nowIso();
        const id = createEntityId('lphase');
        await db
            .insertInto('orchestrator_lazy_execution_phases')
            .values({
                id,
                orchestrator_run_id: input.orchestratorRunId,
                task_id: input.taskId ?? null,
                sequence: input.sequence,
                phase_kind: input.phaseKind,
                execution_kind: input.executionKind ?? null,
                status: 'pending',
                child_run_id: null,
                summary_markdown: null,
                error_message: null,
                created_at: now,
                updated_at: now,
            })
            .execute();
        return mapPhase(
            await db.selectFrom('orchestrator_lazy_execution_phases').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
        );
    }

    async updateExecutionPhase(
        phaseId: EntityId<'lphase'>,
        input: {
            status?: OrchestratorLazyTaskStatus;
            childRunId?: EntityId<'run'> | null;
            summaryMarkdown?: string | null;
            errorMessage?: string | null;
        }
    ): Promise<OrchestratorLazyExecutionPhaseRecord> {
        const { db } = getPersistence();
        const now = nowIso();
        const row = await db
            .updateTable('orchestrator_lazy_execution_phases')
            .set({
                ...(input.status ? { status: input.status } : {}),
                ...(input.childRunId !== undefined ? { child_run_id: input.childRunId } : {}),
                ...(input.summaryMarkdown !== undefined ? { summary_markdown: input.summaryMarkdown } : {}),
                ...(input.errorMessage !== undefined ? { error_message: input.errorMessage } : {}),
                updated_at: now,
            })
            .where('id', '=', phaseId)
            .returningAll()
            .executeTakeFirstOrThrow();
        return mapPhase(row);
    }

    async createCheckpoint(input: {
        orchestratorRunId: EntityId<'orch'>;
        taskId?: EntityId<'ltask'>;
        kind: OrchestratorLazyCheckpointKind;
        promptMarkdown: string;
        choicesJson?: string;
        resumeToken?: string;
    }): Promise<OrchestratorLazyInteractionCheckpointRecord> {
        const { db } = getPersistence();
        const now = nowIso();
        const id = createEntityId('lchk');
        await db
            .insertInto('orchestrator_lazy_interaction_checkpoints')
            .values({
                id,
                orchestrator_run_id: input.orchestratorRunId,
                task_id: input.taskId ?? null,
                kind: input.kind,
                status: 'pending',
                prompt_markdown: input.promptMarkdown,
                choices_json: input.choicesJson ?? null,
                response_markdown: null,
                resume_token: input.resumeToken ?? null,
                created_at: now,
                resolved_at: null,
                cancelled_at: null,
            })
            .execute();
        return mapCheckpoint(
            await db
                .selectFrom('orchestrator_lazy_interaction_checkpoints')
                .selectAll()
                .where('id', '=', id)
                .executeTakeFirstOrThrow()
        );
    }

    async resolveCheckpoint(
        checkpointId: EntityId<'lchk'>,
        input: { status: 'resolved' | 'cancelled'; responseMarkdown?: string }
    ): Promise<OrchestratorLazyInteractionCheckpointRecord | null> {
        const { db } = getPersistence();
        const now = nowIso();
        const row = await db
            .updateTable('orchestrator_lazy_interaction_checkpoints')
            .set({
                status: input.status,
                response_markdown: input.responseMarkdown ?? null,
                resolved_at: input.status === 'resolved' ? now : null,
                cancelled_at: input.status === 'cancelled' ? now : null,
            })
            .where('id', '=', checkpointId)
            .where('status', '=', 'pending')
            .returningAll()
            .executeTakeFirst();
        return row ? mapCheckpoint(row) : null;
    }

    async createDecision(input: {
        orchestratorRunId: EntityId<'orch'>;
        taskId?: EntityId<'ltask'>;
        title: string;
        decisionMarkdown: string;
        rationaleMarkdown: string;
        status?: OrchestratorLazyDecisionStatus;
    }): Promise<OrchestratorLazyTechDecisionRecord> {
        const { db } = getPersistence();
        const now = nowIso();
        const id = createEntityId('ldec');
        await db
            .insertInto('orchestrator_lazy_tech_decisions')
            .values({
                id,
                orchestrator_run_id: input.orchestratorRunId,
                task_id: input.taskId ?? null,
                title: input.title,
                decision_markdown: input.decisionMarkdown,
                rationale_markdown: input.rationaleMarkdown,
                status: input.status ?? 'accepted',
                created_at: now,
                updated_at: now,
            })
            .execute();
        return mapDecision(await db.selectFrom('orchestrator_lazy_tech_decisions').selectAll().where('id', '=', id).executeTakeFirstOrThrow());
    }

    async createPackageAssessment(input: {
        orchestratorRunId: EntityId<'orch'>;
        taskId?: EntityId<'ltask'>;
        packageName: string;
        ecosystem?: string;
        requestedVersion?: string;
        assessmentMarkdown: string;
        status: OrchestratorLazyPackageAssessmentStatus;
    }): Promise<OrchestratorLazyPackageAssessmentRecord> {
        const { db } = getPersistence();
        const now = nowIso();
        const id = createEntityId('lpkg');
        await db
            .insertInto('orchestrator_lazy_package_assessments')
            .values({
                id,
                orchestrator_run_id: input.orchestratorRunId,
                task_id: input.taskId ?? null,
                package_name: input.packageName,
                ecosystem: input.ecosystem ?? null,
                requested_version: input.requestedVersion ?? null,
                assessment_markdown: input.assessmentMarkdown,
                status: input.status,
                created_at: now,
                updated_at: now,
            })
            .execute();
        return mapPackageAssessment(
            await db.selectFrom('orchestrator_lazy_package_assessments').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
        );
    }

    async createArtifact(input: {
        orchestratorRunId: EntityId<'orch'>;
        taskId?: EntityId<'ltask'>;
        kind: OrchestratorLazyWorkingArtifactKind;
        title: string;
        contentMarkdown: string;
        sourceRunId?: EntityId<'run'>;
    }): Promise<OrchestratorLazyWorkingArtifactRecord> {
        const { db } = getPersistence();
        const now = nowIso();
        const id = createEntityId('lart');
        await db
            .insertInto('orchestrator_lazy_working_artifacts')
            .values({
                id,
                orchestrator_run_id: input.orchestratorRunId,
                task_id: input.taskId ?? null,
                kind: input.kind,
                title: input.title,
                content_markdown: input.contentMarkdown,
                source_run_id: input.sourceRunId ?? null,
                created_at: now,
            })
            .execute();
        return mapArtifact(await db.selectFrom('orchestrator_lazy_working_artifacts').selectAll().where('id', '=', id).executeTakeFirstOrThrow());
    }

    async createWalkthrough(input: {
        orchestratorRunId: EntityId<'orch'>;
        contentMarkdown: string;
        validationSummaryMarkdown?: string;
        riskMarkdown?: string;
    }): Promise<OrchestratorLazyWalkthroughRecord> {
        const { db } = getPersistence();
        const now = nowIso();
        const id = createEntityId('lwalk');
        await db
            .insertInto('orchestrator_lazy_walkthroughs')
            .values({
                id,
                orchestrator_run_id: input.orchestratorRunId,
                content_markdown: input.contentMarkdown,
                validation_summary_markdown: input.validationSummaryMarkdown ?? null,
                risk_markdown: input.riskMarkdown ?? null,
                created_at: now,
            })
            .execute();
        return mapWalkthrough(await db.selectFrom('orchestrator_lazy_walkthroughs').selectAll().where('id', '=', id).executeTakeFirstOrThrow());
    }

    async markObjectiveStatus(
        orchestratorRunId: EntityId<'orch'>,
        status: OrchestratorLazyObjectiveRecord['status']
    ): Promise<OrchestratorLazyObjectiveRecord | null> {
        const { db } = getPersistence();
        const now = nowIso();
        const row = await db
            .updateTable('orchestrator_lazy_objectives')
            .set({
                status,
                updated_at: now,
            })
            .where('orchestrator_run_id', '=', orchestratorRunId)
            .returningAll()
            .executeTakeFirst();
        return row ? mapObjective(row) : null;
    }

    async listObjectiveSegments(orchestratorRunId: EntityId<'orch'>): Promise<OrchestratorLazyObjectiveSegmentRecord[]> {
        const rows = await getPersistence()
            .db.selectFrom('orchestrator_lazy_objective_segments')
            .selectAll()
            .where('orchestrator_run_id', '=', orchestratorRunId)
            .orderBy('sequence', 'asc')
            .execute();
        return rows.map(mapSegment);
    }

    async listTasks(orchestratorRunId: EntityId<'orch'>): Promise<OrchestratorLazyTaskRecord[]> {
        const rows = await getPersistence()
            .db.selectFrom('orchestrator_lazy_tasks')
            .selectAll()
            .where('orchestrator_run_id', '=', orchestratorRunId)
            .orderBy('sequence', 'asc')
            .execute();
        return rows.map(mapTask);
    }

    async listCheckpoints(orchestratorRunId: EntityId<'orch'>): Promise<OrchestratorLazyInteractionCheckpointRecord[]> {
        const rows = await getPersistence()
            .db.selectFrom('orchestrator_lazy_interaction_checkpoints')
            .selectAll()
            .where('orchestrator_run_id', '=', orchestratorRunId)
            .orderBy('created_at', 'asc')
            .execute();
        return rows.map(mapCheckpoint);
    }

    async listTechDecisions(orchestratorRunId: EntityId<'orch'>): Promise<OrchestratorLazyTechDecisionRecord[]> {
        const rows = await getPersistence()
            .db.selectFrom('orchestrator_lazy_tech_decisions')
            .selectAll()
            .where('orchestrator_run_id', '=', orchestratorRunId)
            .orderBy('created_at', 'asc')
            .execute();
        return rows.map(mapDecision);
    }

    async listPackageAssessments(orchestratorRunId: EntityId<'orch'>): Promise<OrchestratorLazyPackageAssessmentRecord[]> {
        const rows = await getPersistence()
            .db.selectFrom('orchestrator_lazy_package_assessments')
            .selectAll()
            .where('orchestrator_run_id', '=', orchestratorRunId)
            .orderBy('created_at', 'asc')
            .execute();
        return rows.map(mapPackageAssessment);
    }

    async listWorkingArtifacts(orchestratorRunId: EntityId<'orch'>): Promise<OrchestratorLazyWorkingArtifactRecord[]> {
        const rows = await getPersistence()
            .db.selectFrom('orchestrator_lazy_working_artifacts')
            .selectAll()
            .where('orchestrator_run_id', '=', orchestratorRunId)
            .orderBy('created_at', 'asc')
            .execute();
        return rows.map(mapArtifact);
    }

    async listExecutionPhases(orchestratorRunId: EntityId<'orch'>): Promise<OrchestratorLazyExecutionPhaseRecord[]> {
        const rows = await getPersistence()
            .db.selectFrom('orchestrator_lazy_execution_phases')
            .selectAll()
            .where('orchestrator_run_id', '=', orchestratorRunId)
            .orderBy('sequence', 'asc')
            .execute();
        return rows.map(mapPhase);
    }

    async getWalkthrough(orchestratorRunId: EntityId<'orch'>): Promise<OrchestratorLazyWalkthroughRecord | null> {
        const row = await getPersistence()
            .db.selectFrom('orchestrator_lazy_walkthroughs')
            .selectAll()
            .where('orchestrator_run_id', '=', orchestratorRunId)
            .executeTakeFirst();
        return row ? mapWalkthrough(row) : null;
    }
}

export const orchestratorLazyStore = new OrchestratorLazyStore();
