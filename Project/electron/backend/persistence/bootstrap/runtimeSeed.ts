
import {
    listStaticModelDefinitions,
    toStaticProviderCatalogModel,
} from '@/app/backend/providers/metadata/staticCatalog/registry';
import { getDefaultEndpointProfile } from '@/app/backend/providers/registry';
import {
    kiloBalancedModelId,
    kiloFreeModelId,
    kiloFrontierModelId,
    kiloSmallModelId,
} from '@/shared/kiloModels';

import type { DatabaseSync } from 'node:sqlite';
import type { ProviderRoutedApiFamily } from '@/app/backend/providers/types';

const DEFAULT_PROVIDER_ID = 'kilo';
const DEFAULT_MODEL_ID = kiloFrontierModelId;

const PROVIDER_SEED = [
    { id: 'kilo', label: 'Kilo', supportsByok: 0 },
    { id: 'openai', label: 'OpenAI', supportsByok: 1 },
    { id: 'zai', label: 'Z.AI', supportsByok: 1 },
    { id: 'moonshot', label: 'Moonshot (Kimi)', supportsByok: 1 },
] as const;

const KILO_MODEL_SEED: Array<{
    id: string;
    providerId: 'kilo';
    label: string;
    supportsTools: boolean;
    supportsReasoning: boolean;
    routedApiFamily: ProviderRoutedApiFamily;
    contextLength?: number;
    maxOutputTokens?: number;
}> = [
    {
        id: kiloFrontierModelId,
        providerId: 'kilo',
        label: 'Kilo Auto Frontier',
        supportsTools: true,
        supportsReasoning: true,
        routedApiFamily: 'anthropic_messages',
    },
    {
        id: kiloBalancedModelId,
        providerId: 'kilo',
        label: 'Kilo Auto Balanced',
        supportsTools: true,
        supportsReasoning: true,
        routedApiFamily: 'openai_compatible',
    },
    {
        id: kiloFreeModelId,
        providerId: 'kilo',
        label: 'Kilo Auto Free',
        supportsTools: true,
        supportsReasoning: true,
        routedApiFamily: 'openai_compatible',
    },
    {
        id: kiloSmallModelId,
        providerId: 'kilo',
        label: 'Kilo Auto Small',
        supportsTools: true,
        supportsReasoning: true,
        routedApiFamily: 'openai_compatible',
    },
] as const;

function listDefaultStaticCatalogModels() {
    return (['openai', 'zai', 'moonshot'] as const).flatMap((providerId) => {
        const endpointProfile = getDefaultEndpointProfile(providerId);
        return listStaticModelDefinitions(providerId, endpointProfile).map((definition) => ({
            providerId,
            endpointProfile,
            definition,
            catalogModel: toStaticProviderCatalogModel(definition, endpointProfile),
        }));
    });
}

const STATIC_MODEL_SEED = listDefaultStaticCatalogModels();

const TOOL_SEED = [
    {
        id: 'read_file',
        label: 'Read File',
        description: 'Read file contents from the active workspace.',
        permissionPolicy: 'ask',
    },
    {
        id: 'list_files',
        label: 'List Files',
        description: 'List files and folders in the active workspace.',
        permissionPolicy: 'ask',
    },
    {
        id: 'run_command',
        label: 'Run Command',
        description: 'Run a command in a sandboxed shell.',
        permissionPolicy: 'ask',
    },
] as const;

const MCP_SERVER_SEED = [
    {
        id: 'filesystem',
        label: 'Filesystem MCP',
        authMode: 'none',
        connectionState: 'disconnected',
        authState: 'authenticated',
    },
    {
        id: 'github',
        label: 'GitHub MCP',
        authMode: 'token',
        connectionState: 'disconnected',
        authState: 'unauthenticated',
    },
] as const;

