import { providerCatalogStore, providerStore } from '@/app/backend/persistence/stores';
import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import { getProviderMetadataAdapter } from '@/app/backend/providers/metadata/adapters';
import {
    buildProviderCatalogScopeKey,
    resolveProviderCatalogFetchState,
    type ResolvedProviderCatalogContext,
    type ResolvedProviderCatalogFetchState,
} from '@/app/backend/providers/metadata/catalogContext';
import { normalizeCatalogMetadata, toProviderCatalogUpsert } from '@/app/backend/providers/metadata/normalize';
import {
    listStaticModelDefinitions,
    toStaticProviderCatalogModel,
} from '@/app/backend/providers/metadata/staticCatalog/registry';
import {
    errProviderService,
    okProviderService,
    type ProviderServiceResult,
} from '@/app/backend/providers/service/errors';
import { ensureSupportedProvider } from '@/app/backend/providers/service/helpers';
import type { ProviderSyncResult } from '@/app/backend/providers/service/types';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';
import { appLog } from '@/app/main/logging';

const DEFAULT_METADATA_CACHE_TTL_MS = 5 * 60 * 1000;

interface ProviderMetadataCacheEntry {
    loadedAtMs: number;
    models: ProviderModelRecord[];
    context: ResolvedProviderCatalogContext;
}

interface LogContext {
    requestId?: string;
    correlationId?: string;
}

function withLogContext(context?: LogContext): Record<string, string> {
    if (!context) {
        return {};
    }

    return {
        ...(context.requestId ? { requestId: context.requestId } : {}),
        ...(context.correlationId ? { correlationId: context.correlationId } : {}),
    };
}

function readMetadataCacheTtlMs(): number {
    const raw = process.env['PROVIDER_METADATA_CACHE_TTL_MS'];
    if (!raw) {
        return DEFAULT_METADATA_CACHE_TTL_MS;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return DEFAULT_METADATA_CACHE_TTL_MS;
    }

    return parsed;
}

function isStaticProviderId(providerId: RuntimeProviderId): providerId is Exclude<RuntimeProviderId, 'kilo'> {
    return providerId === 'openai' || providerId === 'zai' || providerId === 'moonshot';
}

export class ProviderMetadataOrchestrator {
    private readonly metadataCacheTtlMs = readMetadataCacheTtlMs();
    private readonly cache = new Map<string, ProviderMetadataCacheEntry>();
    private readonly refreshInFlight = new Map<string, Promise<ProviderSyncResult>>();
    private readonly refreshContexts = new Map<string, ResolvedProviderCatalogContext>();
    private readonly scopeEpochs = new Map<string, number>();

    async listModels(
        profileId: string,
        providerId: RuntimeProviderId
    ): Promise<ProviderServiceResult<ProviderModelRecord[]>> {
        const ensuredProviderResult = await ensureSupportedProvider(providerId);
        if (ensuredProviderResult.isErr()) {
            return errProviderService(ensuredProviderResult.error.code, ensuredProviderResult.error.message);
        }

        const supportedProviderId = ensuredProviderResult.value;
        const fetchStateResult = await resolveProviderCatalogFetchState(profileId, supportedProviderId);
        if (fetchStateResult.isErr()) {
            return errProviderService(fetchStateResult.error.code, fetchStateResult.error.message);
        }

        const fetchState = fetchStateResult.value;
        if (isStaticProviderId(supportedProviderId)) {
            await this.hydrateStaticCatalog(fetchState);
        }

        const cacheKey = fetchState.context.cacheKey;
        const cached = this.cache.get(cacheKey);
        const now = Date.now();

        if (cached && now - cached.loadedAtMs <= this.metadataCacheTtlMs) {
            return okProviderService(cached.models);
        }

        const persistedModels = await providerStore.listModels(profileId, supportedProviderId);
        if (persistedModels.length === 0) {
            const syncResult = await this.syncSupportedCatalog(
                profileId,
                supportedProviderId,
                true,
                'manual_force',
                undefined,
                fetchState
            );
            if (syncResult.ok) {
                const refreshedModels = await providerStore.listModels(profileId, supportedProviderId);
                this.setCachedModels(fetchState.context, refreshedModels, now);
                return okProviderService(refreshedModels);
            }
        }

        this.setCachedModels(fetchState.context, persistedModels, now);
        this.scheduleBackgroundRefresh(profileId, supportedProviderId);

        return okProviderService(persistedModels);
    }

