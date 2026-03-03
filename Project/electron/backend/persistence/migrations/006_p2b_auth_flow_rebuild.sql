CREATE TABLE IF NOT EXISTS provider_auth_states_v2 (
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    auth_method TEXT NOT NULL CHECK (auth_method IN ('none', 'api_key', 'device_code', 'oauth_pkce', 'oauth_device')),
    auth_state TEXT NOT NULL CHECK (auth_state IN ('logged_out', 'pending', 'configured', 'authenticated', 'error', 'expired')),
    account_id TEXT NULL,
    organization_id TEXT NULL,
    token_expires_at TEXT NULL,
    last_error_code TEXT NULL,
    last_error_message TEXT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, provider_id)
);

INSERT INTO provider_auth_states_v2 (
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
    profile_id,
    provider_id,
    CASE
        WHEN auth_method IN ('none', 'api_key', 'device_code', 'oauth_pkce', 'oauth_device') THEN auth_method
        ELSE 'none'
    END AS auth_method,
    CASE
        WHEN auth_state IN ('logged_out', 'pending', 'configured', 'authenticated', 'error', 'expired') THEN auth_state
        ELSE 'logged_out'
    END AS auth_state,
    account_id,
    organization_id,
    token_expires_at,
    last_error_code,
    last_error_message,
    updated_at
FROM provider_auth_states;

DROP TABLE provider_auth_states;

ALTER TABLE provider_auth_states_v2
    RENAME TO provider_auth_states;

CREATE TABLE IF NOT EXISTS provider_auth_flows (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    flow_type TEXT NOT NULL CHECK (flow_type IN ('device_code', 'oauth_pkce', 'oauth_device')),
    auth_method TEXT NOT NULL CHECK (auth_method IN ('device_code', 'oauth_pkce', 'oauth_device')),
    nonce TEXT NULL,
    state TEXT NULL,
    code_verifier TEXT NULL,
    redirect_uri TEXT NULL,
    device_code TEXT NULL,
    user_code TEXT NULL,
    verification_uri TEXT NULL,
    poll_interval_seconds INTEGER NULL,
    expires_at TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'cancelled', 'expired', 'failed')),
    last_error_code TEXT NULL,
    last_error_message TEXT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    consumed_at TEXT NULL
);

INSERT INTO provider_auth_flows (
    id,
    profile_id,
    provider_id,
    flow_type,
    auth_method,
    nonce,
    state,
    code_verifier,
    redirect_uri,
    device_code,
    user_code,
    verification_uri,
    poll_interval_seconds,
    expires_at,
    status,
    last_error_code,
    last_error_message,
    created_at,
    updated_at,
    consumed_at
)
SELECT
    id,
    profile_id,
    provider_id,
    CASE
        WHEN flow_kind = 'device_code' THEN 'device_code'
        ELSE 'oauth_pkce'
    END AS flow_type,
    CASE
        WHEN flow_kind = 'device_code' THEN 'device_code'
        ELSE 'oauth_pkce'
    END AS auth_method,
    NULL AS nonce,
    state,
    code_verifier,
    redirect_uri,
    NULL AS device_code,
    NULL AS user_code,
    NULL AS verification_uri,
    NULL AS poll_interval_seconds,
    expires_at,
    CASE
        WHEN consumed_at IS NULL THEN 'pending'
        ELSE 'completed'
    END AS status,
    NULL AS last_error_code,
    NULL AS last_error_message,
    created_at,
    created_at AS updated_at,
    consumed_at
FROM provider_oauth_sessions;

DROP TABLE provider_oauth_sessions;

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_auth_flows_profile_provider_state
    ON provider_auth_flows(profile_id, provider_id, state);

CREATE INDEX IF NOT EXISTS idx_provider_auth_flows_expires_at
    ON provider_auth_flows(expires_at);

CREATE INDEX IF NOT EXISTS idx_provider_auth_flows_profile_provider_status
    ON provider_auth_flows(profile_id, provider_id, status);
