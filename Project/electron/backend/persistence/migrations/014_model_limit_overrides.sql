CREATE TABLE model_limit_overrides (
    provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    context_length INTEGER NULL CHECK (context_length IS NULL OR context_length > 0),
    max_output_tokens INTEGER NULL CHECK (max_output_tokens IS NULL OR max_output_tokens > 0),
    reason TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (provider_id, model_id),
    CHECK (context_length IS NOT NULL OR max_output_tokens IS NOT NULL)
);

CREATE INDEX idx_model_limit_overrides_provider_updated_at
    ON model_limit_overrides(provider_id, updated_at DESC);
