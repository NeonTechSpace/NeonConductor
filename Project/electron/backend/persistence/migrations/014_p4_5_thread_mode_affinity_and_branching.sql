PRAGMA foreign_keys = OFF;

CREATE TABLE IF NOT EXISTS threads_v4 (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    top_level_tab TEXT NOT NULL CHECK (top_level_tab IN ('chat', 'agent', 'orchestrator')),
    parent_thread_id TEXT NULL REFERENCES threads_v4(id) ON DELETE SET NULL,
    root_thread_id TEXT NOT NULL REFERENCES threads_v4(id) ON DELETE CASCADE,
    last_assistant_at TEXT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO threads_v4 (
    id,
    profile_id,
    conversation_id,
    title,
    top_level_tab,
    parent_thread_id,
    root_thread_id,
    last_assistant_at,
    created_at,
    updated_at
)
SELECT
    t.id,
    t.profile_id,
    t.conversation_id,
    t.title,
    COALESCE(
        (
            SELECT
                CASE
                    WHEN json_extract(re.payload_json, '$.topLevelTab') IN ('chat', 'agent', 'orchestrator')
                        THEN json_extract(re.payload_json, '$.topLevelTab')
                    ELSE NULL
                END
            FROM sessions s
            INNER JOIN runs r
                ON r.session_id = s.id
                AND r.profile_id = s.profile_id
            INNER JOIN runtime_events re
                ON re.entity_type = 'run'
                AND re.entity_id = r.id
                AND re.event_type = 'run.mode.context'
            WHERE s.profile_id = t.profile_id
              AND s.thread_id = t.id
            ORDER BY re.created_at ASC, re.sequence ASC
            LIMIT 1
        ),
        'chat'
    ) AS top_level_tab,
    NULL AS parent_thread_id,
    t.id AS root_thread_id,
    (
        SELECT MAX(m.updated_at)
        FROM sessions s2
        INNER JOIN messages m
            ON m.session_id = s2.id
            AND m.profile_id = s2.profile_id
        WHERE s2.profile_id = t.profile_id
          AND s2.thread_id = t.id
          AND m.role = 'assistant'
    ) AS last_assistant_at,
    t.created_at,
    t.updated_at
FROM threads t;

DROP TABLE threads;

ALTER TABLE threads_v4
    RENAME TO threads;

CREATE INDEX IF NOT EXISTS idx_threads_profile_conversation_updated_at
    ON threads(profile_id, conversation_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_threads_profile_mode_updated_at
    ON threads(profile_id, top_level_tab, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_threads_profile_root_updated_at
    ON threads(profile_id, root_thread_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_threads_profile_parent_updated_at
    ON threads(profile_id, parent_thread_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_threads_profile_last_assistant_at
    ON threads(profile_id, last_assistant_at DESC, updated_at DESC);

PRAGMA foreign_keys = ON;
