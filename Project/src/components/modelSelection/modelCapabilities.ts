import { formatRuntimeCapabilityIssue, isProviderRunnable } from '@/web/lib/runtimeCapabilityIssue';

import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';
import type { ProviderToolProtocol } from '@/app/backend/providers/types';

import type {
    ModelCompatibilityIssue,
    RuntimeCompatibilityState,
    RuntimeProviderId,
    RuntimeReasoningEffort,
} from '@/shared/contracts';

export type ModelCompatibilityState = RuntimeCompatibilityState;

export interface ModelCapabilityBadge {
    key: 'native_tools' | 'vision' | 'reasoning' | 'prompt_cache' | 'protocol';
    label: string;
}

export interface ModelPickerOption {
    id: string;
    label: string;
    providerId?: RuntimeProviderId;
    providerLabel?: string;
    sourceProvider?: string;
    source?: string;
    promptFamily?: string;
    reasoningEfforts?: RuntimeReasoningEffort[];
    price?: number;
    latency?: number;
    tps?: number;
    supportsTools: boolean;
    supportsVision: boolean;
    supportsReasoning: boolean;
    supportsPromptCache?: boolean;
    toolProtocol?: ProviderToolProtocol;
    capabilityBadges: ModelCapabilityBadge[];
    compatibilityState: ModelCompatibilityState;
    compatibilityScope?: 'provider' | 'model' | 'runtime';
    compatibilityIssue?: ModelCompatibilityIssue;
    compatibilityReason?: string;
}

interface ModelCompatibilityContext {
    surface: 'conversation' | 'settings';
    provider?: Pick<ProviderListItem, 'id' | 'label' | 'authState' | 'authMethod'>;
    requiresTools?: boolean | undefined;
    modeKey?: string | undefined;
    hasPendingImageAttachments?: boolean | undefined;
    imageAttachmentsAllowed?: boolean | undefined;
}

const protocolLabels: Record<ProviderToolProtocol, string> = {
    openai_responses: 'Responses',
    openai_chat_completions: 'Chat Completions',
    kilo_gateway: 'Kilo Gateway',
    provider_native: 'Provider Native',
    anthropic_messages: 'Anthropic Messages',
    google_generativeai: 'Google Gemini',
};

export function getToolProtocolLabel(toolProtocol: ProviderToolProtocol | undefined): string | undefined {
    if (!toolProtocol) {
        return undefined;
    }

    return protocolLabels[toolProtocol];
}

export function getModelCapabilityBadges(
    model: Pick<ProviderModelRecord, 'features' | 'runtime'>
): ModelCapabilityBadge[] {
    const badges: ModelCapabilityBadge[] = [];
    if (model.features.supportsTools) {
        badges.push({
            key: 'native_tools',
            label: 'Native Tools',
        });
    }
    if (model.features.supportsVision) {
        badges.push({
            key: 'vision',
            label: 'Vision',
        });
    }
    if (model.features.supportsReasoning) {
        badges.push({
            key: 'reasoning',
            label: 'Reasoning',
        });
    }
    if (model.features.supportsPromptCache) {
        badges.push({
            key: 'prompt_cache',
            label: 'Prompt Cache',
        });
    }

    const protocolLabel = getToolProtocolLabel(model.runtime.toolProtocol);
    if (protocolLabel) {
        badges.push({
            key: 'protocol',
            label: protocolLabel,
        });
    }

    return badges;
}

export function resolveModelCompatibility(
    model: Pick<ProviderModelRecord, 'features' | 'runtime'>,
    context: ModelCompatibilityContext
): {
    state: ModelCompatibilityState;
    scope?: 'provider' | 'model' | 'runtime';
    issue?: ModelCompatibilityIssue;
} {
    if (context.provider && !isProviderRunnable(context.provider.authState, context.provider.authMethod)) {
        return {
            state: context.surface === 'settings' ? 'warning' : 'incompatible',
            scope: 'provider',
            issue: {
                code: 'provider_not_runnable',
                providerId: context.provider.id,
            },
        };
    }

    if (context.hasPendingImageAttachments) {
        if (context.imageAttachmentsAllowed === false) {
            return {
                state: 'incompatible',
                scope: 'runtime',
                issue: {
                    code: 'runtime_options_invalid',
                    detail: 'attachments_not_allowed',
                },
            };
        }

        if (!model.features.supportsVision) {
            return {
                state: 'incompatible',
                scope: 'model',
                issue: {
                    code: 'model_vision_required',
                },
            };
        }
    }

    if (context.requiresTools && !model.features.supportsTools) {
        return {
            state: 'incompatible',
            scope: 'model',
            issue: {
                code: 'model_tools_required',
                modeKey: context.modeKey ?? 'chat',
            },
        };
    }

    return {
        state: 'compatible',
    };
}

