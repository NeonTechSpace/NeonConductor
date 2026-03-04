import { randomUUID } from 'node:crypto';

import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso, parseJsonValue } from '@/app/backend/persistence/stores/utils';
import type { ActiveProfileState, ProfileDeletionGuardResult, ProfileRecord } from '@/app/backend/persistence/types';

const DEFAULT_PROFILE_NAME = 'New Profile';
const DEFAULT_DUPLICATE_SUFFIX = 'Copy';
const FALLBACK_DEFAULT_PROVIDER_ID = 'kilo';
const FALLBACK_DEFAULT_MODEL_ID = 'kilo/auto';

function mapProfile(row: {
    id: string;
    name: string;
    is_active: 0 | 1;
    created_at: string;
    updated_at: string;
}): ProfileRecord {
    return {
        id: row.id,
        name: row.name,
        isActive: row.is_active === 1,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function normalizeName(name: string | undefined, fallback: string): string {
    const trimmed = name?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

async function resolveTemplateProfileId(tx: ReturnType<typeof getPersistence>['db'], preferredProfileId?: string): Promise<string> {
    if (preferredProfileId) {
        const preferred = await tx
            .selectFrom('profiles')
            .select('id')
            .where('id', '=', preferredProfileId)
            .executeTakeFirst();
        if (preferred) {
            return preferred.id;
        }
    }

    const defaultProfile = await tx
        .selectFrom('profiles')
        .select('id')
        .where('id', '=', 'profile_local_default')
        .executeTakeFirst();

    if (defaultProfile) {
        return defaultProfile.id;
    }

    const oldest = await tx
        .selectFrom('profiles')
        .select('id')
        .orderBy('created_at', 'asc')
        .orderBy('id', 'asc')
        .executeTakeFirst();

    if (!oldest) {
        throw new Error('Cannot resolve template profile because no profiles exist.');
    }

    return oldest.id;
}

async function resolveDefaultProviderAndModel(
    tx: ReturnType<typeof getPersistence>['db'],
    templateProfileId: string
): Promise<{ providerId: string; modelId: string }> {
    const rows = await tx
        .selectFrom('settings')
        .select(['key', 'value_json'])
        .where('profile_id', '=', templateProfileId)
        .where('key', 'in', ['default_provider_id', 'default_model_id'])
        .execute();

    const valueByKey = new Map(rows.map((row) => [row.key, row.value_json]));

    const providerRaw = valueByKey.get('default_provider_id');
    const modelRaw = valueByKey.get('default_model_id');

    const providerId =
        typeof providerRaw === 'string' ? parseJsonValue<string>(providerRaw, FALLBACK_DEFAULT_PROVIDER_ID) : FALLBACK_DEFAULT_PROVIDER_ID;
    const modelId =
        typeof modelRaw === 'string' ? parseJsonValue<string>(modelRaw, FALLBACK_DEFAULT_MODEL_ID) : FALLBACK_DEFAULT_MODEL_ID;

    return {
        providerId: typeof providerId === 'string' && providerId.trim().length > 0 ? providerId : FALLBACK_DEFAULT_PROVIDER_ID,
        modelId: typeof modelId === 'string' && modelId.trim().length > 0 ? modelId : FALLBACK_DEFAULT_MODEL_ID,
    };
}

async function copyModeDefinitions(
    tx: ReturnType<typeof getPersistence>['db'],
    sourceProfileId: string,
    targetProfileId: string,
    timestamp: string
): Promise<void> {
    const modes = await tx
        .selectFrom('mode_definitions')
        .select([
            'top_level_tab',
            'mode_key',
            'label',
            'prompt_json',
            'execution_policy_json',
            'source',
            'enabled',
        ])
        .where('profile_id', '=', sourceProfileId)
        .orderBy('top_level_tab', 'asc')
        .orderBy('mode_key', 'asc')
        .execute();

    if (modes.length === 0) {
        return;
    }

    await tx
        .insertInto('mode_definitions')
        .values(
            modes.map((mode) => ({
                id: `mode_${targetProfileId}_${mode.top_level_tab}_${mode.mode_key}_${randomUUID()}`,
                profile_id: targetProfileId,
                top_level_tab: mode.top_level_tab,
                mode_key: mode.mode_key,
                label: mode.label,
                prompt_json: mode.prompt_json,
                execution_policy_json: mode.execution_policy_json,
                source: mode.source,
                enabled: mode.enabled,
                created_at: timestamp,
                updated_at: timestamp,
            }))
        )
        .execute();
}

async function copyRulesets(
    tx: ReturnType<typeof getPersistence>['db'],
    sourceProfileId: string,
    targetProfileId: string,
    timestamp: string
): Promise<void> {
    const rows = await tx
        .selectFrom('rulesets')
        .select(['workspace_fingerprint', 'name', 'body_markdown', 'source', 'enabled', 'precedence'])
        .where('profile_id', '=', sourceProfileId)
        .execute();

    if (rows.length === 0) {
        return;
    }

    await tx
        .insertInto('rulesets')
        .values(
            rows.map((row) => ({
                id: `ruleset_${randomUUID()}`,
                profile_id: targetProfileId,
                workspace_fingerprint: row.workspace_fingerprint,
                name: row.name,
                body_markdown: row.body_markdown,
                source: row.source,
                enabled: row.enabled,
                precedence: row.precedence,
                created_at: timestamp,
                updated_at: timestamp,
            }))
        )
        .execute();
}

async function copySkillfiles(
    tx: ReturnType<typeof getPersistence>['db'],
    sourceProfileId: string,
    targetProfileId: string,
    timestamp: string
): Promise<void> {
    const rows = await tx
        .selectFrom('skillfiles')
        .select(['workspace_fingerprint', 'name', 'body_markdown', 'source', 'enabled', 'precedence'])
        .where('profile_id', '=', sourceProfileId)
        .execute();

    if (rows.length === 0) {
        return;
    }

    await tx
        .insertInto('skillfiles')
        .values(
            rows.map((row) => ({
                id: `skillfile_${randomUUID()}`,
                profile_id: targetProfileId,
                workspace_fingerprint: row.workspace_fingerprint,
                name: row.name,
                body_markdown: row.body_markdown,
                source: row.source,
                enabled: row.enabled,
                precedence: row.precedence,
                created_at: timestamp,
                updated_at: timestamp,
            }))
        )
        .execute();
}

async function copyProviderCatalog(
    tx: ReturnType<typeof getPersistence>['db'],
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
            'input_modalities_json',
            'output_modalities_json',
            'prompt_family',
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
                    input_modalities_json: row.input_modalities_json,
                    output_modalities_json: row.output_modalities_json,
                    prompt_family: row.prompt_family,
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
                input_modalities_json: JSON.stringify(['text']),
                output_modalities_json: JSON.stringify(['text']),
                prompt_family: null,
                context_length: null,
                pricing_json: '{}',
                raw_json: '{}',
                source: 'seed',
                updated_at: timestamp,
            }))
        )
        .execute();
}

