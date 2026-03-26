import { getProviderCatalogBehavior } from '@/app/backend/providers/behaviors';
import type { KiloGatewayModel } from '@/app/backend/providers/kiloGatewayClient/types';
import type { ProviderCatalogModel, ProviderRoutedApiFamily } from '@/app/backend/providers/types';

type KiloRunnableRoutedApiFamily = Exclude<ProviderRoutedApiFamily, 'provider_native'>;

export interface ClassifyKiloModelInput {
    modelsByProviderIndex: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface KiloRejectedModelDiagnostic {
    modelId: string;
    label: string;
    upstreamProvider?: string;
    promptFamily?: string;
    reason: 'provider_native' | 'missing_runtime_family' | 'contradictory_metadata';
    detail: string;
    raw: Record<string, unknown>;
}

export type KiloModelClassificationResult =
    | {
          status: 'accepted';
          model: ProviderCatalogModel;
      }
    | {
          status: 'rejected';
          diagnostic: KiloRejectedModelDiagnostic;
      };

export function buildModelsByProviderIndex(
    payload: Array<{ providerId: string; modelIds: string[] }>
): Map<string, ReadonlySet<string>> {
    const index = new Map<string, Set<string>>();
    for (const entry of payload) {
        index.set(entry.providerId, new Set(entry.modelIds));
    }

    return index;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseExplicitRoutedApiFamily(value: unknown): ProviderRoutedApiFamily | undefined {
    if (
        value === 'openai_compatible' ||
        value === 'provider_native' ||
        value === 'anthropic_messages' ||
        value === 'google_generativeai'
    ) {
        return value;
    }

    return undefined;
}

function hasProviderNativeHint(raw: Record<string, unknown>): boolean {
    const providerNativeId = raw['provider_native_id'];
    if (typeof providerNativeId === 'string' && providerNativeId.trim().length > 0) {
        return true;
    }

    const providerSettings = isRecord(raw['provider_settings']) ? raw['provider_settings'] : undefined;
    return typeof providerSettings?.['providerNativeId'] === 'string';
}

function mapPromptFamilyToRoutedApiFamily(promptFamily: string): KiloRunnableRoutedApiFamily | undefined {
    if (promptFamily === 'anthropic') {
        return 'anthropic_messages';
    }

    if (promptFamily === 'google' || promptFamily === 'gemini') {
        return 'google_generativeai';
    }

    if (promptFamily === 'openai' || promptFamily === 'codex') {
        return 'openai_compatible';
    }

    return undefined;
}

function mapProviderIdToSpecialRoutedApiFamily(
    providerId: string
): Exclude<KiloRunnableRoutedApiFamily, 'openai_compatible'> | undefined {
    if (providerId === 'anthropic') {
        return 'anthropic_messages';
    }

    if (
        providerId === 'google' ||
        providerId === 'google-ai-studio' ||
        providerId === 'google-vertex' ||
        providerId === 'vertex-ai'
    ) {
        return 'google_generativeai';
    }

    return undefined;
}

function getModelNamespace(modelId: string): string | undefined {
    const slashIndex = modelId.indexOf('/');
    if (slashIndex <= 0) {
        return undefined;
    }

    return modelId.slice(0, slashIndex).trim().toLowerCase() || undefined;
}

function getSpecialProviderMembershipFamilies(
    modelId: string,
    input: ClassifyKiloModelInput
): Set<Exclude<KiloRunnableRoutedApiFamily, 'openai_compatible'>> {
    const families = new Set<Exclude<KiloRunnableRoutedApiFamily, 'openai_compatible'>>();

    for (const [providerId, modelIds] of input.modelsByProviderIndex) {
        if (!modelIds.has(modelId)) {
            continue;
        }

        const routedApiFamily = mapProviderIdToSpecialRoutedApiFamily(providerId.trim().toLowerCase());
        if (routedApiFamily) {
            families.add(routedApiFamily);
        }
    }

    return families;
}

function buildRejectedDiagnostic(
    model: KiloGatewayModel,
    reason: KiloRejectedModelDiagnostic['reason'],
    detail: string
): KiloRejectedModelDiagnostic {
    return {
        modelId: model.id,
        label: model.name,
        ...(model.upstreamProvider ? { upstreamProvider: model.upstreamProvider } : {}),
        ...(model.promptFamily ? { promptFamily: model.promptFamily } : {}),
        reason,
        detail,
        raw: model.raw,
    };
}

function collectSpecialRoutingSignals(
    model: KiloGatewayModel,
    input: ClassifyKiloModelInput
): Set<Exclude<KiloRunnableRoutedApiFamily, 'openai_compatible'>> {
    const specialFamilies = getSpecialProviderMembershipFamilies(model.id, input);
    const promptFamily = model.promptFamily?.trim().toLowerCase();
    const promptRoutedApiFamily = promptFamily ? mapPromptFamilyToRoutedApiFamily(promptFamily) : undefined;
    if (promptRoutedApiFamily === 'anthropic_messages' || promptRoutedApiFamily === 'google_generativeai') {
        specialFamilies.add(promptRoutedApiFamily);
    }

    const upstreamProvider = model.upstreamProvider?.trim().toLowerCase();
    if (upstreamProvider) {
        const upstreamRoutedApiFamily = mapProviderIdToSpecialRoutedApiFamily(upstreamProvider);
        if (upstreamRoutedApiFamily) {
            specialFamilies.add(upstreamRoutedApiFamily);
        }
    }

    const modelNamespace = getModelNamespace(model.id);
    if (modelNamespace) {
        const namespaceRoutedApiFamily = mapProviderIdToSpecialRoutedApiFamily(modelNamespace);
        if (namespaceRoutedApiFamily) {
            specialFamilies.add(namespaceRoutedApiFamily);
        }
    }

    return specialFamilies;
}

function resolveKiloRoutedApiFamily(
    model: KiloGatewayModel,
    input: ClassifyKiloModelInput
):
    | {
          ok: true;
          routedApiFamily: KiloRunnableRoutedApiFamily;
      }
    | {
          ok: false;
          diagnostic: KiloRejectedModelDiagnostic;
      } {
    const explicitFamily =
        parseExplicitRoutedApiFamily(model.raw['routed_api_family']) ??
        parseExplicitRoutedApiFamily(model.raw['routedApiFamily']) ??
        parseExplicitRoutedApiFamily(model.raw['upstream_api_family']) ??
        parseExplicitRoutedApiFamily(model.raw['upstreamApiFamily']);
    if (explicitFamily === 'provider_native') {
        return {
            ok: false,
            diagnostic: buildRejectedDiagnostic(
                model,
                'provider_native',
                'Kilo model declares provider-native runtime handling.'
            ),
        };
    }

    if (hasProviderNativeHint(model.raw)) {
        return {
            ok: false,
            diagnostic: buildRejectedDiagnostic(
                model,
                'provider_native',
                'Kilo model includes provider-native execution hints.'
            ),
        };
    }

    const specialFamilies = collectSpecialRoutingSignals(model, input);
    if (explicitFamily === 'anthropic_messages' || explicitFamily === 'google_generativeai') {
        specialFamilies.add(explicitFamily);
    }
    if (specialFamilies.size > 1) {
        return {
            ok: false,
            diagnostic: buildRejectedDiagnostic(
                model,
                'contradictory_metadata',
                'Kilo model metadata points to conflicting routed API families.'
            ),
        };
    }

    if (explicitFamily) {
        return {
            ok: true,
            routedApiFamily: explicitFamily,
        };
    }

    const promptFamily = model.promptFamily?.trim().toLowerCase();
    if (promptFamily) {
        const promptRoutedApiFamily = mapPromptFamilyToRoutedApiFamily(promptFamily);
        if (promptRoutedApiFamily) {
            return {
                ok: true,
                routedApiFamily: promptRoutedApiFamily,
            };
        }
    }

    const specialRoutedApiFamily = specialFamilies.values().next().value;
    if (specialRoutedApiFamily) {
        return {
            ok: true,
            routedApiFamily: specialRoutedApiFamily,
        };
    }

    const upstreamProvider = model.upstreamProvider?.trim().toLowerCase();
    const modelNamespace = getModelNamespace(model.id);
    if (upstreamProvider || modelNamespace) {
        return {
            ok: true,
            routedApiFamily: 'openai_compatible',
        };
    }

    return {
        ok: false,
        diagnostic: buildRejectedDiagnostic(
            model,
            'missing_runtime_family',
            'Kilo model does not expose enough metadata to determine a runnable runtime family.'
        ),
    };
}

function buildNormalizedKiloModel(
    model: KiloGatewayModel,
    routedApiFamily: KiloRunnableRoutedApiFamily
): ProviderCatalogModel {
    const behavior = getProviderCatalogBehavior('kilo');
    const features = behavior.createCapabilities({
        modelId: model.id,
        supportedParameters: model.supportedParameters,
        inputModalities: model.inputModalities,
        outputModalities: model.outputModalities,
    });

    return {
        modelId: model.id,
        label: model.name,
        ...(model.upstreamProvider ? { upstreamProvider: model.upstreamProvider } : {}),
        isFree: model.id.endsWith(':free'),
        features: {
            ...features,
            ...(typeof model.pricing['cache_read'] === 'number' || typeof model.pricing['cache_write'] === 'number'
                ? { supportsPromptCache: true }
                : {}),
        },
        runtime: {
            toolProtocol: 'kilo_gateway',
            apiFamily: 'kilo_gateway',
            routedApiFamily,
        },
        ...(model.promptFamily ? { promptFamily: model.promptFamily } : {}),
        ...(model.contextLength !== undefined ? { contextLength: model.contextLength } : {}),
        pricing: model.pricing,
        raw: model.raw,
    };
}

export function classifyKiloModel(
    model: KiloGatewayModel,
    input: ClassifyKiloModelInput
): KiloModelClassificationResult {
    const routedApiFamily = resolveKiloRoutedApiFamily(model, input);
    if (!routedApiFamily.ok) {
        return {
            status: 'rejected',
            diagnostic: routedApiFamily.diagnostic,
        };
    }

    return {
        status: 'accepted',
        model: buildNormalizedKiloModel(model, routedApiFamily.routedApiFamily),
    };
}
