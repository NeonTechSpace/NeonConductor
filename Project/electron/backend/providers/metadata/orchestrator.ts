import { providerCatalogStore, providerStore } from '@/app/backend/persistence/stores';
import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import { getProviderMetadataAdapter } from '@/app/backend/providers/metadata/adapters';
import { normalizeCatalogMetadata, toProviderCatalogUpsert } from '@/app/backend/providers/metadata/normalize';
import {
    listStaticModelDefinitions,
    toStaticProviderCatalogModel,
} from '@/app/backend/providers/metadata/staticCatalog/registry';
import { providerAuthExecutionService } from '@/app/backend/providers/providerAuthExecutionService';
import { resolveEndpointProfile } from '@/app/backend/providers/service/endpointProfiles';
import {
    errProviderService,
    okProviderService,
    type ProviderServiceResult,
} from '@/app/backend/providers/service/errors';
import { ensureSupportedProvider, resolveSecret } from '@/app/backend/providers/service/helpers';
import type { ProviderSyncResult } from '@/app/backend/providers/service/types';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';
import { appLog } from '@/app/main/logging';

const DEFAULT_METADATA_CACHE_TTL_MS = 5 * 60 * 1000;

interface ProviderMetadataCacheEntry {
    loadedAtMs: number;
    models: ProviderModelRecord[];
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

function buildCacheKey(profileId: string, providerId: RuntimeProviderId): string {
    return `${profileId}:${providerId}`;
}

function isStaticProviderId(providerId: RuntimeProviderId): providerId is Exclude<RuntimeProviderId, 'kilo'> {
    return providerId === 'openai' || providerId === 'zai' || providerId === 'moonshot';
}

export class ProviderMetadataOrchestrator {
    private readonly metadataCacheTtlMs = readMetadataCacheTtlMs();
    private readonly cache = new Map<string, ProviderMetadataCacheEntry>();
    private readonly refreshInFlight = new Map<string, Promise<ProviderSyncResult>>();

    async listModels(
        profileId: string,
        providerId: RuntimeProviderId
    ): Promise<ProviderServiceResult<ProviderModelRecord[]>> {
        const ensuredProviderResult = await ensureSupportedProvider(providerId);
        if (ensuredProviderResult.isErr()) {
            return errProviderService(ensuredProviderResult.error.code, ensuredProviderResult.error.message);
        }

        const supportedProviderId = ensuredProviderResult.value;
        if (isStaticProviderId(supportedProviderId)) {
            await this.hydrateStaticCatalog(profileId, supportedProviderId);
        }
        const key = buildCacheKey(profileId, supportedProviderId);
        const cached = this.cache.get(key);
        const now = Date.now();

        if (cached && now - cached.loadedAtMs <= this.metadataCacheTtlMs) {
            return okProviderService(cached.models);
        }

        const persistedModels = await providerStore.listModels(profileId, supportedProviderId);
        if (persistedModels.length === 0) {
            const syncResult = await this.syncSupportedCatalog(profileId, supportedProviderId, true, 'manual_force');
            if (syncResult.ok) {
                const refreshedModels = await providerStore.listModels(profileId, supportedProviderId);
                this.cache.set(key, {
                    loadedAtMs: now,
                    models: refreshedModels,
                });
                return okProviderService(refreshedModels);
            }
        }
        this.cache.set(key, {
            loadedAtMs: now,
            models: persistedModels,
        });
        this.scheduleBackgroundRefresh(profileId, supportedProviderId);

        return okProviderService(persistedModels);
    }

    async listModelsByProfile(profileId: string): Promise<ProviderModelRecord[]> {
        await Promise.all(
            (['openai', 'zai', 'moonshot'] as const).map((providerId) => this.hydrateStaticCatalog(profileId, providerId))
        );
        const models = await providerStore.listModelsByProfile(profileId);
        const now = Date.now();
        const byProvider = new Map<RuntimeProviderId, ProviderModelRecord[]>();

        for (const model of models) {
            const existing = byProvider.get(model.providerId) ?? [];
            existing.push(model);
            byProvider.set(model.providerId, existing);
        }

        for (const [providerId, providerModels] of byProvider.entries()) {
            this.cache.set(buildCacheKey(profileId, providerId), {
                loadedAtMs: now,
                models: providerModels,
            });
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

    private scheduleBackgroundRefresh(profileId: string, providerId: RuntimeProviderId): void {
        const key = buildCacheKey(profileId, providerId);
        if (this.refreshInFlight.has(key)) {
            return;
        }

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

    private async hydrateStaticCatalog(
        profileId: string,
        providerId: Exclude<RuntimeProviderId, 'kilo'>
    ): Promise<void> {
        const endpointProfileResult = await resolveEndpointProfile(profileId, providerId);
        if (endpointProfileResult.isErr()) {
            return;
        }

        const endpointProfile = endpointProfileResult.value;
        const models = listStaticModelDefinitions(providerId, endpointProfile).map((definition) =>
            toStaticProviderCatalogModel(definition, endpointProfile)
        );
        const normalized = normalizeCatalogMetadata(providerId, models);

        await providerCatalogStore.replaceModels(
            profileId,
            providerId,
            normalized.models.map(toProviderCatalogUpsert)
        );
    }

    private async syncSupportedCatalog(
        profileId: string,
        providerId: RuntimeProviderId,
        force: boolean,
        reason: 'manual' | 'manual_force' | 'background',
        context?: LogContext
    ): Promise<ProviderSyncResult> {
        const key = buildCacheKey(profileId, providerId);
        const inFlight = this.refreshInFlight.get(key);
        if (inFlight) {
            return inFlight;
        }

        const refreshPromise = this.executeSync(profileId, providerId, force, reason, context);
        this.refreshInFlight.set(key, refreshPromise);
        try {
            return await refreshPromise;
        } finally {
            this.refreshInFlight.delete(key);
        }
    }

    private async executeSync(
        profileId: string,
        providerId: RuntimeProviderId,
        force: boolean,
        reason: 'manual' | 'manual_force' | 'background',
        context?: LogContext
    ): Promise<ProviderSyncResult> {
        appLog.info({
            tag: 'provider.metadata-orchestrator',
            message: 'Starting provider metadata sync.',
            profileId,
            providerId,
            force,
            reason,
            ...withLogContext(context),
        });

        const adapter = getProviderMetadataAdapter(providerId);
        const authState = await providerAuthExecutionService.getAuthState(profileId, providerId);
        const [apiKey, accessToken] = await Promise.all([
            resolveSecret(profileId, providerId, 'api_key'),
            resolveSecret(profileId, providerId, 'access_token'),
        ]);

        const fetchResult = await adapter.fetchCatalog({
            profileId,
            authMethod: authState.authMethod,
            ...(apiKey ? { apiKey } : {}),
            ...(accessToken ? { accessToken } : {}),
            ...(authState.organizationId ? { organizationId: authState.organizationId } : {}),
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

        const normalized = normalizeCatalogMetadata(providerId, fetchResult.models);
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
        this.cache.set(buildCacheKey(profileId, providerId), {
            loadedAtMs: Date.now(),
            models: persistedModels,
        });

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
