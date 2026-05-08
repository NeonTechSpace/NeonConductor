import { providerStore } from '@/app/backend/persistence/stores';
import { ensureSupportedProvider } from '@/app/backend/providers/service/helpers';
import type {
    InternalModelRole,
    ModelRoleDefaultRecord,
    RuntimeProviderId,
} from '@/app/backend/runtime/contracts';
import { resolvePlanningWorkflowRoutingRunTarget } from '@/app/backend/runtime/services/plan/workflowRoutingTarget';
import { memoryRetrievalModelService } from '@/app/backend/runtime/services/profile/memoryRetrievalModel';
import { utilityModelService } from '@/app/backend/runtime/services/profile/utilityModel';
import { canonicalizeProviderModelId } from '@/shared/kiloModels';

const roleLabels: Record<InternalModelRole, string> = {
    chat: 'Chat',
    planner: 'Planner',
    apply: 'Apply',
    utility: 'Utility',
    memory_retrieval: 'Memory Retrieval',
    embeddings: 'Embeddings',
    rerank: 'Rerank',
};

async function resolveOverride(input: {
    profileId: string;
    role: InternalModelRole;
}): Promise<ModelRoleDefaultRecord | undefined> {
    const overrides = await providerStore.getModelRoleDefaults(input.profileId);
    const override = overrides.find((candidate) => candidate.role === input.role);
    if (!override) {
        return undefined;
    }
    const modelExists = await providerStore.modelExists(input.profileId, override.providerId, override.modelId);
    if (!modelExists) {
        return {
            role: input.role,
            providerId: override.providerId,
            modelId: override.modelId,
            source: 'role_override',
            sourceLabel: 'Saved role override',
            status: 'unconfigured',
            detail: 'The saved model role override points to a model that is no longer available.',
        };
    }
    return {
        role: input.role,
        providerId: override.providerId,
        modelId: override.modelId,
        source: 'role_override',
        sourceLabel: 'Saved role override',
        status: 'configured',
    };
}

async function resolveSharedDefault(profileId: string): Promise<ModelRoleDefaultRecord | undefined> {
    const defaults = await providerStore.getDefaults(profileId);
    const providerId = defaults.providerId as RuntimeProviderId;
    if (!defaults.providerId || !defaults.modelId) {
        return undefined;
    }
    const ensuredProvider = await ensureSupportedProvider(providerId);
    if (ensuredProvider.isErr()) {
        return undefined;
    }
    const modelId = canonicalizeProviderModelId(ensuredProvider.value, defaults.modelId);
    return {
        role: 'chat',
        providerId: ensuredProvider.value,
        modelId,
        source: 'shared_default',
        sourceLabel: 'Shared conversation default',
        status: 'configured',
    };
}

