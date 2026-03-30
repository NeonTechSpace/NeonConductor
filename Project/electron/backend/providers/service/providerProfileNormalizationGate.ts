import { normalizeOpenAIBoundaryForProfile } from '@/app/backend/providers/openAIBoundaryNormalization';

export class ProviderProfileNormalizationGate {
    constructor(private readonly normalizeProfile: (profileId: string) => Promise<void>) {}

    private readonly normalizationByProfileId = new Map<string, Promise<void>>();

    async ensureNormalized(profileId: string): Promise<void> {
        const inFlightNormalization = this.normalizationByProfileId.get(profileId);
        if (inFlightNormalization) {
            return inFlightNormalization;
        }

        const normalization = this.normalizeProfile(profileId);
        this.normalizationByProfileId.set(profileId, normalization);
        try {
            await normalization;
        } finally {
            this.normalizationByProfileId.delete(profileId);
        }
    }
}

export function createProviderProfileNormalizationGate(
    normalizeProfile: (profileId: string) => Promise<void> = normalizeOpenAIBoundaryForProfile
) {
    return new ProviderProfileNormalizationGate(normalizeProfile);
}

export const providerProfileNormalizationGate = createProviderProfileNormalizationGate();
