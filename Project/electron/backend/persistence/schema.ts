import type { Generated } from 'kysely';

export interface ProfilesTable {
    id: string;
    name: string;
    is_active: 0 | 1;
    created_at: string;
    updated_at: string;
}

export interface ProvidersTable {
    id: string;
    label: string;
    supports_byok: 0 | 1;
    created_at: string;
    updated_at: string;
}

export interface ProviderModelsTable {
    id: string;
    provider_id: string;
    label: string;
    created_at: string;
    updated_at: string;
}

export interface SessionsTable {
    id: string;
    profile_id: string;
    conversation_id: string;
    thread_id: string;
    kind: string;
    worktree_id: string | null;
    delegated_from_orchestrator_run_id: string | null;
    run_status: string;
    pending_completion_run_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface SessionAttachedSkillsTable {
    session_id: string;
    profile_id: string;
    asset_key: string;
    created_at: string;
}

export interface SessionAttachedRulesTable {
    session_id: string;
    profile_id: string;
    asset_key: string;
    created_at: string;
}

export interface MemoryRecordsTable {
    id: string;
    profile_id: string;
    memory_type: string;
    scope_kind: string;
    state: string;
    workspace_fingerprint: string | null;
    thread_id: string | null;
    run_id: string | null;
    created_by_kind: string;
    title: string;
    body_markdown: string;
    summary_text: string | null;
    metadata_json: string;
    superseded_by_memory_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface MemoryTemporalFactsTable {
    id: string;
    profile_id: string;
    subject_key: string;
    fact_kind: string;
    value_json: string;
    status: string;
    valid_from: string;
    valid_to: string | null;
    source_memory_id: string;
    source_run_id: string | null;
    derivation_version: number;
    confidence: number | null;
    created_at: string;
    updated_at: string;
}

export interface MemoryCausalLinksTable {
    id: string;
    profile_id: string;
    source_entity_kind: string;
    source_entity_id: string;
    target_entity_kind: string;
    target_entity_id: string;
    relation_type: string;
    source_memory_id: string;
    source_run_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface RunsTable {
    id: string;
    session_id: string;
    profile_id: string;
    prompt: string;
    status: string;
    provider_id: string | null;
    model_id: string | null;
    auth_method: string | null;
    reasoning_effort: string | null;
    reasoning_summary: string | null;
    reasoning_include_encrypted: 0 | 1 | null;
    cache_strategy: string | null;
    cache_key: string | null;
    cache_applied: 0 | 1 | null;
    cache_skip_reason: string | null;
    transport_requested_family: string | null;
    transport_selected: string | null;
    transport_degraded_reason: string | null;
    started_at: string | null;
    completed_at: string | null;
    aborted_at: string | null;
    error_code: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
}

export interface MessagesTable {
    id: string;
    profile_id: string;
    session_id: string;
    run_id: string;
    role: string;
    created_at: string;
    updated_at: string;
}

export interface MessagePartsTable {
    id: string;
    message_id: string;
    sequence: number;
    part_type: string;
    payload_json: string;
    created_at: string;
}

export interface MessageMediaTable {
    media_id: string;
    message_part_id: string;
    mime_type: string;
    width: number;
    height: number;
    byte_size: number;
    sha256: string;
    bytes_blob: Uint8Array;
    created_at: string;
}

export interface RunUsageTable {
    run_id: string;
    provider_id: string;
    model_id: string;
    input_tokens: number | null;
    output_tokens: number | null;
    cached_tokens: number | null;
    reasoning_tokens: number | null;
    total_tokens: number | null;
    latency_ms: number | null;
    cost_microunits: number | null;
    billed_via: string;
    recorded_at: string;
}

export interface PermissionsTable {
    id: string;
    profile_id: string;
    policy: string;
    resource: string;
    tool_id: string;
    workspace_fingerprint: string | null;
    scope_kind: string;
    summary_json: string;
    command_text: string | null;
    approval_candidates_json: string;
    selected_approval_resource: string | null;
    decision: string;
    resolved_scope: string | null;
    consumed_at: string | null;
    rationale: string | null;
    created_at: string;
    updated_at: string;
}

export interface SettingsTable {
    id: string;
    profile_id: string;
    key: string;
    value_json: string;
    updated_at: string;
}

export interface AppContextSettingsTable {
    id: string;
    enabled: 0 | 1;
    mode: 'percent';
    percent: number;
    updated_at: string;
}

export interface AppComposerMediaSettingsTable {
    id: string;
    max_image_attachments_per_message: number;
    image_compression_concurrency: number;
    updated_at: string;
}

export interface ProfileContextSettingsTable {
    profile_id: string;
    override_mode: 'inherit' | 'percent' | 'fixed_tokens';
    percent: number | null;
    fixed_input_tokens: number | null;
    updated_at: string;
}

export interface SessionContextCompactionsTable {
    session_id: string;
    profile_id: string;
    cutoff_message_id: string;
    summary_text: string;
    source: 'auto' | 'manual';
    threshold_tokens: number;
    estimated_input_tokens: number;
    created_at: string;
    updated_at: string;
}

export interface ModelLimitOverridesTable {
    provider_id: string;
    model_id: string;
    context_length: number | null;
    max_output_tokens: number | null;
    reason: string;
    updated_at: string;
}

export interface RuntimeEventsTable {
    sequence: Generated<number>;
    event_id: string;
    entity_type: string;
    domain: string;
    operation: string;
    entity_id: string;
    event_type: string;
    payload_json: string;
    created_at: string;
}

export interface ToolsCatalogTable {
    id: string;
    label: string;
    description: string;
    permission_policy: string;
    created_at: string;
    updated_at: string;
}

export interface McpServersTable {
    id: string;
    label: string;
    auth_mode: string;
    connection_state: string;
    auth_state: string;
    created_at: string;
    updated_at: string;
}

export interface SchemaMigrationsTable {
    name: string;
    applied_at: string;
}

export interface ConversationsTable {
    id: string;
    profile_id: string;
    scope: string;
    workspace_fingerprint: string | null;
    title: string;
    created_at: string;
    updated_at: string;
}

export interface WorkspaceRootsTable {
    fingerprint: string;
    profile_id: string;
    absolute_path: string;
    path_key: string;
    label: string;
    created_at: string;
    updated_at: string;
}

export interface ThreadsTable {
    id: string;
    profile_id: string;
    conversation_id: string;
    title: string;
    top_level_tab: string;
    parent_thread_id: string | null;
    root_thread_id: string;
    delegated_from_orchestrator_run_id: string | null;
    is_favorite: 0 | 1;
    execution_environment_mode: string;
    execution_branch: string | null;
    base_branch: string | null;
    worktree_id: string | null;
    last_assistant_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface TagsTable {
    id: string;
    profile_id: string;
    label: string;
    created_at: string;
    updated_at: string;
}

export interface ThreadTagsTable {
    profile_id: string;
    thread_id: string;
    tag_id: string;
    created_at: string;
}

export interface DiffsTable {
    id: string;
    profile_id: string;
    session_id: string;
    run_id: string | null;
    summary: string;
    payload_json: string;
    artifact_json: string;
    created_at: string;
    updated_at: string;
}

export interface CheckpointsTable {
    id: string;
    profile_id: string;
    session_id: string;
    run_id: string;
    diff_id: string;
    workspace_fingerprint: string;
    worktree_id: string | null;
    top_level_tab: string;
    mode_key: string;
    summary: string;
    created_at: string;
    updated_at: string;
}

export interface WorktreesTable {
    id: string;
    profile_id: string;
    workspace_fingerprint: string;
    branch: string;
    base_branch: string;
    absolute_path: string;
    path_key: string;
    label: string;
    status: string;
    created_at: string;
    updated_at: string;
    last_used_at: string;
}

export interface ModeDefinitionsTable {
    id: string;
    profile_id: string;
    top_level_tab: string;
    mode_key: string;
    label: string;
    asset_key: string;
    prompt_json: string;
    execution_policy_json: string;
    source: string;
    source_kind: string;
    scope: string;
    workspace_fingerprint: string | null;
    origin_path: string | null;
    description: string | null;
    tags_json: string;
    enabled: 0 | 1;
    precedence: number;
    created_at: string;
    updated_at: string;
}

export interface RulesetsTable {
    id: string;
    profile_id: string;
    asset_key: string;
    scope: string;
    workspace_fingerprint: string | null;
    preset_key: string | null;
    name: string;
    body_markdown: string;
    source: string;
    source_kind: string;
    origin_path: string | null;
    description: string | null;
    tags_json: string;
    activation_mode: string;
    enabled: 0 | 1;
    precedence: number;
    created_at: string;
    updated_at: string;
}

export interface SkillfilesTable {
    id: string;
    profile_id: string;
    asset_key: string;
    scope: string;
    workspace_fingerprint: string | null;
    preset_key: string | null;
    name: string;
    body_markdown: string;
    source: string;
    source_kind: string;
    origin_path: string | null;
    description: string | null;
    tags_json: string;
    enabled: 0 | 1;
    precedence: number;
    created_at: string;
    updated_at: string;
}

export interface MarketplacePackagesTable {
    id: string;
    package_kind: string;
    slug: string;
    version: string;
    enabled: 0 | 1;
    pinned: 0 | 1;
    source_json: string;
    installed_at: string;
    updated_at: string;
}

export interface MarketplaceAssetsTable {
    package_id: string;
    asset_kind: string;
    asset_id: string;
    created_at: string;
}

export interface KiloAccountSnapshotsTable {
    profile_id: string;
    account_id: string | null;
    display_name: string;
    email_masked: string;
    auth_state: string;
    token_expires_at: string | null;
    balance_amount: number | null;
    balance_currency: string | null;
    balance_updated_at: string | null;
    updated_at: string;
}

export interface KiloOrgSnapshotsTable {
    id: string;
    profile_id: string;
    organization_id: string;
    name: string;
    is_active: 0 | 1;
    entitlement_json: string;
    updated_at: string;
}

export interface ProviderSecretsTable {
    id: string;
    profile_id: string;
    provider_id: string;
    secret_kind: string;
    secret_value: string;
    updated_at: string;
}

export interface ProviderAuthStatesTable {
    profile_id: string;
    provider_id: string;
    auth_method: string;
    auth_state: string;
    account_id: string | null;
    organization_id: string | null;
    token_expires_at: string | null;
    last_error_code: string | null;
    last_error_message: string | null;
    updated_at: string;
}

export interface ProviderAuthFlowsTable {
    id: string;
    profile_id: string;
    provider_id: string;
    flow_type: string;
    auth_method: string;
    nonce: string | null;
    state: string | null;
    code_verifier: string | null;
    redirect_uri: string | null;
    device_code: string | null;
    user_code: string | null;
    verification_uri: string | null;
    poll_interval_seconds: number | null;
    expires_at: string;
    status: string;
    last_error_code: string | null;
    last_error_message: string | null;
    created_at: string;
    updated_at: string;
    consumed_at: string | null;
}

export interface ProviderModelCatalogTable {
    profile_id: string;
    provider_id: string;
    model_id: string;
    label: string;
    upstream_provider: string | null;
    is_free: 0 | 1;
    supports_tools: 0 | 1;
    supports_reasoning: 0 | 1;
    supports_vision: 0 | 1 | null;
    supports_audio_input: 0 | 1 | null;
    supports_audio_output: 0 | 1 | null;
    supports_prompt_cache: 0 | 1 | null;
    tool_protocol: string | null;
    api_family: string | null;
    routed_api_family: string | null;
    input_modalities_json: string | null;
    output_modalities_json: string | null;
    prompt_family: string | null;
    provider_settings_json: string | null;
    context_length: number | null;
    pricing_json: string;
    raw_json: string;
    source: string;
    updated_at: string;
}

export interface ProviderDiscoverySnapshotsTable {
    profile_id: string;
    provider_id: string;
    kind: string;
    etag: string | null;
    payload_json: string;
    fetched_at: string;
    status: string;
}

export interface KiloModelRoutingPreferencesTable {
    profile_id: string;
    provider_id: 'kilo';
    model_id: string;
    routing_mode: 'dynamic' | 'pinned';
    sort: 'default' | 'price' | 'throughput' | 'latency' | null;
    pinned_provider_id: string | null;
    updated_at: string;
}

export interface PlanRecordsTable {
    id: string;
    profile_id: string;
    session_id: string;
    top_level_tab: string;
    mode_key: string;
    status: string;
    source_prompt: string;
    summary_markdown: string;
    questions_json: string;
    answers_json: string;
    workspace_fingerprint: string | null;
    implementation_run_id: string | null;
    orchestrator_run_id: string | null;
    approved_at: string | null;
    implemented_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface PlanItemsTable {
    id: string;
    plan_id: string;
    sequence: number;
    description: string;
    status: string;
    run_id: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
}

export interface OrchestratorRunsTable {
    id: string;
    profile_id: string;
    session_id: string;
    plan_id: string;
    status: string;
    execution_strategy: string;
    active_step_index: number | null;
    started_at: string;
    completed_at: string | null;
    aborted_at: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
}

export interface OrchestratorStepsTable {
    id: string;
    orchestrator_run_id: string;
    sequence: number;
    description: string;
    status: string;
    child_thread_id: string | null;
    child_session_id: string | null;
    active_run_id: string | null;
    run_id: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
}

export interface PermissionPolicyOverridesTable {
    profile_id: string;
    scope_key: string;
    resource: string;
    policy: string;
    created_at: string;
    updated_at: string;
}

export interface DatabaseSchema {
    profiles: ProfilesTable;
    providers: ProvidersTable;
    provider_models: ProviderModelsTable;
    sessions: SessionsTable;
    session_attached_skills: SessionAttachedSkillsTable;
    session_attached_rules: SessionAttachedRulesTable;
    memory_records: MemoryRecordsTable;
    memory_temporal_facts: MemoryTemporalFactsTable;
    memory_causal_links: MemoryCausalLinksTable;
    runs: RunsTable;
    messages: MessagesTable;
    message_parts: MessagePartsTable;
    message_media: MessageMediaTable;
    run_usage: RunUsageTable;
    permissions: PermissionsTable;
    settings: SettingsTable;
    app_context_settings: AppContextSettingsTable;
    app_composer_media_settings: AppComposerMediaSettingsTable;
    profile_context_settings: ProfileContextSettingsTable;
    session_context_compactions: SessionContextCompactionsTable;
    model_limit_overrides: ModelLimitOverridesTable;
    runtime_events: RuntimeEventsTable;
    tools_catalog: ToolsCatalogTable;
    mcp_servers: McpServersTable;
    schema_migrations: SchemaMigrationsTable;
    conversations: ConversationsTable;
    workspace_roots: WorkspaceRootsTable;
    threads: ThreadsTable;
    tags: TagsTable;
    thread_tags: ThreadTagsTable;
    diffs: DiffsTable;
    checkpoints: CheckpointsTable;
    worktrees: WorktreesTable;
    mode_definitions: ModeDefinitionsTable;
    rulesets: RulesetsTable;
    skillfiles: SkillfilesTable;
    marketplace_packages: MarketplacePackagesTable;
    marketplace_assets: MarketplaceAssetsTable;
    kilo_account_snapshots: KiloAccountSnapshotsTable;
    kilo_org_snapshots: KiloOrgSnapshotsTable;
    provider_secrets: ProviderSecretsTable;
    provider_auth_states: ProviderAuthStatesTable;
    provider_auth_flows: ProviderAuthFlowsTable;
    provider_model_catalog: ProviderModelCatalogTable;
    provider_discovery_snapshots: ProviderDiscoverySnapshotsTable;
    kilo_model_routing_preferences: KiloModelRoutingPreferencesTable;
    plan_records: PlanRecordsTable;
    plan_items: PlanItemsTable;
    orchestrator_runs: OrchestratorRunsTable;
    orchestrator_steps: OrchestratorStepsTable;
    permission_policy_overrides: PermissionPolicyOverridesTable;
}
