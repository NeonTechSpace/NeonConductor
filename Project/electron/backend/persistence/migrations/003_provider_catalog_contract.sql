ALTER TABLE provider_model_catalog
    ADD COLUMN supports_prompt_cache INTEGER NULL CHECK (supports_prompt_cache IN (0, 1));

ALTER TABLE provider_model_catalog
    ADD COLUMN tool_protocol TEXT NULL CHECK (
        tool_protocol IN ('openai_responses', 'openai_chat_completions', 'kilo_gateway', 'provider_native')
    );
