ALTER TABLE "diffs"
    ADD COLUMN artifact_json TEXT NOT NULL DEFAULT '{}';

CREATE TABLE "checkpoints" (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    run_id TEXT NOT NULL,
    diff_id TEXT NOT NULL,
    workspace_fingerprint TEXT NOT NULL,
    top_level_tab TEXT NOT NULL,
    mode_key TEXT NOT NULL,
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
    FOREIGN KEY (diff_id) REFERENCES diffs(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_checkpoints_profile_run
    ON "checkpoints"(profile_id, run_id);

CREATE INDEX idx_checkpoints_profile_session_created_at
    ON "checkpoints"(profile_id, session_id, created_at DESC);
