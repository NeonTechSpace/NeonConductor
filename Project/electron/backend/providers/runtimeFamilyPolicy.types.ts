import type {
    NormalizedModelMetadata,
    ProviderModelCapabilities,
    ProviderRuntimeDescriptor,
    ProviderRuntimeTransportFamily,
    ProviderToolProtocol,
} from '@/app/backend/providers/types';
import type {
    OpenAIExecutionMode,
    ProviderAuthMethod,
    RuntimeProviderId,
    RuntimeRunOptions,
    TopLevelTab,
} from '@/app/backend/runtime/contracts';
import type { RunExecutionResult } from '@/app/backend/runtime/services/runExecution/errors';
import type { RunTransportResolution } from '@/app/backend/runtime/services/runExecution/types';

export type RuntimeFamilyExecutionPath = 'openai_compatible' | 'kilo_gateway' | 'provider_native' | 'direct_family';

export interface ResolvedRuntimeFamilyProtocol {
    runtime: ProviderRuntimeDescriptor;
    transport: RunTransportResolution;
}

export interface RuntimeFamilyCatalogContext {
    providerId: RuntimeProviderId;
    optionProfileId: string;
    resolvedBaseUrl: string | null;
}

export interface RuntimeFamilyCatalogInput {
    providerId: RuntimeProviderId;
    model: NormalizedModelMetadata;
    context?: RuntimeFamilyCatalogContext;
}

export interface ResolveRuntimeFamilyInput {
    profileId: string;
    providerId: RuntimeProviderId;
    modelId: string;
    modelCapabilities: ProviderModelCapabilities;
    authMethod: ProviderAuthMethod | 'none';
    runtimeOptions: RuntimeRunOptions;
    topLevelTab?: TopLevelTab;
    openAIExecutionMode?: OpenAIExecutionMode;
}

export interface RuntimeFamilyDefinition {
    toolProtocol: ProviderToolProtocol;
    executionPath: RuntimeFamilyExecutionPath;
    transportFamily: ProviderRuntimeTransportFamily;
    supportsCatalogModel: (input: RuntimeFamilyCatalogInput) => boolean;
    resolveProtocol: (input: ResolveRuntimeFamilyInput) => Promise<RunExecutionResult<ResolvedRuntimeFamilyProtocol>>;
}
