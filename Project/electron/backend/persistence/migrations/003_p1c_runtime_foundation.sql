ALTER TABLE sessions
    ADD COLUMN workspace_fingerprint TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_workspace_fingerprint
    ON sessions(workspace_fingerprint);

ALTER TABLE conversations
    ADD COLUMN workspace_fingerprint TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_workspace_fingerprint
    ON conversations(workspace_fingerprint);

INSERT OR IGNORE INTO profiles (id, name, created_at, updated_at)
VALUES (
    'profile_local_default',
    'Local Default',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);

INSERT OR IGNORE INTO profiles (id, name, created_at, updated_at)
SELECT
    CASE
        WHEN profile_id = '__global__' THEN 'profile_local_default'
        ELSE profile_id
    END AS id,
    'Migrated Profile',
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM settings;

DROP INDEX IF EXISTS idx_settings_profile_key;

CREATE TABLE IF NOT EXISTS settings_v2 (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO settings_v2 (id, profile_id, key, value_json, updated_at)
SELECT
    id,
    CASE
        WHEN profile_id = '__global__' THEN 'profile_local_default'
        ELSE profile_id
    END AS profile_id,
    key,
    value_json,
    updated_at
FROM settings;

DROP TABLE settings;

ALTER TABLE settings_v2
    RENAME TO settings;

CREATE UNIQUE INDEX IF NOT EXISTS idx_settings_profile_key
    ON settings(profile_id, key);
