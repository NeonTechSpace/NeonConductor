import type { FirstPartyProviderId } from '@/app/backend/providers/registry';
import type { ProviderApiFamily, ProviderToolProtocol } from '@/app/backend/providers/types';

export interface StaticProviderModelDefinition {
    providerId: Exclude<FirstPartyProviderId, 'kilo'>;
    modelId: string;
    label: string;
    availabilityByEndpointProfile: Record<string, boolean>;
    recommendedByEndpointProfile?: Record<string, boolean>;
    supportsTools?: boolean;
    supportsReasoning?: boolean;
    supportsVision?: boolean;
    supportsAudioInput?: boolean;
    supportsAudioOutput?: boolean;
    supportsPromptCache?: boolean;
    supportsRealtimeWebSocket?: boolean;
    toolProtocol?: ProviderToolProtocol;
    apiFamily?: ProviderApiFamily;
    providerNativeId?: string;
    inputModalities?: Array<'text' | 'audio' | 'image' | 'video' | 'pdf'>;
    outputModalities?: Array<'text' | 'audio' | 'image' | 'video' | 'pdf'>;
    promptFamily?: string;
    contextLength?: number;
    maxOutputTokens?: number;
    inputPrice?: number;
    outputPrice?: number;
    cacheReadPrice?: number;
    cacheWritePrice?: number;
    sourceNote: string;
    updatedAt: string;
}
