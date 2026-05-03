export interface ResearchCheckoutRecordsTable {
    id: string;
    profile_id: string;
    canonical_key: string;
    sanitized_url: string;
    repo_name: string;
    root_policy: 'os_temp' | 'custom_path' | 'current_workspace';
    root_absolute_path: string;
    resolved_checkout_path: string;
    detected_vcs: 'git' | 'jj' | 'unknown';
    effective_vcs: 'git' | 'jj' | 'unknown';
    checkout_action: 'reuse_existing' | 'clone_required';
    update_action: 'none' | 'fetch_only' | 'fast_forward' | 'pause_for_review' | 'unavailable';
    target_switch_action: 'none' | 'checkout_branch' | 'checkout_commit' | 'checkout_pull_request' | 'pause_for_review';
    repo_workflow_state_json: string;
    mutation_guardrail_json: string;
    last_checked_at: string;
    created_at: string;
    updated_at: string;
}
