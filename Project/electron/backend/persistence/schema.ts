import type { FlowDefinitionOriginKind } from '@/app/backend/runtime/contracts/enums';

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

export interface ProviderEmbeddingModelCatalogTable {
    profile_id: string;
    provider_id: string;
    model_id: string;
    label: string;
    dimensions: number;
    max_input_tokens: number | null;
    input_price: number | null;
    source: string;
    updated_at: string;
    raw_json: string;
}

export interface SessionsTable {
    id: string;
    profile_id: string;
    conversation_id: string;
    thread_id: string;
    kind: string;
    sandbox_id: string | null;
    delegated_from_orchestrator_run_id: string | null;
    delegated_from_plan_research_batch_id: string | null;
    delegated_from_flow_instance_id: string | null;
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
    temporal_subject_key: string | null;
    superseded_by_memory_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface MemoryRevisionRecordsTable {
    id: string;
    profile_id: string;
    previous_memory_id: string;
    replacement_memory_id: string;
    revision_reason: string;
    created_at: string;
}

export interface MemoryConsolidationRecordsTable {
    id: string;
    profile_id: string;
    subject_key: string;
    target_memory_type: string;
    scope_kind: string;
    source_consolidation: string;
    state: string;
    candidate_title: string;
    candidate_summary_text: string | null;
    candidate_body_markdown: string;
    evidence_memory_ids_json: string;
    materialized_memory_id: string | null;
    source_digest: string;
    created_at: string;
    updated_at: string;
}

export interface MemoryEvidenceRecordsTable {
    id: string;
    profile_id: string;
    memory_id: string;
    sequence: number;
    evidence_kind: 'run' | 'message' | 'message_part' | 'tool_result_artifact';
    label: string;
    excerpt_text: string | null;
    source_run_id: string | null;
    source_message_id: string | null;
    source_message_part_id: string | null;
    metadata_json: string;
    created_at: string;
}

export interface MemoryEmbeddingRecordsTable {
    id: string;
    profile_id: string;
    memory_id: string;
    provider_id: string;
    model_id: string;
    source_digest: string;
    indexed_text: string;
    embedding_json: string;
    dimensions: number;
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

export interface MemoryGraphEdgesTable {
    id: string;
    profile_id: string;
    source_memory_id: string;
    target_memory_id: string;
    edge_kind: string;
    weight: number;
    derivation_version: number;
    created_at: string;
    updated_at: string;
}

export interface MemoryRetrievalUsageRecordsTable {
    profile_id: string;
    memory_id: string;
    reuse_count: number;
    updated_at: string;
}

export interface RunsTable {
    id: string;
    session_id: string;
    profile_id: string;
    plan_id: string | null;
    plan_revision_id: string | null;
    plan_phase_id: string | null;
    plan_phase_revision_id: string | null;
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

export interface ConversationAttachmentsTable {
    id: string;
    profile_id: string;
    session_id: string | null;
    message_part_id: string | null;
    kind: string;
    file_name: string | null;
    mime_type: string;
    sha256: string;
    byte_size: number;
    width: number | null;
    height: number | null;
    encoding: string | null;
    bytes_blob: Uint8Array | null;
    text_content: string | null;
    created_at: string;
    updated_at: string;
}

export interface SessionDevBrowserStateTable {
    session_id: string;
    profile_id: string;
    scheme: string | null;
    host: string | null;
    port: number | null;
    path: string | null;
    source_kind: string | null;
    browser_availability: string;
    validation_json: string | null;
    current_page_json: string | null;
    picker_active: 0 | 1;
    created_at: string;
    updated_at: string;
}

export interface SessionDevBrowserSelectionsTable {
    id: string;
    profile_id: string;
    session_id: string;
    page_identity: string;
    page_url: string;
    page_title: string | null;
    selector_json: string;
    ancestry_trail_json: string;
    accessible_label: string | null;
    accessible_role: string | null;
    text_excerpt: string | null;
    bounds_json: string;
    crop_attachment_id: string | null;
    enrichment_mode: string;
    stale: 0 | 1;
    created_at: string;
}

export interface SessionDevBrowserCommentDraftsTable {
    id: string;
    profile_id: string;
    session_id: string;
    selection_id: string;
    page_identity: string;
    comment_text: string;
    inclusion_state: string;
    sequence: number;
    stale: 0 | 1;
    created_at: string;
    updated_at: string;
}

export interface SessionOutboxEntriesTable {
    id: string;
    profile_id: string;
    session_id: string;
    state: string;
    sequence: number;
    prompt: string;
    steering_snapshot_json: string;
    browser_context_packet_json: string | null;
    latest_run_contract_json: string | null;
    latest_receipt_id: string | null;
    active_permission_request_id: string | null;
    paused_reason: string | null;
    created_at: string;
    updated_at: string;
}

export interface SessionOutboxEntryAttachmentsTable {
    outbox_entry_id: string;
    attachment_id: string;
    sequence: number;
    created_at: string;
}

export interface ExecutionReceiptsTable {
    id: string;
    profile_id: string;
    session_id: string;
    run_id: string;
    contract_json: string;
    browser_context_packet_json: string | null;
    approvals_used_json: string;
    tools_invoked_json: string;
    memory_hit_count: number;
    cache_result_json: string;
    usage_summary_json: string;
    terminal_outcome_json: string;
    created_at: string;
}

export interface ToolResultArtifactsTable {
    message_part_id: string;
    profile_id: string;
    session_id: string;
    run_id: string;
    tool_name: string;
    artifact_kind: 'command_output' | 'file_read' | 'directory_listing' | 'search_results';
    content_type: string;
    storage_kind: 'text_inline_db' | 'file_path';
    raw_text: string | null;
    file_path: string | null;
    total_bytes: number;
    total_lines: number;
    preview_text: string;
    preview_strategy: 'head_tail' | 'head_only' | 'bounded_list';
    metadata_json: string;
    created_at: string;
    updated_at: string;
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
    flow_instance_id: string | null;
    flow_step_index: number | null;
    flow_step_id: string | null;
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

export interface AppPromptLayerSettingsTable {
    id: string;
    global_instructions: string;
    updated_at: string;
}

export interface BuiltInModePromptOverridesTable {
    profile_id: string;
    top_level_tab: string;
    mode_key: string;
    prompt_json: string;
    prompt_layer_overrides_json: string;
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

export interface SessionContextCompactionPreparationsTable {
    session_id: string;
    profile_id: string;
    cutoff_message_id: string;
    source_digest: string;
    summary_text: string;
    summarizer_provider_id: string;
    summarizer_model_id: string;
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
    transport: string;
    command: string;
    args_json: string;
    working_directory_mode: string;
    fixed_working_directory: string | null;
    timeout_ms: number | null;
    enabled: 0 | 1;
    connection_state: string;
    last_error: string | null;
    connected_at: string | null;
    tool_discovery_state: string;
    created_at: string;
    updated_at: string;
}

export interface McpServerToolsTable {
    server_id: string;
    tool_name: string;
    description: string | null;
    input_schema_json: string;
    mutability: string;
    updated_at: string;
}

export interface McpServerEnvSecretsTable {
    server_id: string;
    env_key: string;
    secret_value: string;
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
    delegated_from_plan_research_batch_id: string | null;
    delegated_from_flow_instance_id: string | null;
    is_favorite: 0 | 1;
    execution_environment_mode: string;
    sandbox_id: string | null;
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
    thread_id: string;
    run_id: string | null;
    diff_id: string | null;
    workspace_fingerprint: string;
    sandbox_id: string | null;
    execution_target_key: string;
    execution_target_kind: string;
    execution_target_label: string;
    created_by_kind: string;
    checkpoint_kind: string;
    milestone_title: string | null;
    snapshot_file_count: number;
    top_level_tab: string;
    mode_key: string;
    summary: string;
    created_at: string;
    updated_at: string;
}

export interface CheckpointSnapshotBlobsTable {
    sha256: string;
    byte_size: number;
    storage_state: 'inline' | 'packed';
    bytes_blob: Uint8Array | null;
    created_at: string;
    updated_at: string;
}

export interface CheckpointBlobPacksTable {
    id: string;
    profile_id: string;
    trigger_kind: 'automatic' | 'manual';
    compression_kind: 'brotli';
    blob_count: number;
    original_byte_size: number;
    packed_byte_size: number;
    pack_bytes_blob: Uint8Array;
    created_at: string;
}

export interface CheckpointBlobPackMembersTable {
    blob_sha256: string;
    pack_id: string;
    byte_offset: number;
    compressed_byte_size: number;
    original_byte_size: number;
    compression_kind: 'brotli';
    created_at: string;
}

export interface CheckpointCompactionRunsTable {
    id: string;
    profile_id: string;
    trigger_kind: 'automatic' | 'manual';
    status: 'success' | 'failed' | 'noop';
    message: string | null;
    blob_count_before: number;
    blob_count_after: number;
    bytes_before: number;
    bytes_after: number;
    blobs_compacted: number;
    database_reclaimed: 0 | 1;
    started_at: string;
    completed_at: string;
}

export interface CheckpointSnapshotEntriesTable {
    checkpoint_id: string;
    relative_path: string;
    blob_sha256: string;
    byte_size: number;
    created_at: string;
}

export interface CheckpointChangesetsTable {
    id: string;
    profile_id: string;
    checkpoint_id: string;
    source_changeset_id: string | null;
    session_id: string;
    thread_id: string;
    run_id: string | null;
    execution_target_key: string;
    execution_target_kind: string;
    execution_target_label: string;
    created_by_kind: string;
    changeset_kind: string;
    summary: string;
    change_count: number;
    created_at: string;
    updated_at: string;
}

export interface CheckpointChangesetEntriesTable {
    changeset_id: string;
    relative_path: string;
    change_kind: string;
    before_blob_sha256: string | null;
    before_byte_size: number | null;
    after_blob_sha256: string | null;
    after_byte_size: number | null;
    created_at: string;
}

export interface SandboxesTable {
    id: string;
    profile_id: string;
    workspace_fingerprint: string;
    absolute_path: string;
    path_key: string;
    label: string;
    status: string;
    creation_strategy: 'clone' | 'copy';
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
    prompt_layer_overrides_json: string;
    execution_policy_json: string;
    source: string;
    source_kind: string;
    scope: string;
    workspace_fingerprint: string | null;
    origin_path: string | null;
    description: string | null;
    when_to_use: string | null;
    groups_json: string;
    tags_json: string;
    enabled: 0 | 1;
    precedence: number;
    created_at: string;
    updated_at: string;
}

export interface ModeDraftsTable {
    id: string;
    profile_id: string;
    scope: string;
    workspace_fingerprint: string | null;
    source_kind: string;
    source_text: string | null;
    draft_json: string;
    validation_state: string;
    validation_errors_json: string;
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
    dynamic_context_sources_json: string;
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
}

export interface PlanRevisionsTable {
    id: string;
    plan_id: string;
    variant_id: string;
    revision_number: number;
    summary_markdown: string;
    created_by_kind: string;
    created_at: string;
    previous_revision_id: string | null;
    superseded_at: string | null;
}

export interface PlanPhasesTable {
    id: string;
    plan_id: string;
    plan_revision_id: string;
    plan_variant_id: string;
    phase_outline_id: string;
    phase_sequence: number;
    title: string;
    goal_markdown: string;
    exit_criteria_markdown: string;
    status: string;
    current_revision_id: string;
    approved_revision_id: string | null;
    implemented_revision_id: string | null;
    implementation_run_id: string | null;
    orchestrator_run_id: string | null;
    created_at: string;
    updated_at: string;
    approved_at: string | null;
    implemented_at: string | null;
}

export interface PlanPhaseRevisionsTable {
    id: string;
    plan_phase_id: string;
    revision_number: number;
    summary_markdown: string;
    created_by_kind: string;
    source_verification_id: string | null;
    created_at: string;
    previous_revision_id: string | null;
    superseded_at: string | null;
}

export interface PlanPhaseRevisionItemsTable {
    id: string;
    plan_phase_revision_id: string;
    sequence: number;
    description: string;
    created_at: string;
}

export interface PlanPhaseVerificationsTable {
    id: string;
    plan_phase_id: string;
    plan_phase_revision_id: string;
    outcome: string;
    summary_markdown: string;
    created_at: string;
}

export interface PlanPhaseVerificationDiscrepanciesTable {
    id: string;
    verification_id: string;
    sequence: number;
    title: string;
    details_markdown: string;
    created_at: string;
}

export interface PlanRevisionAdvancedSnapshotsTable {
    plan_revision_id: string;
    evidence_markdown: string;
    observations_markdown: string;
    root_cause_markdown: string;
    phases_json: string;
    created_at: string;
}

export interface PlanResearchBatchesTable {
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
}

export interface PlanResearchWorkersTable {
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
}

export interface PlanRevisionEvidenceAttachmentsTable {
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
}

export interface PlanRevisionItemsTable {
    id: string;
    plan_revision_id: string;
    sequence: number;
    description: string;
    created_at: string;
}

export interface PlanVariantsTable {
    id: string;
    plan_id: string;
    name: string;
    created_from_revision_id: string | null;
    created_at: string;
    archived_at: string | null;
}

export interface PlanFollowUpsTable {
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

export interface FlowDefinitionsTable {
    id: string;
    profile_id: string;
    origin_kind: FlowDefinitionOriginKind;
    workspace_fingerprint: string | null;
    source_branch_workflow_id: string | null;
    label: string;
    description: string | null;
    enabled: 0 | 1;
    trigger_kind: string;
    steps_json: string;
    created_at: string;
    updated_at: string;
}

export interface FlowInstancesTable {
    id: string;
    profile_id: string;
    flow_definition_id: string;
    status: string;
    current_step_index: number;
    definition_snapshot_json: string;
    execution_context_json: string | null;
    current_run_id: string | null;
    current_child_thread_id: string | null;
    current_child_session_id: string | null;
    current_plan_id: string | null;
    current_plan_revision_id: string | null;
    current_plan_phase_id: string | null;
    current_plan_phase_revision_id: string | null;
    awaiting_approval_kind: string | null;
    awaiting_approval_step_index: number | null;
    awaiting_approval_step_id: string | null;
    awaiting_permission_request_id: string | null;
    awaiting_plan_id: string | null;
    awaiting_plan_revision_id: string | null;
    awaiting_required_plan_status: string | null;
    last_error_message: string | null;
    retry_source_flow_instance_id: string | null;
    started_at: string | null;
    finished_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface OrchestratorRunsTable {
    id: string;
    profile_id: string;
    session_id: string;
    plan_id: string;
    plan_revision_id: string;
    plan_phase_id: string | null;
    plan_phase_revision_id: string | null;
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
    memory_revision_records: MemoryRevisionRecordsTable;
    memory_consolidation_records: MemoryConsolidationRecordsTable;
    memory_evidence_records: MemoryEvidenceRecordsTable;
    memory_embedding_records: MemoryEmbeddingRecordsTable;
    memory_temporal_facts: MemoryTemporalFactsTable;
    memory_causal_links: MemoryCausalLinksTable;
    memory_graph_edges: MemoryGraphEdgesTable;
    memory_retrieval_usage_records: MemoryRetrievalUsageRecordsTable;
    runs: RunsTable;
    messages: MessagesTable;
    message_parts: MessagePartsTable;
    message_media: MessageMediaTable;
    conversation_attachments: ConversationAttachmentsTable;
    session_dev_browser_state: SessionDevBrowserStateTable;
    session_dev_browser_selections: SessionDevBrowserSelectionsTable;
    session_dev_browser_comment_drafts: SessionDevBrowserCommentDraftsTable;
    session_outbox_entries: SessionOutboxEntriesTable;
    session_outbox_entry_attachments: SessionOutboxEntryAttachmentsTable;
    execution_receipts: ExecutionReceiptsTable;
    tool_result_artifacts: ToolResultArtifactsTable;
    run_usage: RunUsageTable;
    permissions: PermissionsTable;
    settings: SettingsTable;
    app_context_settings: AppContextSettingsTable;
    app_prompt_layer_settings: AppPromptLayerSettingsTable;
    built_in_mode_prompt_overrides: BuiltInModePromptOverridesTable;
    app_composer_media_settings: AppComposerMediaSettingsTable;
    profile_context_settings: ProfileContextSettingsTable;
    session_context_compactions: SessionContextCompactionsTable;
    session_context_compaction_preparations: SessionContextCompactionPreparationsTable;
    model_limit_overrides: ModelLimitOverridesTable;
    runtime_events: RuntimeEventsTable;
    tools_catalog: ToolsCatalogTable;
    mcp_servers: McpServersTable;
    mcp_server_tools: McpServerToolsTable;
    mcp_server_env_secrets: McpServerEnvSecretsTable;
    schema_migrations: SchemaMigrationsTable;
    conversations: ConversationsTable;
    workspace_roots: WorkspaceRootsTable;
    threads: ThreadsTable;
    tags: TagsTable;
    thread_tags: ThreadTagsTable;
    diffs: DiffsTable;
    checkpoints: CheckpointsTable;
    checkpoint_snapshot_blobs: CheckpointSnapshotBlobsTable;
    checkpoint_blob_packs: CheckpointBlobPacksTable;
    checkpoint_blob_pack_members: CheckpointBlobPackMembersTable;
    checkpoint_compaction_runs: CheckpointCompactionRunsTable;
    checkpoint_snapshot_entries: CheckpointSnapshotEntriesTable;
    checkpoint_changesets: CheckpointChangesetsTable;
    checkpoint_changeset_entries: CheckpointChangesetEntriesTable;
    sandboxes: SandboxesTable;
    mode_definitions: ModeDefinitionsTable;
    mode_drafts: ModeDraftsTable;
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
    provider_embedding_model_catalog: ProviderEmbeddingModelCatalogTable;
    provider_discovery_snapshots: ProviderDiscoverySnapshotsTable;
    kilo_model_routing_preferences: KiloModelRoutingPreferencesTable;
    plan_records: PlanRecordsTable;
    plan_revisions: PlanRevisionsTable;
    plan_revision_advanced_snapshots: PlanRevisionAdvancedSnapshotsTable;
    plan_phases: PlanPhasesTable;
    plan_phase_revisions: PlanPhaseRevisionsTable;
    plan_phase_revision_items: PlanPhaseRevisionItemsTable;
    plan_phase_verifications: PlanPhaseVerificationsTable;
    plan_phase_verification_discrepancies: PlanPhaseVerificationDiscrepanciesTable;
    plan_research_batches: PlanResearchBatchesTable;
    plan_research_workers: PlanResearchWorkersTable;
    plan_revision_evidence_attachments: PlanRevisionEvidenceAttachmentsTable;
    plan_revision_items: PlanRevisionItemsTable;
    plan_variants: PlanVariantsTable;
    plan_follow_ups: PlanFollowUpsTable;
    plan_items: PlanItemsTable;
    flow_definitions: FlowDefinitionsTable;
    flow_instances: FlowInstancesTable;
    orchestrator_runs: OrchestratorRunsTable;
    orchestrator_steps: OrchestratorStepsTable;
    permission_policy_overrides: PermissionPolicyOverridesTable;
}