    async listModelsByProfile(profileId: string): Promise<ProviderModelRecord[]> {
        await Promise.all(
            (['openai', 'zai', 'moonshot'] as const).map(async (providerId) => {
                const fetchStateResult = await resolveProviderCatalogFetchState(profileId, providerId);
                if (fetchStateResult.isErr()) {
                    return;
                }

                await this.hydrateStaticCatalog(fetchStateResult.value);
            })
        );

        const models = await providerStore.listModelsByProfile(profileId);
        const byProvider = new Map<RuntimeProviderId, ProviderModelRecord[]>();

        for (const model of models) {
            const existing = byProvider.get(model.providerId) ?? [];
            existing.push(model);
            byProvider.set(model.providerId, existing);
        }

        const now = Date.now();
        for (const [providerId, providerModels] of byProvider.entries()) {
            const ensuredProviderResult = await ensureSupportedProvider(providerId);
            if (ensuredProviderResult.isErr()) {
                continue;
            }

            const fetchStateResult = await resolveProviderCatalogFetchState(profileId, ensuredProviderResult.value);
            if (fetchStateResult.isErr()) {
                continue;
            }

            this.setCachedModels(fetchStateResult.value.context, providerModels, now);
        }

        return models;
    }

    async syncCatalog(
        profileId: string,
        providerId: RuntimeProviderId,
        force = false,
        context?: LogContext
    ): Promise<ProviderServiceResult<ProviderSyncResult>> {
        const ensuredProviderResult = await ensureSupportedProvider(providerId);
        if (ensuredProviderResult.isErr()) {
            appLog.warn({
                tag: 'provider.metadata-orchestrator',
                message: 'Catalog sync rejected for unsupported provider.',
                profileId,
                providerId,
                reason: ensuredProviderResult.error.code,
                error: ensuredProviderResult.error.message,
                ...withLogContext(context),
            });
            return errProviderService(ensuredProviderResult.error.code, ensuredProviderResult.error.message);
        }

        const supportedProviderId = ensuredProviderResult.value;
        return okProviderService(
            await this.syncSupportedCatalog(
                profileId,
                supportedProviderId,
                force,
                force ? 'manual_force' : 'manual',
                context
            )
        );
    }

    async flushProviderScope(profileId: string, providerId: RuntimeProviderId): Promise<void> {
        const ensuredProviderResult = await ensureSupportedProvider(providerId);
        if (ensuredProviderResult.isErr()) {
            return;
        }

        const supportedProviderId = ensuredProviderResult.value;
        const scopeKey = buildProviderCatalogScopeKey(profileId, supportedProviderId);
        const currentEpoch = this.scopeEpochs.get(scopeKey) ?? 0;
        this.scopeEpochs.set(scopeKey, currentEpoch + 1);

        for (const [cacheKey, entry] of this.cache.entries()) {
            if (entry.context.profileId === profileId && entry.context.providerId === supportedProviderId) {
                this.cache.delete(cacheKey);
            }
        }

        for (const [cacheKey, context] of this.refreshContexts.entries()) {
            if (context.profileId === profileId && context.providerId === supportedProviderId) {
                this.refreshInFlight.delete(cacheKey);
                this.refreshContexts.delete(cacheKey);
            }
        }
    }

    async invalidateProviderScope(profileId: string, providerId: RuntimeProviderId): Promise<void> {
        const ensuredProviderResult = await ensureSupportedProvider(providerId);
        if (ensuredProviderResult.isErr()) {
            return;
        }

        const supportedProviderId = ensuredProviderResult.value;
        await this.flushProviderScope(profileId, providerId);
        await providerCatalogStore.clearModels(profileId, supportedProviderId);
    }

    private scheduleBackgroundRefresh(profileId: string, providerId: RuntimeProviderId): void {
        void this.syncSupportedCatalog(profileId, providerId, false, 'background').catch((error: unknown) => {
            appLog.warn({
                tag: 'provider.metadata-orchestrator',
                message: 'Background provider metadata refresh failed.',
                profileId,
                providerId,
                error: error instanceof Error ? error.message : String(error),
            });
        });
    }

