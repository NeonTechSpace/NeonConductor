CREATE TABLE IF NOT EXISTS provider_auth_states (
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    auth_method TEXT NOT NULL,
    auth_state TEXT NOT NULL,
    account_id TEXT NULL,
    organization_id TEXT NULL,
    token_expires_at TEXT NULL,
    last_error_code TEXT NULL,
    last_error_message TEXT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, provider_id)
);

CREATE TABLE IF NOT EXISTS provider_oauth_sessions (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    flow_kind TEXT NOT NULL,
    state TEXT NOT NULL,
    code_verifier TEXT NOT NULL,
    redirect_uri TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    consumed_at TEXT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_oauth_sessions_profile_provider_state
    ON provider_oauth_sessions(profile_id, provider_id, state);

CREATE INDEX IF NOT EXISTS idx_provider_oauth_sessions_expires_at
    ON provider_oauth_sessions(expires_at);

CREATE TABLE IF NOT EXISTS provider_model_catalog (
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    label TEXT NOT NULL,
    upstream_provider TEXT NULL,
    is_free INTEGER NOT NULL CHECK (is_free IN (0, 1)),
    supports_tools INTEGER NOT NULL CHECK (supports_tools IN (0, 1)),
    supports_reasoning INTEGER NOT NULL CHECK (supports_reasoning IN (0, 1)),
    context_length INTEGER NULL,
    pricing_json TEXT NOT NULL,
    raw_json TEXT NOT NULL,
    source TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, provider_id, model_id)
);

CREATE INDEX IF NOT EXISTS idx_provider_model_catalog_profile_provider_label
    ON provider_model_catalog(profile_id, provider_id, label);

CREATE TABLE IF NOT EXISTS provider_discovery_snapshots (
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    etag TEXT NULL,
    payload_json TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    status TEXT NOT NULL,
    PRIMARY KEY (profile_id, provider_id, kind)
);

INSERT OR IGNORE INTO provider_model_catalog (
    profile_id,
    provider_id,
    model_id,
    label,
    upstream_provider,
    is_free,
    supports_tools,
    supports_reasoning,
    context_length,
    pricing_json,
    raw_json,
    source,
    updated_at
)
SELECT
    'profile_local_default',
    provider_id,
    id,
    label,
    provider_id,
    0,
    0,
    0,
    NULL,
    '{}',
    '{}',
    'seed',
    updated_at
FROM provider_models;

INSERT OR IGNORE INTO provider_auth_states (
    profile_id,
    provider_id,
    auth_method,
    auth_state,
    account_id,
    organization_id,
    token_expires_at,
    last_error_code,
    last_error_message,
    updated_at
)
SELECT
    'profile_local_default',
    id,
    'none',
    'logged_out',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM providers;