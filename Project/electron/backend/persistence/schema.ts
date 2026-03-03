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
}