    private async hydrateStaticCatalog(fetchState: ResolvedProviderCatalogFetchState): Promise<void> {
        const { context } = fetchState;
        if (!isStaticProviderId(context.providerId)) {
            return;
        }

        const models = listStaticModelDefinitions(context.providerId, context.optionProfileId).map((definition) =>
            toStaticProviderCatalogModel(definition, context.optionProfileId)
        );
        const normalized = normalizeCatalogMetadata(context.providerId, models, {
            optionProfileId: context.optionProfileId,
            resolvedBaseUrl: context.resolvedBaseUrl,
        });

        await providerCatalogStore.replaceModels(
            context.profileId,
            context.providerId,
            normalized.models.map(toProviderCatalogUpsert)
        );
    }

    private setCachedModels(context: ResolvedProviderCatalogContext, models: ProviderModelRecord[], loadedAtMs: number): void {
        this.cache.set(context.cacheKey, {
            loadedAtMs,
            models,
            context,
        });
    }

    private readScopeEpoch(profileId: string, providerId: RuntimeProviderId): number {
        return this.scopeEpochs.get(buildProviderCatalogScopeKey(profileId, providerId)) ?? 0;
    }

    private isScopeEpochCurrent(profileId: string, providerId: RuntimeProviderId, expectedEpoch: number): boolean {
        return this.readScopeEpoch(profileId, providerId) === expectedEpoch;
    }

    private async syncSupportedCatalog(
        profileId: string,
        providerId: RuntimeProviderId,
        force: boolean,
        reason: 'manual' | 'manual_force' | 'background',
        context?: LogContext,
        resolvedFetchState?: ResolvedProviderCatalogFetchState
    ): Promise<ProviderSyncResult> {
        const fetchStateResult = resolvedFetchState
            ? okProviderService(resolvedFetchState)
            : await resolveProviderCatalogFetchState(profileId, providerId);
        if (fetchStateResult.isErr()) {
            return {
                ok: false,
                status: 'error',
                providerId,
                reason: 'sync_failed',
                detail: fetchStateResult.error.message,
                modelCount: 0,
            };
        }

        const fetchState = fetchStateResult.value;
        const cacheKey = fetchState.context.cacheKey;
        const inFlight = this.refreshInFlight.get(cacheKey);
        if (inFlight) {
            return inFlight;
        }

        const scopeEpoch = this.readScopeEpoch(profileId, providerId);
        const refreshPromise = this.executeSync(fetchState, force, reason, scopeEpoch, context);
        this.refreshInFlight.set(cacheKey, refreshPromise);
        this.refreshContexts.set(cacheKey, fetchState.context);

        try {
            return await refreshPromise;
        } finally {
            if (this.refreshInFlight.get(cacheKey) === refreshPromise) {
                this.refreshInFlight.delete(cacheKey);
            }
            if (this.refreshContexts.get(cacheKey) === fetchState.context) {
                this.refreshContexts.delete(cacheKey);
            }
        }
    }

