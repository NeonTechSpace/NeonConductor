CREATE TABLE app_context_settings (
    id TEXT PRIMARY KEY,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    mode TEXT NOT NULL CHECK (mode IN ('percent')),
    percent INTEGER NOT NULL CHECK (percent BETWEEN 1 AND 100),
    updated_at TEXT NOT NULL
);

INSERT INTO app_context_settings (id, enabled, mode, percent, updated_at)
VALUES ('global', 1, 'percent', 90, CURRENT_TIMESTAMP);

CREATE TABLE profile_context_settings (
    profile_id TEXT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    override_mode TEXT NOT NULL CHECK (override_mode IN ('inherit', 'percent', 'fixed_tokens')),
    percent INTEGER NULL CHECK (percent IS NULL OR percent BETWEEN 1 AND 100),
    fixed_input_tokens INTEGER NULL CHECK (fixed_input_tokens IS NULL OR fixed_input_tokens > 0),
    updated_at TEXT NOT NULL
);

CREATE TABLE session_context_compactions (
    session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    cutoff_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('auto', 'manual')),
    threshold_tokens INTEGER NOT NULL,
    estimated_input_tokens INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_session_context_compactions_profile_session
    ON session_context_compactions(profile_id, session_id);