export function buildModelPickerOption(input: {
    model: ProviderModelRecord;
    provider?: Pick<ProviderListItem, 'id' | 'label' | 'authState' | 'authMethod'>;
    compatibilityContext: ModelCompatibilityContext;
}): ModelPickerOption {
    const compatibility = resolveModelCompatibility(input.model, {
        ...input.compatibilityContext,
        ...(input.provider
            ? {
                  provider: input.provider,
              }
            : {}),
    });

    return {
        id: input.model.id,
        label: input.model.label,
        ...(input.provider ? { providerId: input.provider.id, providerLabel: input.provider.label } : {}),
        ...(input.model.sourceProvider ? { sourceProvider: input.model.sourceProvider } : {}),
        ...(input.model.source ? { source: input.model.source } : {}),
        ...(input.model.promptFamily ? { promptFamily: input.model.promptFamily } : {}),
        ...(input.model.reasoningEfforts ? { reasoningEfforts: input.model.reasoningEfforts } : {}),
        ...(input.model.price !== undefined ? { price: input.model.price } : {}),
        ...(input.model.latency !== undefined ? { latency: input.model.latency } : {}),
        ...(input.model.tps !== undefined ? { tps: input.model.tps } : {}),
        supportsTools: input.model.features.supportsTools,
        supportsVision: input.model.features.supportsVision,
        supportsReasoning: input.model.features.supportsReasoning,
        ...(input.model.features.supportsPromptCache !== undefined
            ? { supportsPromptCache: input.model.features.supportsPromptCache }
            : {}),
        toolProtocol: input.model.runtime.toolProtocol,
        capabilityBadges: getModelCapabilityBadges(input.model),
        compatibilityState: compatibility.state,
        ...(compatibility.scope ? { compatibilityScope: compatibility.scope } : {}),
        ...(compatibility.issue ? { compatibilityIssue: compatibility.issue } : {}),
        ...(compatibility.issue
            ? {
                  compatibilityReason: formatRuntimeCapabilityIssue({
                      issue: compatibility.issue,
                      surface:
                          input.compatibilityContext.surface === 'settings' ? 'settings_option' : 'conversation_option',
                      ...(input.provider
                          ? {
                                providerLabel: input.provider.label,
                            }
                          : {}),
                  }),
              }
            : {}),
    };
}

export function isCompatibleModelOption(option: Pick<ModelPickerOption, 'compatibilityState'>): boolean {
    return option.compatibilityState === 'compatible';
}

export function getModelCompatibilityPriority(option: Pick<ModelPickerOption, 'compatibilityState'>): number {
    if (option.compatibilityState === 'compatible') {
        return 0;
    }

    if (option.compatibilityState === 'warning') {
        return 1;
    }

    return 2;
}

export function getModelRuntimeNotes(
    model: Pick<ModelPickerOption, 'supportsTools' | 'supportsVision' | 'supportsPromptCache' | 'toolProtocol'>
): string[] {
    const notes: string[] = [];

    if (!model.supportsTools) {
        notes.push('Agent modes that require native tools will skip this model.');
    }

    if (!model.supportsVision) {
        notes.push('Image attachments are unavailable with this model.');
    }

    if (model.supportsPromptCache === false) {
        notes.push('Prompt cache is unavailable for this model.');
    }

    if (model.toolProtocol === 'provider_native') {
        notes.push('This model uses a provider-native runtime path.');
    }

    return notes;
}
