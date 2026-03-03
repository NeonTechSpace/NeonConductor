import {
    providerAuthStore,
    providerCatalogStore,
    providerStore,
    secretReferenceStore,
} from '@/app/backend/persistence/stores';
import type { ProviderAuthStateRecord, ProviderModelRecord, ProviderRecord } from '@/app/backend/persistence/types';
import { getProviderAdapter } from '@/app/backend/providers/adapters';
import { assertSupportedProviderId, isSupportedProviderId } from '@/app/backend/providers/registry';
import { getSecretStore } from '@/app/backend/secrets/store';

function buildSecretKeyRef(profileId: string, providerId: string, secretKind: string): string {
    return `provider/${profileId}/${providerId}/${secretKind}`;
}

function defaultAuthState(profileId: string, providerId: string): ProviderAuthStateRecord {
    return {
        profileId,
        providerId,
        authMethod: 'none',
        authState: 'logged_out',
        updatedAt: new Date().toISOString(),
    };
}

async function resolveApiKey(profileId: string, providerId: string): Promise<string | undefined> {
    const refs = await secretReferenceStore.listByProfileAndProvider(profileId, providerId);
    const keyRef = refs.find((ref) => ref.secretKind === 'api_key');
    if (!keyRef) {
        return undefined;
    }

    const secretValue = await getSecretStore().get(keyRef.secretKeyRef);
    return secretValue ?? undefined;
}

export interface ProviderListItem extends ProviderRecord {
    isDefault: boolean;
    authMethod: string;
    authState: string;
}

export interface ProviderSyncResult {
    ok: boolean;
    providerId: string;
    reason?: string;
    detail?: string;
    modelCount: number;
}

class ProviderManagementService {
    private async ensureSupportedProvider(providerId: string): Promise<void> {
        const supportedProviderId = assertSupportedProviderId(providerId);
        const exists = await providerStore.providerExists(supportedProviderId);
        if (!exists) {
            throw new Error(`Provider "${supportedProviderId}" is not registered.`);
        }
    }

    async listProviders(profileId: string): Promise<ProviderListItem[]> {
        const [providers, defaults, authStates] = await Promise.all([
            providerStore.listProviders(),
            providerStore.getDefaults(profileId),
            providerAuthStore.listByProfile(profileId),
        ]);

        const authStateByProvider = new Map(authStates.map((state) => [state.providerId, state]));
        const visibleProviders = providers.filter((provider) => isSupportedProviderId(provider.id));

        return visibleProviders.map((provider) => {
            const authState = authStateByProvider.get(provider.id) ?? defaultAuthState(profileId, provider.id);
            return {
                ...provider,
                isDefault: defaults.providerId === provider.id,
                authMethod: authState.authMethod,
                authState: authState.authState,
            };
        });
    }

    async listModels(profileId: string, providerId: string): Promise<ProviderModelRecord[]> {
        await this.ensureSupportedProvider(providerId);
        return providerStore.listModels(profileId, providerId);
    }

    async listModelsByProfile(profileId: string): Promise<ProviderModelRecord[]> {
        return providerStore.listModelsByProfile(profileId);
    }

    async getDefaults(profileId: string): Promise<{ providerId: string; modelId: string }> {
        return providerStore.getDefaults(profileId);
    }

    async setDefault(
        profileId: string,
        providerId: string,
        modelId: string
    ): Promise<{
        success: boolean;
        reason: 'provider_not_found' | 'model_not_found' | null;
        defaultProviderId: string;
        defaultModelId: string;
    }> {
        try {
            await this.ensureSupportedProvider(providerId);
        } catch {
            const defaults = await providerStore.getDefaults(profileId);
            return {
                success: false,
                reason: 'provider_not_found',
                defaultProviderId: defaults.providerId,
                defaultModelId: defaults.modelId,
            };
        }

        const hasModel = await providerStore.modelExists(profileId, providerId, modelId);
        if (!hasModel) {
            const defaults = await providerStore.getDefaults(profileId);
            return {
                success: false,
                reason: 'model_not_found',
                defaultProviderId: defaults.providerId,
                defaultModelId: defaults.modelId,
            };
        }

        await providerStore.setDefaults(profileId, providerId, modelId);
        const defaults = await providerStore.getDefaults(profileId);

        return {
            success: true,
            reason: null,
            defaultProviderId: defaults.providerId,
            defaultModelId: defaults.modelId,
        };
    }

