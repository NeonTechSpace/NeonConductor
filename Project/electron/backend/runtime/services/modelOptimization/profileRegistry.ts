import type { ProviderRuntimeDescriptor, ProviderModelCapabilities } from '@/app/backend/providers/types';
import type {
    InternalModelRole,
    ModelFamilyProfile,
    ModelOptimizationCompatibilityWarning,
    ModelOptimizationProfile,
    RuntimeProviderId,
    RuntimeRunOptions,
} from '@/app/backend/runtime/contracts';

const allRoles: InternalModelRole[] = ['chat', 'planner', 'apply', 'utility', 'memory_retrieval', 'embeddings', 'rerank'];

export const modelFamilyProfiles: ModelFamilyProfile[] = [
    {
        id: 'family.openai_responses',
        family: 'openai_responses',
        label: 'OpenAI Responses',
        runtimeToolProtocol: 'openai_responses',
        compatibleRoles: allRoles,
        contextStrategy: 'native input item stream with function-call continuity',
        promptTemplatePolicy: 'system/user/tool message ledger with Responses reasoning controls',
        unsupportedParameterPolicy: 'fail_closed',
    },
    {
        id: 'family.openai_chat_completions',
        family: 'openai_chat_completions',
        label: 'OpenAI Chat Completions',
        runtimeToolProtocol: 'openai_chat_completions',
        compatibleRoles: allRoles.filter((role) => role !== 'embeddings' && role !== 'rerank'),
        contextStrategy: 'chat message stream with tool-call replay',
        promptTemplatePolicy: 'system/user/tool message ledger with chat-compatible tool envelopes',
        unsupportedParameterPolicy: 'omit_with_warning',
    },
    {
        id: 'family.anthropic_messages',
        family: 'anthropic_messages',
        label: 'Anthropic Messages',
        runtimeToolProtocol: 'anthropic_messages',
        compatibleRoles: allRoles.filter((role) => role !== 'embeddings' && role !== 'rerank'),
        contextStrategy: 'system prompt plus message blocks with thinking-budget mapping',
        promptTemplatePolicy: 'Anthropic message blocks with explicit tool result structure',
        unsupportedParameterPolicy: 'fail_closed',
    },
    {
        id: 'family.gemini',
        family: 'gemini',
        label: 'Gemini',
        runtimeToolProtocol: 'google_generativeai',
        compatibleRoles: allRoles.filter((role) => role !== 'embeddings' && role !== 'rerank'),
        contextStrategy: 'Gemini contents with compatibility role mapping',
        promptTemplatePolicy: 'Gemini content parts with function calling and thought signatures',
        unsupportedParameterPolicy: 'fail_closed',
    },
    {
        id: 'family.kilo_routed',
        family: 'kilo_routed',
        label: 'Kilo Routed',
        runtimeToolProtocol: 'kilo_gateway',
        compatibleRoles: allRoles.filter((role) => role !== 'embeddings' && role !== 'rerank'),
        contextStrategy: 'gateway request with routed-family metadata and provider preferences',
        promptTemplatePolicy: 'gateway-compatible prompt ledger selected by routed runtime family',
        unsupportedParameterPolicy: 'omit_with_warning',
    },
    {
        id: 'family.provider_native',
        family: 'provider_native',
        label: 'Provider Native',
        runtimeToolProtocol: 'provider_native',
        compatibleRoles: allRoles.filter((role) => role !== 'embeddings' && role !== 'rerank'),
        contextStrategy: 'specialized native request adapter',
        promptTemplatePolicy: 'adapter-owned native message shape with Neon prompt ledger input',
        unsupportedParameterPolicy: 'fail_closed',
    },
];

function resolveProfile(runtime: ProviderRuntimeDescriptor): ModelFamilyProfile {
    if (runtime.toolProtocol === 'kilo_gateway') {
        return modelFamilyProfiles.find((profile) => profile.family === 'kilo_routed') ?? modelFamilyProfiles[0]!;
    }
    if (runtime.toolProtocol === 'google_generativeai') {
        return modelFamilyProfiles.find((profile) => profile.family === 'gemini') ?? modelFamilyProfiles[0]!;
    }
    if (runtime.toolProtocol === 'anthropic_messages') {
        return modelFamilyProfiles.find((profile) => profile.family === 'anthropic_messages') ?? modelFamilyProfiles[0]!;
    }
    if (runtime.toolProtocol === 'provider_native') {
        return modelFamilyProfiles.find((profile) => profile.family === 'provider_native') ?? modelFamilyProfiles[0]!;
    }
    return (
        modelFamilyProfiles.find((profile) => profile.runtimeToolProtocol === runtime.toolProtocol) ??
        modelFamilyProfiles[0]!
    );
}

function buildWarnings(input: {
    profile: ModelFamilyProfile;
    role: InternalModelRole;
    modelCapabilities: ProviderModelCapabilities;
    runtimeOptions: RuntimeRunOptions;
}): ModelOptimizationCompatibilityWarning[] {
    const warnings: ModelOptimizationCompatibilityWarning[] = [];
    if (!input.profile.compatibleRoles.includes(input.role)) {
        warnings.push({
            code: 'role_family_mismatch',
            severity: 'warning',
            message: `The ${input.profile.label} profile is not tuned for the ${input.role} role.`,
        });
    }
    if (input.runtimeOptions.reasoning.effort !== 'none' && !input.modelCapabilities.features.supportsReasoning) {
        warnings.push({
            code: 'reasoning_not_supported',
            severity: 'warning',
            message: 'Reasoning options were requested but this model does not advertise reasoning support.',
        });
    }
    if (input.runtimeOptions.cache.strategy !== 'auto' && !input.modelCapabilities.features.supportsPromptCache) {
        warnings.push({
            code: 'prompt_cache_not_supported',
            severity: 'warning',
            message: 'Manual prompt-cache intent was requested for a model without trusted prompt-cache metadata.',
        });
    }
    return warnings;
}

export function resolveModelOptimizationProfile(input: {
    providerId: RuntimeProviderId;
    modelId: string;
    runtime: ProviderRuntimeDescriptor;
    modelCapabilities: ProviderModelCapabilities;
    modelRole: InternalModelRole;
    runtimeOptions: RuntimeRunOptions;
}): ModelOptimizationProfile {
    const profile = resolveProfile(input.runtime);
    return {
        profileId: profile.id,
        familyProfileId: profile.id,
        family: profile.family,
        label: profile.label,
        providerId: input.providerId,
        modelId: input.modelId,
        modelRole: input.modelRole,
        contextStrategy: profile.contextStrategy,
        promptTemplatePolicy: profile.promptTemplatePolicy,
        toolProtocol: input.runtime.toolProtocol,
        unsupportedParameterPolicy: profile.unsupportedParameterPolicy,
        warnings: buildWarnings({
            profile,
            role: input.modelRole,
            modelCapabilities: input.modelCapabilities,
            runtimeOptions: input.runtimeOptions,
        }),
    };
}
