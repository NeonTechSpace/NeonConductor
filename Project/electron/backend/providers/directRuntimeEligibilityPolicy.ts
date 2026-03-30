import { supportsDirectAnthropicRuntimeContext } from '@/app/backend/providers/adapters/anthropicDirect';
import { supportsDirectGeminiRuntimeContext } from '@/app/backend/providers/adapters/geminiDirect';
import type {
    ResolveRuntimeFamilyInput,
    ResolvedRuntimeFamilyProtocol,
    RuntimeFamilyCatalogInput,
} from '@/app/backend/providers/runtimeFamilyPolicy.types';
import { resolveProviderRuntimePathContext } from '@/app/backend/providers/runtimePathContext';
import { buildTransport, invalidRuntimeOption, invalidTransportOverride } from '@/app/backend/providers/transportOverridePolicy';
import { okRunExecution, type RunExecutionResult } from '@/app/backend/runtime/services/runExecution/errors';

function supportsDirectCatalogRuntimeFamily(
    input: RuntimeFamilyCatalogInput,
    toolProtocol: 'anthropic_messages' | 'google_generativeai',
    supportsContext: (input: { providerId: RuntimeFamilyCatalogInput['providerId']; resolvedBaseUrl: string | null }) => boolean
): boolean {
    return (
        input.providerId !== 'kilo' &&
        input.model.runtime.toolProtocol === toolProtocol &&
        !!input.context &&
        supportsContext({
            providerId: input.providerId,
            resolvedBaseUrl: input.context.resolvedBaseUrl,
        })
    );
}

export function supportsAnthropicCatalogRuntimeFamily(input: RuntimeFamilyCatalogInput): boolean {
    return supportsDirectCatalogRuntimeFamily(input, 'anthropic_messages', supportsDirectAnthropicRuntimeContext);
}

export function supportsGeminiCatalogRuntimeFamily(input: RuntimeFamilyCatalogInput): boolean {
    return supportsDirectCatalogRuntimeFamily(input, 'google_generativeai', supportsDirectGeminiRuntimeContext);
}

async function resolveDirectRuntimeProtocol(input: {
    runtimeFamilyInput: ResolveRuntimeFamilyInput;
    protocolLabel: 'anthropic_messages' | 'google_generativeai';
    providerLabel: 'Anthropic' | 'Gemini';
    supportsContext: (input: {
        providerId: ResolveRuntimeFamilyInput['providerId'];
        resolvedBaseUrl: string | null;
    }) => boolean;
}): Promise<RunExecutionResult<ResolvedRuntimeFamilyProtocol>> {
    const runtime = input.runtimeFamilyInput.modelCapabilities.runtime;

    if (input.runtimeFamilyInput.providerId === 'kilo') {
        return invalidRuntimeOption({
            providerId: input.runtimeFamilyInput.providerId,
            modelId: input.runtimeFamilyInput.modelId,
            message: `Model "${input.runtimeFamilyInput.modelId}" declares direct ${input.providerLabel} protocol but provider "${input.runtimeFamilyInput.providerId}" must use gateway routing instead.`,
        });
    }

    const transportError = invalidTransportOverride(input.runtimeFamilyInput, `protocol "${input.protocolLabel}"`);
    if (transportError) {
        return transportError;
    }

    if (input.runtimeFamilyInput.authMethod !== 'api_key') {
        return invalidRuntimeOption({
            providerId: input.runtimeFamilyInput.providerId,
            modelId: input.runtimeFamilyInput.modelId,
            message: `Model "${input.runtimeFamilyInput.modelId}" requires API key authentication for the direct ${input.providerLabel} runtime path.`,
        });
    }

    const runtimePathResult = await resolveProviderRuntimePathContext(
        input.runtimeFamilyInput.profileId,
        input.runtimeFamilyInput.providerId
    );
    if (runtimePathResult.isErr()) {
        return invalidRuntimeOption({
            providerId: input.runtimeFamilyInput.providerId,
            modelId: input.runtimeFamilyInput.modelId,
            message: runtimePathResult.error.message,
        });
    }

    if (
        !input.supportsContext({
            providerId: input.runtimeFamilyInput.providerId,
            resolvedBaseUrl: runtimePathResult.value.resolvedBaseUrl,
        })
    ) {
        return invalidRuntimeOption({
            providerId: input.runtimeFamilyInput.providerId,
            modelId: input.runtimeFamilyInput.modelId,
            message: `Model "${input.runtimeFamilyInput.modelId}" requires a ${input.providerLabel}-compatible base URL on provider "${input.runtimeFamilyInput.providerId}".`,
        });
    }

    return okRunExecution({
        runtime,
        transport: buildTransport({
            runtimeOptions: input.runtimeFamilyInput.runtimeOptions,
            selected: input.protocolLabel,
        }),
    });
}

export function resolveDirectAnthropicRuntimeProtocol(
    input: ResolveRuntimeFamilyInput
): Promise<RunExecutionResult<ResolvedRuntimeFamilyProtocol>> {
    return resolveDirectRuntimeProtocol({
        runtimeFamilyInput: input,
        protocolLabel: 'anthropic_messages',
        providerLabel: 'Anthropic',
        supportsContext: supportsDirectAnthropicRuntimeContext,
    });
}

export function resolveDirectGeminiRuntimeProtocol(
    input: ResolveRuntimeFamilyInput
): Promise<RunExecutionResult<ResolvedRuntimeFamilyProtocol>> {
    return resolveDirectRuntimeProtocol({
        runtimeFamilyInput: input,
        protocolLabel: 'google_generativeai',
        providerLabel: 'Gemini',
        supportsContext: supportsDirectGeminiRuntimeContext,
    });
}
