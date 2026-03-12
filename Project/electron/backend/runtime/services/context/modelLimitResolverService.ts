import { modelLimitOverrideStore, providerStore } from '@/app/backend/persistence/stores';
import { findStaticModelDefinition } from '@/app/backend/providers/metadata/staticCatalog/registry';
import { resolveConnectionProfile } from '@/app/backend/providers/service/endpointProfiles';
import type { ResolvedModelLimits, RuntimeProviderId } from '@/app/backend/runtime/contracts';

type BaseModelLimitSource = Exclude<ResolvedModelLimits['source'], 'mixed'>;

interface BaseModelLimits {
    contextLength?: number;
    maxOutputTokens?: number;
    updatedAt?: string;
    source: BaseModelLimitSource;
}

function summarizeSource(input: {
    contextLengthSource: ResolvedModelLimits['contextLengthSource'];
    maxOutputTokensSource: ResolvedModelLimits['maxOutputTokensSource'];
}): ResolvedModelLimits['source'] {
    if (input.contextLengthSource === 'unknown' && input.maxOutputTokensSource === 'unknown') {
        return 'unknown';
    }
    if (input.contextLengthSource === input.maxOutputTokensSource) {
        return input.contextLengthSource;
    }
    return 'mixed';
}

async function readStaticModelLimits(
    profileId: string,
    providerId: RuntimeProviderId,
    modelId: string
): Promise<BaseModelLimits | null> {
    if (providerId === 'kilo') {
        return null;
    }

    const connectionProfileResult = await resolveConnectionProfile(profileId, providerId);
    if (connectionProfileResult.isErr()) {
        return null;
    }

    const definition = findStaticModelDefinition(providerId, connectionProfileResult.value.optionProfileId, modelId);
    if (!definition) {
        return null;
    }

    return {
        ...(definition.contextLength !== undefined ? { contextLength: definition.contextLength } : {}),
        ...(definition.maxOutputTokens !== undefined ? { maxOutputTokens: definition.maxOutputTokens } : {}),
        source: 'static',
        updatedAt: definition.updatedAt,
    };
}

async function readCatalogModelLimits(
    profileId: string,
    providerId: RuntimeProviderId,
    modelId: string
): Promise<BaseModelLimits | null> {
    const model = await providerStore.getModel(profileId, providerId, modelId);
    if (!model) {
        return null;
    }

    const source: BaseModelLimitSource = providerId === 'kilo' ? 'discovery' : 'static';
    return {
        ...(model.contextLength !== undefined ? { contextLength: model.contextLength } : {}),
        ...(model.maxOutputTokens !== undefined ? { maxOutputTokens: model.maxOutputTokens } : {}),
        ...(model.updatedAt ? { updatedAt: model.updatedAt } : {}),
        source,
    };
}

class ModelLimitResolverService {
    async resolve(input: {
        profileId: string;
        providerId: RuntimeProviderId;
        modelId: string;
    }): Promise<ResolvedModelLimits> {
        const [override, catalogLimits, staticLimits] = await Promise.all([
            modelLimitOverrideStore.get(input.providerId, input.modelId),
            readCatalogModelLimits(input.profileId, input.providerId, input.modelId),
            readStaticModelLimits(input.profileId, input.providerId, input.modelId),
        ]);

        const fallbackLimits = catalogLimits ?? staticLimits;

        const contextLength = override?.contextLength ?? fallbackLimits?.contextLength;
        const maxOutputTokens = override?.maxOutputTokens ?? fallbackLimits?.maxOutputTokens;
        const contextLengthSource =
            override?.contextLength !== undefined
                ? 'override'
                : fallbackLimits?.contextLength !== undefined
                  ? fallbackLimits.source
                  : 'unknown';
        const maxOutputTokensSource =
            override?.maxOutputTokens !== undefined
                ? 'override'
                : fallbackLimits?.maxOutputTokens !== undefined
                  ? fallbackLimits.source
                  : 'unknown';

        const updatedAt = override?.updatedAt ?? fallbackLimits?.updatedAt;

        return {
            profileId: input.profileId,
            providerId: input.providerId,
            modelId: input.modelId,
            ...(contextLength !== undefined ? { contextLength } : {}),
            ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
            contextLengthSource,
            maxOutputTokensSource,
            source: summarizeSource({
                contextLengthSource,
                maxOutputTokensSource,
            }),
            ...(updatedAt ? { updatedAt } : {}),
            ...(override ? { overrideReason: override.reason } : {}),
            modelLimitsKnown: contextLength !== undefined,
        };
    }
}

export const modelLimitResolverService = new ModelLimitResolverService();