const MODE_SEED = [
    {
        topLevelTab: 'chat',
        modeKey: 'chat',
        label: 'Chat',
        prompt: {},
        executionPolicy: {
            toolCapabilities: [],
        },
    },
    {
        topLevelTab: 'agent',
        modeKey: 'plan',
        label: 'Agent Plan',
        prompt: {},
        executionPolicy: {
            planningOnly: true,
        },
    },
    {
        topLevelTab: 'agent',
        modeKey: 'debug',
        label: 'Agent Debug',
        prompt: {},
        executionPolicy: {
            toolCapabilities: ['filesystem_read', 'shell'],
        },
    },
    {
        topLevelTab: 'agent',
        modeKey: 'code',
        label: 'Agent Code',
        prompt: {},
        executionPolicy: {
            toolCapabilities: ['filesystem_read', 'shell'],
        },
    },
    {
        topLevelTab: 'agent',
        modeKey: 'ask',
        label: 'Agent Ask',
        prompt: {},
        executionPolicy: {
            toolCapabilities: ['filesystem_read'],
        },
    },
    {
        topLevelTab: 'orchestrator',
        modeKey: 'plan',
        label: 'Orchestrator Plan',
        prompt: {},
        executionPolicy: {
            planningOnly: true,
        },
    },
    {
        topLevelTab: 'orchestrator',
        modeKey: 'orchestrate',
        label: 'Orchestrator Orchestrate',
        prompt: {},
        executionPolicy: {
            toolCapabilities: ['filesystem_read'],
        },
    },
    {
        topLevelTab: 'orchestrator',
        modeKey: 'debug',
        label: 'Orchestrator Debug',
        prompt: {},
        executionPolicy: {
            toolCapabilities: ['filesystem_read'],
        },
    },
] as const;

