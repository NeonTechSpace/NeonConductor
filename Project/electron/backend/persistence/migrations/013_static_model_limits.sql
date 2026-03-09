UPDATE provider_model_catalog
SET
    context_length = CASE model_id
        WHEN 'openai/gpt-5' THEN 400000
        WHEN 'openai/gpt-5-mini' THEN 400000
        WHEN 'openai/gpt-5-codex' THEN 400000
        WHEN 'openai/codex-mini' THEN 400000
        WHEN 'zai/glm-4.5' THEN 128000
        WHEN 'zai/glm-4.5-air' THEN 128000
        WHEN 'zai/glm-4.5-flash' THEN 128000
        WHEN 'moonshot/kimi-for-coding' THEN 262144
        WHEN 'moonshot/kimi-k2' THEN 262144
        WHEN 'moonshot/kimi-latest' THEN 128000
        ELSE context_length
    END,
    raw_json = CASE model_id
        WHEN 'openai/gpt-5' THEN json_set(COALESCE(raw_json, '{}'), '$.max_output_tokens', 128000)
        WHEN 'openai/gpt-5-mini' THEN json_set(COALESCE(raw_json, '{}'), '$.max_output_tokens', 128000)
        WHEN 'openai/gpt-5-codex' THEN json_set(COALESCE(raw_json, '{}'), '$.max_output_tokens', 128000)
        WHEN 'openai/codex-mini' THEN json_set(COALESCE(raw_json, '{}'), '$.max_output_tokens', 128000)
        WHEN 'zai/glm-4.5' THEN json_set(COALESCE(raw_json, '{}'), '$.max_output_tokens', 96000)
        WHEN 'zai/glm-4.5-air' THEN json_set(COALESCE(raw_json, '{}'), '$.max_output_tokens', 96000)
        WHEN 'zai/glm-4.5-flash' THEN json_set(COALESCE(raw_json, '{}'), '$.max_output_tokens', 96000)
        ELSE raw_json
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE model_id IN (
    'openai/gpt-5',
    'openai/gpt-5-mini',
    'openai/gpt-5-codex',
    'openai/codex-mini',
    'zai/glm-4.5',
    'zai/glm-4.5-air',
    'zai/glm-4.5-flash',
    'moonshot/kimi-for-coding',
    'moonshot/kimi-k2',
    'moonshot/kimi-latest'
);
