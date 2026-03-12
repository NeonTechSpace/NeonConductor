import { providerStore } from '@/app/backend/persistence/stores';
import type {
    ComposerImageAttachmentInput,
    ModeDefinition,
    RuntimeProviderId,
    RuntimeRunOptions,
    TopLevelTab,
} from '@/app/backend/runtime/contracts';
import { assessRunTargetCompatibility } from '@/app/backend/runtime/services/runExecution/compatibility';
import type { ResolvedRunAuth, ResolvedRunTarget } from '@/app/backend/runtime/services/runExecution/types';

export interface RunnableRunTarget {
    target: ResolvedRunTarget;
    auth: ResolvedRunAuth;
}

interface CompatibleRunTargetInput {
    profileId: string;
    topLevelTab: TopLevelTab;
    mode: ModeDefinition;
    runtimeOptions: RuntimeRunOptions;
    attachments?: ComposerImageAttachmentInput[];
    preferredTarget?: { providerId: RuntimeProviderId; modelId: string };
    excluded?: { providerId: RuntimeProviderId; modelId: string };
}

async function tryResolveCompatibleTarget(
    input: CompatibleRunTargetInput,
    candidate: { providerId: RuntimeProviderId; modelId: string }
): Promise<RunnableRunTarget | null> {
    if (
        input.excluded &&
        input.excluded.providerId === candidate.providerId &&
        input.excluded.modelId === candidate.modelId
    ) {
        return null;
    }

    const assessment = await assessRunTargetCompatibility({
        profileId: input.profileId,
        providerId: candidate.providerId,
        modelId: candidate.modelId,
        topLevelTab: input.topLevelTab,
        mode: input.mode,
        runtimeOptions: input.runtimeOptions,
        ...(input.attachments ? { attachments: input.attachments } : {}),
    });
    if (!assessment.compatible) {
        return null;
    }

    return {
        target: {
            providerId: candidate.providerId,
            modelId: candidate.modelId,
        },
        auth: assessment.auth,
    };
}

export async function resolveFirstRunnableRunTarget(
    input: CompatibleRunTargetInput
): Promise<RunnableRunTarget | null> {
    if (input.preferredTarget) {
        const preferred = await tryResolveCompatibleTarget(input, input.preferredTarget);
        if (preferred) {
            return preferred;
        }
    }

    const providers = await providerStore.listProviders();
    for (const provider of providers) {
        const models = await providerStore.listModels(input.profileId, provider.id);
        if (models.length === 0) {
            continue;
        }

        for (const model of models) {
            const compatible = await tryResolveCompatibleTarget(input, {
                providerId: provider.id,
                modelId: model.id,
            });
            if (compatible) {
                return compatible;
            }
        }
    }

    return null;
}
