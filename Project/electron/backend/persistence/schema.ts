import type { Generated } from 'kysely';

export interface ProfilesTable {
    id: string;
    name: string;
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
    scope: string;
    kind: string;
    workspace_fingerprint: string | null;
    run_status: string;
    pending_completion_run_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface RunsTable {
    id: string;
    session_id: string;
    prompt: string;
    status: string;
    created_at: string;
    updated_at: string;
}

export interface PermissionsTable {
    id: string;
    policy: string;
    resource: string;
    decision: string;
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

export interface RuntimeEventsTable {
    sequence: Generated<number>;
    event_id: string;
    entity_type: string;
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
    scope: string;
    workspace_fingerprint: string | null;
    title: string;
    created_at: string;
    updated_at: string;
}

export interface ThreadsTable {
    id: string;
    conversation_id: string;
    title: string;
    created_at: string;
    updated_at: string;
}

export interface TagsTable {
    id: string;
    label: string;
    created_at: string;
    updated_at: string;
}

export interface ThreadTagsTable {
    thread_id: string;
    tag_id: string;
    created_at: string;
}

export interface DiffsTable {
    id: string;
    session_id: string;
    run_id: string | null;
    summary: string;
    payload_json: string;
    created_at: string;
    updated_at: string;
}

export interface ModeDefinitionsTable {
    id: string;
    profile_id: string;
    top_level_tab: string;
    mode_key: string;
    label: string;
    prompt_json: string;
    execution_policy_json: string;
    source: string;
    enabled: 0 | 1;
    created_at: string;
    updated_at: string;
}

export interface RulesetsTable {
    id: string;
    profile_id: string;
    workspace_fingerprint: string | null;
    name: string;
    body_markdown: string;
    source: string;
    enabled: 0 | 1;
    precedence: number;
    created_at: string;
    updated_at: string;
}

export interface SkillfilesTable {
    id: string;
    profile_id: string;
    workspace_fingerprint: string | null;
    name: string;
    body_markdown: string;
    source: string;
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

export interface SecretReferencesTable {
    id: string;
    profile_id: string;
    provider_id: string;
    secret_key_ref: string;
    secret_kind: string;
    status: string;
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

export interface DatabaseSchema {
    profiles: ProfilesTable;
    providers: ProvidersTable;
    provider_models: ProviderModelsTable;
    sessions: SessionsTable;
    runs: RunsTable;
    permissions: PermissionsTable;
    settings: SettingsTable;
    runtime_events: RuntimeEventsTable;
    tools_catalog: ToolsCatalogTable;
    mcp_servers: McpServersTable;
    schema_migrations: SchemaMigrationsTable;
    conversations: ConversationsTable;
    threads: ThreadsTable;
    tags: TagsTable;
    thread_tags: ThreadTagsTable;
    diffs: DiffsTable;
    mode_definitions: ModeDefinitionsTable;
    rulesets: RulesetsTable;
    skillfiles: SkillfilesTable;
    marketplace_packages: MarketplacePackagesTable;
    marketplace_assets: MarketplaceAssetsTable;
    kilo_account_snapshots: KiloAccountSnapshotsTable;
    kilo_org_snapshots: KiloOrgSnapshotsTable;
    secret_references: SecretReferencesTable;
    provider_auth_states: ProviderAuthStatesTable;
    provider_auth_flows: ProviderAuthFlowsTable;
    provider_model_catalog: ProviderModelCatalogTable;
    provider_discovery_snapshots: ProviderDiscoverySnapshotsTable;
}
