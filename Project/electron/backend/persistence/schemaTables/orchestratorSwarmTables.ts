export interface OrchestratorSwarmLanesTable {
    id: string;
    orchestrator_run_id: string;
    step_id: string | null;
    sequence: number;
    role: string;
    status: string;
    child_thread_id: string | null;
    child_session_id: string | null;
    active_run_id: string | null;
    run_id: string | null;
    prompt_markdown: string;
    result_summary_markdown: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
}

export interface OrchestratorSwarmContextEntriesTable {
    id: string;
    orchestrator_run_id: string;
    source_lane_id: string | null;
    sequence: number;
    entry_kind: string;
    content_markdown: string;
    created_at: string;
}
