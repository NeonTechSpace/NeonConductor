import type { ProfileStoreDb } from '@/app/backend/persistence/stores/profile/profileStoreHelpers/types';

async function copyProviderCatalog(
    tx: ProfileStoreDb,
    sourceProfileId: string,
    targetProfileId: string,
    timestamp: string
): Promise<void> {
    const rows = await tx
        .selectFrom('provider_model_catalog')
        .select([
            'provider_id',
            'model_id',
            'label',
            'upstream_provider',
            'is_free',
            'supports_tools',
            'supports_reasoning',
            'supports_vision',
            'supports_audio_input',
            'supports_audio_output',
            'supports_prompt_cache',
            'tool_protocol',
            'api_family',
            'routed_api_family',
            'input_modalities_json',
            'output_modalities_json',
            'prompt_family',
            'provider_settings_json',
            'context_length',
            'pricing_json',
            'raw_json',
            'source',
        ])
        .where('profile_id', '=', sourceProfileId)
        .execute();

    if (rows.length > 0) {
        await tx
            .insertInto('provider_model_catalog')
            .values(
                rows.map((row) => ({
                    profile_id: targetProfileId,
                    provider_id: row.provider_id,
                    model_id: row.model_id,
                    label: row.label,
                    upstream_provider: row.upstream_provider,
                    is_free: row.is_free,
                    supports_tools: row.supports_tools,
                    supports_reasoning: row.supports_reasoning,
                    supports_vision: row.supports_vision,
                    supports_audio_input: row.supports_audio_input,
                    supports_audio_output: row.supports_audio_output,
                    supports_prompt_cache: row.supports_prompt_cache,
                    tool_protocol: row.tool_protocol,
                    api_family: row.api_family,
                    routed_api_family: row.routed_api_family,
                    input_modalities_json: row.input_modalities_json,
                    output_modalities_json: row.output_modalities_json,
                    prompt_family: row.prompt_family,
                    provider_settings_json: row.provider_settings_json,
                    context_length: row.context_length,
                    pricing_json: row.pricing_json,
                    raw_json: row.raw_json,
                    source: row.source,
                    updated_at: timestamp,
                }))
            )
            .execute();
        return;
    }

    const providerModels = await tx
        .selectFrom('provider_models')
        .select(['provider_id', 'id', 'label'])
        .orderBy('provider_id', 'asc')
        .orderBy('id', 'asc')
        .execute();

    if (providerModels.length === 0) {
        return;
    }

    await tx
        .insertInto('provider_model_catalog')
        .values(
            providerModels.map((model) => ({
                profile_id: targetProfileId,
                provider_id: model.provider_id,
                model_id: model.id,
                label: model.label,
                upstream_provider: model.provider_id,
                is_free: 0,
                supports_tools: 0,
                supports_reasoning: 0,
                supports_vision: 0,
                supports_audio_input: 0,
                supports_audio_output: 0,
                supports_prompt_cache: null,
                tool_protocol: null,
                api_family: null,
                routed_api_family: null,
                input_modalities_json: JSON.stringify(['text']),
                output_modalities_json: JSON.stringify(['text']),
                prompt_family: null,
                provider_settings_json: null,
                context_length: null,
                pricing_json: '{}',
                raw_json: '{}',
                source: 'seed',
                updated_at: timestamp,
            }))
        )
        .execute();
}

async function seedProviderAuthStates(tx: ProfileStoreDb, profileId: string, timestamp: string): Promise<void> {
    const providers = await tx.selectFrom('providers').select('id').orderBy('id', 'asc').execute();
    if (providers.length === 0) {
        return;
    }

    await tx
        .insertInto('provider_auth_states')
        .values(
            providers.map((provider) => ({
                profile_id: profileId,
                provider_id: provider.id,
                auth_method: 'none',
                auth_state: 'logged_out',
                account_id: null,
                organization_id: null,
                token_expires_at: null,
                last_error_code: null,
                last_error_message: null,
                updated_at: timestamp,
            }))
        )
        .execute();
}

async function seedKiloAccountSnapshot(tx: ProfileStoreDb, profileId: string, timestamp: string): Promise<void> {
    await tx
        .insertInto('kilo_account_snapshots')
        .values({
            profile_id: profileId,
            account_id: null,
            display_name: '',
            email_masked: '',
            auth_state: 'logged_out',
            token_expires_at: null,
            balance_amount: null,
            balance_currency: null,
            balance_updated_at: null,
            updated_at: timestamp,
        })
        .onConflict((oc) =>
            oc.column('profile_id').doUpdateSet({
                account_id: null,
                display_name: '',
                email_masked: '',
                auth_state: 'logged_out',
                token_expires_at: null,
                balance_amount: null,
                balance_currency: null,
                balance_updated_at: null,
                updated_at: timestamp,
            })
        )
        .execute();

    await tx.deleteFrom('kilo_org_snapshots').where('profile_id', '=', profileId).execute();
}

export async function initializeProfileProviderBaseline(input: {
    tx: ProfileStoreDb;
    sourceProfileId: string;
    targetProfileId: string;
    timestamp: string;
}): Promise<void> {
    await copyProviderCatalog(input.tx, input.sourceProfileId, input.targetProfileId, input.timestamp);
    await seedProviderAuthStates(input.tx, input.targetProfileId, input.timestamp);
    await seedKiloAccountSnapshot(input.tx, input.targetProfileId, input.timestamp);
}