    private async executeSync(
        fetchState: ResolvedProviderCatalogFetchState,
        force: boolean,
        reason: 'manual' | 'manual_force' | 'background',
        scopeEpochAtStart: number,
        context?: LogContext
    ): Promise<ProviderSyncResult> {
        const { apiKey, accessToken } = fetchState;
        const resolvedContext = fetchState.context;
        const { profileId, providerId } = resolvedContext;

        appLog.info({
            tag: 'provider.metadata-orchestrator',
            message: 'Starting provider metadata sync.',
            profileId,
            providerId,
            force,
            reason,
            authMethod: resolvedContext.authMethod,
            optionProfileId: resolvedContext.optionProfileId,
            resolvedBaseUrl: resolvedContext.resolvedBaseUrl ?? null,
            organizationId: resolvedContext.organizationId ?? null,
            ...withLogContext(context),
        });

        const adapter = getProviderMetadataAdapter(providerId);
        const fetchResult = await adapter.fetchCatalog({
            profileId,
            authMethod: resolvedContext.authMethod,
            ...(apiKey ? { apiKey } : {}),
            ...(accessToken ? { accessToken } : {}),
            ...(resolvedContext.organizationId ? { organizationId: resolvedContext.organizationId } : {}),
            endpointProfile: resolvedContext.optionProfileId,
            optionProfileId: resolvedContext.optionProfileId,
            ...(resolvedContext.resolvedBaseUrl ? { resolvedBaseUrl: resolvedContext.resolvedBaseUrl } : {}),
            ...(force ? { force: true } : {}),
        });

        if (!fetchResult.ok) {
            await providerCatalogStore.upsertDiscoverySnapshot({
                profileId,
                providerId,
                kind: 'models',
                payload: { reason: fetchResult.reason, detail: fetchResult.detail ?? null },
                status: 'error',
            });

            appLog.warn({
                tag: 'provider.metadata-orchestrator',
                message: 'Provider metadata sync failed.',
                profileId,
                providerId,
                reason: fetchResult.reason,
                detail: fetchResult.detail ?? null,
                ...withLogContext(context),
            });

            return {
                ok: false,
                status: 'error',
                providerId,
                reason: fetchResult.reason,
                ...(fetchResult.detail ? { detail: fetchResult.detail } : {}),
                modelCount: 0,
            };
        }

        if (!this.isScopeEpochCurrent(profileId, providerId, scopeEpochAtStart)) {
            appLog.info({
                tag: 'provider.metadata-orchestrator',
                message: 'Skipped stale provider metadata sync because catalog scope changed during fetch.',
                profileId,
                providerId,
                reason,
                optionProfileId: resolvedContext.optionProfileId,
                organizationId: resolvedContext.organizationId ?? null,
                ...withLogContext(context),
            });

            return {
                ok: true,
                status: 'unchanged',
                providerId,
                modelCount: 0,
            };
        }

        const normalized = normalizeCatalogMetadata(providerId, fetchResult.models, {
            optionProfileId: resolvedContext.optionProfileId,
            resolvedBaseUrl: resolvedContext.resolvedBaseUrl,
        });
        if (normalized.droppedCount > 0) {
            appLog.warn({
                tag: 'provider.metadata-orchestrator',
                message: 'Dropped invalid provider metadata rows during normalization.',
                profileId,
                providerId,
                droppedCount: normalized.droppedCount,
                ...withLogContext(context),
            });
        }

        const replaceResult = await providerCatalogStore.replaceModels(
            profileId,
            providerId,
            normalized.models.map(toProviderCatalogUpsert)
        );

        if (!this.isScopeEpochCurrent(profileId, providerId, scopeEpochAtStart)) {
            void this.syncSupportedCatalog(profileId, providerId, true, 'background').catch((error: unknown) => {
                appLog.warn({
                    tag: 'provider.metadata-orchestrator',
                    message: 'Failed to resync provider metadata after discarding stale persisted results.',
                    profileId,
                    providerId,
                    error: error instanceof Error ? error.message : String(error),
                    ...withLogContext(context),
                });
            });
            appLog.info({
                tag: 'provider.metadata-orchestrator',
                message: 'Discarded provider metadata sync results because catalog scope changed during persistence.',
                profileId,
                providerId,
                reason,
                ...withLogContext(context),
            });

            return {
                ok: true,
                status: 'unchanged',
                providerId,
                modelCount: 0,
            };
        }

        await Promise.all([
            providerCatalogStore.upsertDiscoverySnapshot({
                profileId,
                providerId,
                kind: 'models',
                payload: fetchResult.modelPayload,
                status: 'ok',
            }),
            providerCatalogStore.upsertDiscoverySnapshot({
                profileId,
                providerId,
                kind: 'providers',
                payload: fetchResult.providerPayload,
                status: 'ok',
            }),
        ]);

        const persistedModels = await providerStore.listModels(profileId, providerId);
        this.setCachedModels(resolvedContext, persistedModels, Date.now());

        appLog.info({
            tag: 'provider.metadata-orchestrator',
            message: 'Provider metadata sync completed.',
            profileId,
            providerId,
            status: replaceResult.changed ? 'synced' : 'unchanged',
            modelCount: replaceResult.modelCount,
            overrideCount: normalized.overrideCount,
            derivedCount: normalized.derivedCount,
            droppedCount: normalized.droppedCount,
            optionProfileId: resolvedContext.optionProfileId,
            resolvedBaseUrl: resolvedContext.resolvedBaseUrl ?? null,
            organizationId: resolvedContext.organizationId ?? null,
            ...withLogContext(context),
        });

        return {
            ok: true,
            status: replaceResult.changed ? 'synced' : 'unchanged',
            providerId,
            modelCount: replaceResult.modelCount,
        };
    }
}

export const providerMetadataOrchestrator = new ProviderMetadataOrchestrator();
