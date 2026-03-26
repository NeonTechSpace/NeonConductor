export const kiloFrontierModelId = 'kilo-auto/frontier';
export const kiloBalancedModelId = 'kilo-auto/balanced';
export const kiloFreeModelId = 'kilo-auto/free';
export const kiloSmallModelId = 'kilo-auto/small';
export type KiloModeHeader = 'ask' | 'code' | 'debug' | 'orchestrator' | 'general';

const kiloAutoModelIds = new Set<string>([kiloFrontierModelId, kiloBalancedModelId, kiloFreeModelId, kiloSmallModelId]);

const kiloLegacyModelIdMap = new Map<string, string>([
    ['kilo/auto', kiloFrontierModelId],
    ['kilo/auto-free', kiloFreeModelId],
    ['kilo/code', kiloSmallModelId],
]);

export function canonicalizeKiloModelId(modelId: string): string {
    return kiloLegacyModelIdMap.get(modelId) ?? modelId;
}

export function canonicalizeProviderModelId(providerId: string | undefined, modelId: string): string {
    if (providerId !== 'kilo') {
        return modelId;
    }

    return canonicalizeKiloModelId(modelId);
}

export function isLegacyKiloModelId(modelId: string): boolean {
    return kiloLegacyModelIdMap.has(modelId);
}

export function isKiloAutoModelId(modelId: string): boolean {
    return kiloAutoModelIds.has(canonicalizeKiloModelId(modelId));
}
