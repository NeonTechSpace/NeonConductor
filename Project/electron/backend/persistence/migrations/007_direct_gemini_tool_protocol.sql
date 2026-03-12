ALTER TABLE provider_model_catalog RENAME TO provider_model_catalog_old;

CREATE TABLE provider_model_catalog (
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
    supports_vision INTEGER NULL CHECK (supports_vision IN (0, 1)),
    supports_audio_input INTEGER NULL CHECK (supports_audio_input IN (0, 1)),
    supports_audio_output INTEGER NULL CHECK (supports_audio_output IN (0, 1)),
    input_modalities_json TEXT NULL,
    output_modalities_json TEXT NULL,
    prompt_family TEXT NULL,
    supports_prompt_cache INTEGER NULL CHECK (supports_prompt_cache IN (0, 1)),
    tool_protocol TEXT NULL CHECK (
        tool_protocol IN (
            'openai_responses',
            'openai_chat_completions',
            'kilo_gateway',
            'provider_native',
            'anthropic_messages',
            'google_generativeai'
        )
    ),
    api_family TEXT NULL CHECK (
        api_family IN (
            'openai_compatible',
            'kilo_gateway',
            'provider_native',
            'anthropic_messages',
            'google_generativeai'
        )
    ),
    provider_settings_json TEXT NULL,
    routed_api_family TEXT NULL CHECK (
        routed_api_family IN (
            'openai_compatible',
            'provider_native',
            'anthropic_messages',
            'google_generativeai'
        )
    ),
    PRIMARY KEY (profile_id, provider_id, model_id)
);

INSERT INTO provider_model_catalog (
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
    updated_at,
    supports_vision,
    supports_audio_input,
    supports_audio_output,
    input_modalities_json,
    output_modalities_json,
    prompt_family,
    supports_prompt_cache,
    tool_protocol,
    api_family,
    provider_settings_json,
    routed_api_family
)
SELECT
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
    updated_at,
    supports_vision,
    supports_audio_input,
    supports_audio_output,
    input_modalities_json,
    output_modalities_json,
    prompt_family,
    supports_prompt_cache,
    tool_protocol,
    api_family,
    provider_settings_json,
    routed_api_family
FROM provider_model_catalog_old;

DROP TABLE provider_model_catalog_old;

CREATE INDEX idx_provider_model_catalog_profile_provider_label
    ON provider_model_catalog(profile_id, provider_id, label);
