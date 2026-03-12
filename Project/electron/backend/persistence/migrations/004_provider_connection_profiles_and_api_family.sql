ALTER TABLE provider_model_catalog
    ADD COLUMN api_family TEXT NULL CHECK (
        api_family IN (
            'openai_compatible',
            'kilo_gateway',
            'provider_native',
            'anthropic_messages',
            'google_generativeai'
        )
    );

ALTER TABLE provider_model_catalog
    ADD COLUMN provider_settings_json TEXT NULL;