async function seedProviderAuthStates(
    tx: ReturnType<typeof getPersistence>['db'],
    profileId: string,
    timestamp: string
): Promise<void> {
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

async function seedKiloAccountSnapshot(
    tx: ReturnType<typeof getPersistence>['db'],
    profileId: string,
    timestamp: string
): Promise<void> {
    await tx
        .insertInto('kilo_account_snapshots')
        .values({
            profile_id: profileId,
            account_id: null,
            display_name: '',
            email_masked: '',
            auth_state: 'logged_out',
            token_expires_at: null,
            updated_at: timestamp,
        })
        .execute();
}

async function copyDefaultSettings(
    tx: ReturnType<typeof getPersistence>['db'],
    sourceProfileId: string,
    targetProfileId: string,
    timestamp: string
): Promise<void> {
    const defaults = await resolveDefaultProviderAndModel(tx, sourceProfileId);
    await tx
        .insertInto('settings')
        .values([
            {
                id: `setting_${randomUUID()}`,
                profile_id: targetProfileId,
                key: 'default_provider_id',
                value_json: JSON.stringify(defaults.providerId),
                updated_at: timestamp,
            },
            {
                id: `setting_${randomUUID()}`,
                profile_id: targetProfileId,
                key: 'default_model_id',
                value_json: JSON.stringify(defaults.modelId),
                updated_at: timestamp,
            },
        ])
        .execute();
}

async function copyAllSettings(
    tx: ReturnType<typeof getPersistence>['db'],
    sourceProfileId: string,
    targetProfileId: string,
    timestamp: string
): Promise<void> {
    const rows = await tx
        .selectFrom('settings')
        .select(['key', 'value_json'])
        .where('profile_id', '=', sourceProfileId)
        .execute();

    if (rows.length === 0) {
        await copyDefaultSettings(tx, sourceProfileId, targetProfileId, timestamp);
        return;
    }

    await tx
        .insertInto('settings')
        .values(
            rows.map((row) => ({
                id: `setting_${randomUUID()}`,
                profile_id: targetProfileId,
                key: row.key,
                value_json: row.value_json,
                updated_at: timestamp,
            }))
        )
        .execute();
}

async function initializeProfileBaseline(
    tx: ReturnType<typeof getPersistence>['db'],
    targetProfileId: string,
    templateProfileId: string,
    options: {
        copyAllSettings: boolean;
        timestamp: string;
    }
): Promise<void> {
    await copyModeDefinitions(tx, templateProfileId, targetProfileId, options.timestamp);
    await copyRulesets(tx, templateProfileId, targetProfileId, options.timestamp);
    await copySkillfiles(tx, templateProfileId, targetProfileId, options.timestamp);
    await copyProviderCatalog(tx, templateProfileId, targetProfileId, options.timestamp);

    if (options.copyAllSettings) {
        await copyAllSettings(tx, templateProfileId, targetProfileId, options.timestamp);
    } else {
        await copyDefaultSettings(tx, templateProfileId, targetProfileId, options.timestamp);
    }

    await seedProviderAuthStates(tx, targetProfileId, options.timestamp);
    await seedKiloAccountSnapshot(tx, targetProfileId, options.timestamp);
}

export class ProfileStore {
    async list(): Promise<ProfileRecord[]> {
        const { db } = getPersistence();

        const rows = await db
            .selectFrom('profiles')
            .select(['id', 'name', 'is_active', 'created_at', 'updated_at'])
            .orderBy('created_at', 'asc')
            .orderBy('id', 'asc')
            .execute();

        return rows.map(mapProfile);
    }

    async getById(profileId: string): Promise<ProfileRecord | null> {
        const { db } = getPersistence();

        const row = await db
            .selectFrom('profiles')
            .select(['id', 'name', 'is_active', 'created_at', 'updated_at'])
            .where('id', '=', profileId)
            .executeTakeFirst();

        return row ? mapProfile(row) : null;
    }

    async getActive(): Promise<ActiveProfileState> {
        const { db } = getPersistence();

        const activeRow = await db
            .selectFrom('profiles')
            .select(['id', 'name', 'is_active', 'created_at', 'updated_at'])
            .where('is_active', '=', 1)
            .executeTakeFirst();

        if (activeRow) {
            const profile = mapProfile(activeRow);
            return {
                activeProfileId: profile.id,
                profile,
            };
        }

        const fallback = await db
            .selectFrom('profiles')
            .select(['id'])
            .orderBy('created_at', 'asc')
            .orderBy('id', 'asc')
            .executeTakeFirst();

        if (!fallback) {
            throw new Error('No profiles exist; unable to resolve active profile.');
        }

        const activated = await this.setActive(fallback.id);
        if (!activated) {
            throw new Error(`Failed to activate fallback profile "${fallback.id}".`);
        }

        return {
            activeProfileId: activated.id,
            profile: activated,
        };
    }

    async setActive(profileId: string): Promise<ProfileRecord | null> {
        const { db } = getPersistence();
        const timestamp = nowIso();

        return db.transaction().execute(async (tx) => {
            const profile = await tx
                .selectFrom('profiles')
                .select(['id'])
                .where('id', '=', profileId)
                .executeTakeFirst();

            if (!profile) {
                return null;
            }

            await tx
                .updateTable('profiles')
                .set({ is_active: 0, updated_at: timestamp })
                .where('is_active', '=', 1)
                .execute();

            await tx
                .updateTable('profiles')
                .set({ is_active: 1, updated_at: timestamp })
                .where('id', '=', profileId)
                .execute();

            const updated = await tx
                .selectFrom('profiles')
                .select(['id', 'name', 'is_active', 'created_at', 'updated_at'])
                .where('id', '=', profileId)
                .executeTakeFirst();

            return updated ? mapProfile(updated) : null;
        });
    }

    async create(name?: string): Promise<ProfileRecord> {
        const { db } = getPersistence();
        const timestamp = nowIso();
        const profileId = `profile_${randomUUID()}`;

        return db.transaction().execute(async (tx) => {
            const templateProfileId = await resolveTemplateProfileId(tx);
            const profileName = normalizeName(name, DEFAULT_PROFILE_NAME);

            await tx
                .insertInto('profiles')
                .values({
                    id: profileId,
                    name: profileName,
                    is_active: 0,
                    created_at: timestamp,
                    updated_at: timestamp,
                })
                .execute();

            await initializeProfileBaseline(tx, profileId, templateProfileId, {
                copyAllSettings: false,
                timestamp,
            });

            const created = await tx
                .selectFrom('profiles')
                .select(['id', 'name', 'is_active', 'created_at', 'updated_at'])
                .where('id', '=', profileId)
                .executeTakeFirst();

            if (!created) {
                throw new Error(`Failed to create profile "${profileId}".`);
            }

            return mapProfile(created);
        });
    }

    async rename(profileId: string, name: string): Promise<ProfileRecord | null> {
        const { db } = getPersistence();
        const timestamp = nowIso();
        const nextName = normalizeName(name, DEFAULT_PROFILE_NAME);

        const updatedRows = await db
            .updateTable('profiles')
            .set({
                name: nextName,
                updated_at: timestamp,
            })
            .where('id', '=', profileId)
            .returning(['id', 'name', 'is_active', 'created_at', 'updated_at'])
            .execute();

        const updated = updatedRows[0];
        return updated ? mapProfile(updated) : null;
    }

    async duplicate(profileId: string, name?: string): Promise<ProfileRecord | null> {
        const { db } = getPersistence();
        const timestamp = nowIso();
        const duplicateId = `profile_${randomUUID()}`;

        return db.transaction().execute(async (tx) => {
            const source = await tx
                .selectFrom('profiles')
                .select(['id', 'name'])
                .where('id', '=', profileId)
                .executeTakeFirst();

            if (!source) {
                return null;
            }

            const duplicateName = normalizeName(name, `${source.name} ${DEFAULT_DUPLICATE_SUFFIX}`);

            await tx
                .insertInto('profiles')
                .values({
                    id: duplicateId,
                    name: duplicateName,
                    is_active: 0,
                    created_at: timestamp,
                    updated_at: timestamp,
                })
                .execute();

            await initializeProfileBaseline(tx, duplicateId, source.id, {
                copyAllSettings: true,
                timestamp,
            });

            const duplicate = await tx
                .selectFrom('profiles')
                .select(['id', 'name', 'is_active', 'created_at', 'updated_at'])
                .where('id', '=', duplicateId)
                .executeTakeFirst();

            if (!duplicate) {
                throw new Error(`Failed to duplicate profile "${source.id}".`);
            }

            return mapProfile(duplicate);
        });
    }

    async delete(profileId: string): Promise<ProfileDeletionGuardResult> {
        const { db } = getPersistence();
        const timestamp = nowIso();

        return db.transaction().execute(async (tx) => {
            const profiles = await tx
                .selectFrom('profiles')
                .select(['id', 'is_active', 'created_at'])
                .orderBy('created_at', 'asc')
                .orderBy('id', 'asc')
                .execute();

            const target = profiles.find((profile) => profile.id === profileId);
            if (!target) {
                return {
                    deleted: false,
                    reason: 'profile_not_found',
                };
            }

            if (profiles.length === 1) {
                return {
                    deleted: false,
                    reason: 'last_profile',
                };
            }

            const nextActiveCandidate = profiles.find((profile) => profile.id !== profileId);
            if (!nextActiveCandidate) {
                return {
                    deleted: false,
                    reason: 'last_profile',
                };
            }

            if (target.is_active === 1) {
                await tx
                    .updateTable('profiles')
                    .set({ is_active: 0, updated_at: timestamp })
                    .where('is_active', '=', 1)
                    .execute();

                await tx
                    .updateTable('profiles')
                    .set({ is_active: 1, updated_at: timestamp })
                    .where('id', '=', nextActiveCandidate.id)
                    .execute();
            }

            await tx.deleteFrom('profiles').where('id', '=', profileId).execute();

            const activeProfileRow = await tx
                .selectFrom('profiles')
                .select(['id'])
                .where('is_active', '=', 1)
                .executeTakeFirst();

            const activeProfileId = activeProfileRow?.id ?? nextActiveCandidate.id;

            return {
                deleted: true,
                activeProfileId,
                ...(target.is_active === 1 ? { promotedProfileId: nextActiveCandidate.id } : {}),
            };
        });
    }
}

export const profileStore = new ProfileStore();