async function resolveCompatibilityDefault(input: {
    profileId: string;
    role: InternalModelRole;
}): Promise<ModelRoleDefaultRecord> {
    const sharedDefault = await resolveSharedDefault(input.profileId);
    if (input.role === 'planner') {
        const plannerTarget = await resolvePlanningWorkflowRoutingRunTarget({
            profileId: input.profileId,
            planningDepth: 'simple',
        });
        if (plannerTarget) {
            return {
                role: input.role,
                providerId: plannerTarget.providerId,
                modelId: plannerTarget.modelId,
                source: 'workflow_routing',
                sourceLabel: 'Planning workflow routing',
                status: 'configured',
            };
        }
    }
    if (input.role === 'utility' && sharedDefault?.providerId && sharedDefault.modelId) {
        const utilityTarget = await utilityModelService.resolveUtilityModelTarget({
            profileId: input.profileId,
            fallbackProviderId: sharedDefault.providerId,
            fallbackModelId: sharedDefault.modelId,
        });
        return {
            role: input.role,
            providerId: utilityTarget.providerId,
            modelId: utilityTarget.modelId,
            source: utilityTarget.source === 'utility' ? 'utility_preference' : 'shared_default',
            sourceLabel: utilityTarget.source === 'utility' ? 'Saved Utility AI selection' : 'Shared default fallback',
            status: utilityTarget.source === 'utility' ? 'configured' : 'fallback',
        };
    }
    if (input.role === 'memory_retrieval') {
        const preference = await memoryRetrievalModelService.getMemoryRetrievalModelPreference(input.profileId);
        return {
            role: input.role,
            ...(preference.selection?.providerId ? { providerId: preference.selection.providerId } : {}),
            ...(preference.selection?.modelId ? { modelId: preference.selection.modelId } : {}),
            source: preference.selection ? 'memory_retrieval_preference' : 'diagnostic_only',
            sourceLabel: preference.selection ? 'Saved memory retrieval selection' : 'No memory retrieval model configured',
            status: preference.selection ? 'configured' : 'unconfigured',
        };
    }
    if (input.role === 'embeddings' || input.role === 'rerank') {
        return {
            role: input.role,
            source: 'diagnostic_only',
            sourceLabel: 'Read-only diagnostic',
            status: 'unconfigured',
            detail: `${roleLabels[input.role]} is reserved and is not independently runnable in this alpha slice.`,
        };
    }
    if (sharedDefault) {
        return {
            ...sharedDefault,
            role: input.role,
            source: input.role === 'chat' ? 'shared_default' : 'shared_default',
            sourceLabel: input.role === 'chat' ? 'Shared conversation default' : 'Shared default fallback',
            status: input.role === 'chat' ? 'configured' : 'fallback',
        };
    }
    return {
        role: input.role,
        source: 'shared_default',
        sourceLabel: 'Shared default unavailable',
        status: 'unconfigured',
        detail: 'No shared default provider/model is available.',
    };
}

export class ModelRoleDefaultService {
    async listRoleDefaults(profileId: string): Promise<ModelRoleDefaultRecord[]> {
        const roles: InternalModelRole[] = ['chat', 'planner', 'apply', 'utility', 'memory_retrieval', 'embeddings', 'rerank'];
        return Promise.all(roles.map((role) => this.resolveRoleDefault({ profileId, role })));
    }

    async resolveRoleDefault(input: {
        profileId: string;
        role: InternalModelRole;
    }): Promise<ModelRoleDefaultRecord> {
        const override = await resolveOverride(input);
        if (override) {
            return override;
        }
        return resolveCompatibilityDefault(input);
    }

    async setRoleDefault(input: {
        profileId: string;
        role: InternalModelRole;
        providerId: RuntimeProviderId;
        modelId: string;
    }): Promise<{ success: boolean; reason: 'provider_not_found' | 'model_not_found' | null; roleDefaults: ModelRoleDefaultRecord[] }> {
        const ensuredProviderResult = await ensureSupportedProvider(input.providerId);
        if (ensuredProviderResult.isErr()) {
            return {
                success: false,
                reason: 'provider_not_found',
                roleDefaults: await this.listRoleDefaults(input.profileId),
            };
        }
        const providerId = ensuredProviderResult.value;
        const modelId = canonicalizeProviderModelId(providerId, input.modelId);
        const modelExists = await providerStore.modelExists(input.profileId, providerId, modelId);
        if (!modelExists) {
            return {
                success: false,
                reason: 'model_not_found',
                roleDefaults: await this.listRoleDefaults(input.profileId),
            };
        }
        await providerStore.setModelRoleDefault(input.profileId, {
            role: input.role,
            providerId,
            modelId,
        });
        return {
            success: true,
            reason: null,
            roleDefaults: await this.listRoleDefaults(input.profileId),
        };
    }

    async clearRoleDefault(input: {
        profileId: string;
        role: InternalModelRole;
    }): Promise<{ success: boolean; roleDefaults: ModelRoleDefaultRecord[] }> {
        await providerStore.clearModelRoleDefault(input.profileId, input.role);
        return {
            success: true,
            roleDefaults: await this.listRoleDefaults(input.profileId),
        };
    }
}

export const modelRoleDefaultService = new ModelRoleDefaultService();
