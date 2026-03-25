import { normalizeModalities } from '@/app/backend/providers/behaviors/catalogCapabilities';
import type { ProviderCatalogBehavior } from '@/app/backend/providers/behaviors/types';

export const kiloCatalogBehavior: ProviderCatalogBehavior = {
    providerId: 'kilo',
    createCapabilities(input) {
        const supportedParameters = input.supportedParameters ?? [];
        const inputModalities = normalizeModalities(input.inputModalities);
        const outputModalities = normalizeModalities(input.outputModalities);

        return {
            supportsTools: supportedParameters.includes('tools'),
            supportsReasoning: supportedParameters.includes('reasoning'),
            supportsVision: inputModalities.includes('image') || outputModalities.includes('image'),
            supportsAudioInput: inputModalities.includes('audio'),
            supportsAudioOutput: outputModalities.includes('audio'),
            inputModalities,
            outputModalities,
        };
    },
};
