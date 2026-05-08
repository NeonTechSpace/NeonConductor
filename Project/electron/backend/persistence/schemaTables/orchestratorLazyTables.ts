export interface OrchestratorLazyObjectivesTable {
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
}

export interface OrchestratorLazyObjectiveSegmentsTable {
    id: string;
    orchestrator_run_id: string;
    objective_id: string;
    sequence: number;
    kind: string;
    content_markdown: string;
    created_at: string;
}

export interface OrchestratorLazyTasksTable {
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
}

export interface OrchestratorLazyInteractionCheckpointsTable {
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
}

export interface OrchestratorLazyTechDecisionsTable {
    id: string;
    orchestrator_run_id: string;
    task_id: string | null;
    title: string;
    decision_markdown: string;
    rationale_markdown: string;
    status: string;
    created_at: string;
    updated_at: string;
}

export interface OrchestratorLazyPackageAssessmentsTable {
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
}

export interface OrchestratorLazyWorkingArtifactsTable {
    id: string;
    orchestrator_run_id: string;
    task_id: string | null;
    kind: string;
    title: string;
    content_markdown: string;
    source_run_id: string | null;
    created_at: string;
}

export interface OrchestratorLazyExecutionPhasesTable {
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
}

export interface OrchestratorLazyWalkthroughsTable {
    id: string;
    orchestrator_run_id: string;
    content_markdown: string;
    validation_summary_markdown: string | null;
    risk_markdown: string | null;
    created_at: string;
}
