ALTER TABLE provider_model_catalog
    ADD COLUMN routed_api_family TEXT NULL CHECK (
        routed_api_family IN (
            'openai_compatible',
            'provider_native',
            'anthropic_messages',
            'google_generativeai'
        )
    );