    async getAuthState(profileId: string, providerId: string): Promise<ProviderAuthStateRecord> {
        await this.ensureSupportedProvider(providerId);
        return (
            (await providerAuthStore.getByProfileAndProvider(profileId, providerId)) ??
            defaultAuthState(profileId, providerId)
        );
    }

    async listAuthStates(profileId: string): Promise<ProviderAuthStateRecord[]> {
        return providerAuthStore.listByProfile(profileId);
    }

    async listDiscoverySnapshots(profileId: string) {
        return providerCatalogStore.listDiscoverySnapshotsByProfile(profileId);
    }

    async setApiKey(profileId: string, providerId: string, apiKey: string): Promise<ProviderAuthStateRecord> {
        await this.ensureSupportedProvider(providerId);

        const trimmed = apiKey.trim();
        if (trimmed.length === 0) {
            throw new Error('Invalid "apiKey": expected non-empty string.');
        }

        const secretKeyRef = buildSecretKeyRef(profileId, providerId, 'api_key');
        await getSecretStore().set(secretKeyRef, trimmed);
        await secretReferenceStore.upsert({
            profileId,
            providerId,
            secretKind: 'api_key',
            secretKeyRef,
            status: 'active',
        });

        await providerAuthStore.upsert({
            profileId,
            providerId,
            authMethod: 'api_key',
            authState: 'configured',
        });

        return this.getAuthState(profileId, providerId);
    }

    async clearAuth(
        profileId: string,
        providerId: string
    ): Promise<{ cleared: boolean; authState: ProviderAuthStateRecord }> {
        await this.ensureSupportedProvider(providerId);
        const refs = await secretReferenceStore.listByProfileAndProvider(profileId, providerId);

        await Promise.allSettled(refs.map((ref) => getSecretStore().delete(ref.secretKeyRef)));
        await secretReferenceStore.deleteByProfileAndProvider(profileId, providerId);

        await providerAuthStore.upsert({
            profileId,
            providerId,
            authMethod: 'none',
            authState: 'logged_out',
        });

        return {
            cleared: refs.length > 0,
            authState: await this.getAuthState(profileId, providerId),
        };
    }

    async syncCatalog(profileId: string, providerId: string, force = false): Promise<ProviderSyncResult> {
        await this.ensureSupportedProvider(providerId);

        const adapter = getProviderAdapter(providerId);
        const authState = await this.getAuthState(profileId, providerId);
        const apiKey = await resolveApiKey(profileId, providerId);

        const syncResult = await adapter.syncCatalog({
            profileId,
            ...(apiKey ? { apiKey } : {}),
            ...(authState.organizationId ? { organizationId: authState.organizationId } : {}),
            ...(force ? { force } : {}),
        });

        if (!syncResult.ok) {
            await providerCatalogStore.upsertDiscoverySnapshot({
                profileId,
                providerId,
                kind: 'models',
                payload: {
                    reason: syncResult.reason,
                    detail: syncResult.detail ?? null,
                },
                status: 'error',
            });

            return {
                ok: false,
                providerId,
                reason: syncResult.reason,
                ...(syncResult.detail ? { detail: syncResult.detail } : {}),
                modelCount: 0,
            };
        }

        const modelCount = await providerCatalogStore.replaceModels(
            profileId,
            providerId,
            syncResult.models.map((model) => ({
                modelId: model.modelId,
                label: model.label,
                ...(model.upstreamProvider ? { upstreamProvider: model.upstreamProvider } : {}),
                isFree: model.isFree,
                supportsTools: model.supportsTools,
                supportsReasoning: model.supportsReasoning,
                ...(model.contextLength !== undefined ? { contextLength: model.contextLength } : {}),
                pricing: model.pricing,
                raw: model.raw,
                source: 'discovery',
            }))
        );

        await Promise.all([
            providerCatalogStore.upsertDiscoverySnapshot({
                profileId,
                providerId,
                kind: 'models',
                payload: syncResult.modelPayload,
                status: 'ok',
            }),
            providerCatalogStore.upsertDiscoverySnapshot({
                profileId,
                providerId,
                kind: 'providers',
                payload: syncResult.providerPayload,
                status: 'ok',
            }),
        ]);

        return {
            ok: true,
            providerId,
            modelCount,
        };
    }
}

export const providerManagementService = new ProviderManagementService();