export function seedRuntimeData(sqlite: DatabaseSync, defaultProfileId: string): void {
    const now = new Date().toISOString();

    const insertProfile = sqlite.prepare(
        `
            INSERT OR IGNORE INTO profiles (id, name, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
        `
    );
    const insertProvider = sqlite.prepare(
        `
            INSERT OR IGNORE INTO providers (id, label, supports_byok, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
        `
    );
    const insertModel = sqlite.prepare(
        `
            INSERT OR IGNORE INTO provider_models (id, provider_id, label, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
        `
    );
    const insertCatalogModel = sqlite.prepare(
        `
            INSERT OR IGNORE INTO provider_model_catalog
                (
                    profile_id,
                    provider_id,
                    model_id,
                    label,
                    upstream_provider,
                    is_free,
                    supports_tools,
                    supports_reasoning,
                    supports_vision,
                    supports_audio_input,
                    supports_audio_output,
                    supports_prompt_cache,
                    tool_protocol,
                    api_family,
                    routed_api_family,
                    input_modalities_json,
                    output_modalities_json,
                    prompt_family,
                    provider_settings_json,
                    context_length,
                    pricing_json,
                    raw_json,
                    source,
                    updated_at
                )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
    );
    const insertProviderAuthState = sqlite.prepare(
        `
            INSERT OR IGNORE INTO provider_auth_states
                (
                    profile_id,
                    provider_id,
                    auth_method,
                    auth_state,
                    account_id,
                    organization_id,
                    token_expires_at,
                    last_error_code,
                    last_error_message,
                    updated_at
                )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
    );
    const insertTool = sqlite.prepare(
        `
            INSERT OR IGNORE INTO tools_catalog (id, label, description, permission_policy, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
        `
    );
    const insertMcpServer = sqlite.prepare(
        `
            INSERT OR IGNORE INTO mcp_servers
                (id, label, auth_mode, connection_state, auth_state, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `
    );
    const insertModeDefinition = sqlite.prepare(
        `
            INSERT OR REPLACE INTO mode_definitions
                (
                    id,
                    profile_id,
                    top_level_tab,
                    mode_key,
                    label,
                    asset_key,
                    prompt_json,
                    execution_policy_json,
                    source,
                    source_kind,
                    scope,
                    workspace_fingerprint,
                    origin_path,
                    description,
                    tags_json,
                    enabled,
                    precedence,
                    created_at,
                    updated_at
                )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
    );
    const insertKiloAccountSnapshot = sqlite.prepare(
        `
            INSERT OR IGNORE INTO kilo_account_snapshots
                (
                    profile_id,
                    account_id,
                    display_name,
                    email_masked,
                    auth_state,
                    token_expires_at,
                    balance_amount,
                    balance_currency,
                    balance_updated_at,
                    updated_at
                )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
    );
    const insertSettingIfMissing = sqlite.prepare(
        `
            INSERT OR IGNORE INTO settings (id, profile_id, key, value_json, updated_at)
            VALUES (?, ?, ?, ?, ?)
        `
    );

    insertProfile.run(defaultProfileId, 'Local Default', 1, now, now);

    for (const provider of PROVIDER_SEED) {
        insertProvider.run(provider.id, provider.label, provider.supportsByok, now, now);
        insertProviderAuthState.run(
            defaultProfileId,
            provider.id,
            'none',
            'logged_out',
            null,
            null,
            null,
            null,
            null,
            now
        );
    }

    for (const model of KILO_MODEL_SEED) {
        insertModel.run(model.id, model.providerId, model.label, now, now);
        insertCatalogModel.run(
            defaultProfileId,
            model.providerId,
            model.id,
            model.label,
            model.providerId,
            0,
            model.supportsTools ? 1 : 0,
            model.supportsReasoning ? 1 : 0,
            0,
            0,
            0,
            null,
            'kilo_gateway',
            'kilo_gateway',
            model.routedApiFamily,
            JSON.stringify(['text']),
            JSON.stringify(['text']),
            model.id === kiloFrontierModelId ? 'anthropic' : model.id === kiloSmallModelId ? 'codex' : null,
            null,
            model.contextLength ?? null,
            '{}',
            JSON.stringify(model.maxOutputTokens !== undefined ? { max_output_tokens: model.maxOutputTokens } : {}),
            'seed',
            now
        );
    }

    for (const model of STATIC_MODEL_SEED) {
        insertModel.run(model.catalogModel.modelId, model.providerId, model.definition.label, now, now);
        insertCatalogModel.run(
            defaultProfileId,
            model.providerId,
            model.catalogModel.modelId,
            model.catalogModel.label,
            model.catalogModel.upstreamProvider ?? model.providerId,
            model.catalogModel.isFree ? 1 : 0,
            model.catalogModel.capabilities.supportsTools ? 1 : 0,
            model.catalogModel.capabilities.supportsReasoning ? 1 : 0,
            model.catalogModel.capabilities.supportsVision ? 1 : 0,
            model.catalogModel.capabilities.supportsAudioInput ? 1 : 0,
            model.catalogModel.capabilities.supportsAudioOutput ? 1 : 0,
            model.catalogModel.capabilities.supportsPromptCache === undefined
                ? null
                : model.catalogModel.capabilities.supportsPromptCache
                  ? 1
                  : 0,
            model.catalogModel.capabilities.toolProtocol ?? null,
            model.catalogModel.capabilities.apiFamily ?? null,
            model.catalogModel.capabilities.routedApiFamily ?? null,
            JSON.stringify(model.catalogModel.capabilities.inputModalities),
            JSON.stringify(model.catalogModel.capabilities.outputModalities),
            model.catalogModel.capabilities.promptFamily ?? null,
            JSON.stringify(model.catalogModel.providerSettings ?? {}),
            model.catalogModel.contextLength ?? null,
            JSON.stringify(model.catalogModel.pricing),
            JSON.stringify(model.catalogModel.raw),
            'seed',
            now
        );
    }

    for (const tool of TOOL_SEED) {
        insertTool.run(tool.id, tool.label, tool.description, tool.permissionPolicy, now, now);
    }

    for (const server of MCP_SERVER_SEED) {
        insertMcpServer.run(
            server.id,
            server.label,
            server.authMode,
            server.connectionState,
            server.authState,
            now,
            now
        );
    }

    for (const mode of MODE_SEED) {
        const modeId = `mode_${defaultProfileId}_${mode.topLevelTab}_${mode.modeKey}`;
        insertModeDefinition.run(
            modeId,
            defaultProfileId,
            mode.topLevelTab,
            mode.modeKey,
            mode.label,
            mode.modeKey,
            JSON.stringify(mode.prompt),
            JSON.stringify(mode.executionPolicy),
            'system',
            'system_seed',
            'system',
            null,
            null,
            null,
            '[]',
            1,
            0,
            now,
            now
        );
    }

    insertKiloAccountSnapshot.run(defaultProfileId, null, '', '', 'logged_out', null, null, null, null, now);
    insertSettingIfMissing.run(
        'setting_default_provider',
        defaultProfileId,
        'default_provider_id',
        JSON.stringify(DEFAULT_PROVIDER_ID),
        now
    );
    insertSettingIfMissing.run(
        'setting_default_model',
        defaultProfileId,
        'default_model_id',
        JSON.stringify(DEFAULT_MODEL_ID),
        now
    );
}
