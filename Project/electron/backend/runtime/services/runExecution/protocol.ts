import { resolveRuntimeFamilyProtocol } from '@/app/backend/providers/runtimeFamilies';
import type { ProviderModelCapabilities, ProviderRuntimeDescriptor } from '@/app/backend/providers/types';
import type { RunExecutionResult } from '@/app/backend/runtime/services/runExecution/errors';
import type { RunTransportResolution } from '@/app/backend/runtime/services/runExecution/types';

import type { RuntimeProviderId, RuntimeRunOptions } from '@/shared/contracts';
import type { ProviderAuthMethod } from '@/shared/contracts';
import type { OpenAIExecutionMode, TopLevelTab } from '@/shared/contracts';

export interface ResolvedRuntimeProtocol {
    runtime: ProviderRuntimeDescriptor;
    transport: RunTransportResolution;
}

interface ResolveRuntimeProtocolInput {
    profileId: string;
    providerId: RuntimeProviderId;
    modelId: string;
    modelCapabilities: ProviderModelCapabilities;
    authMethod: ProviderAuthMethod | 'none';
    runtimeOptions: RuntimeRunOptions;
    topLevelTab?: TopLevelTab;
    openAIExecutionMode?: OpenAIExecutionMode;
}

export async function resolveRuntimeProtocol(
    input: ResolveRuntimeProtocolInput
): Promise<RunExecutionResult<ResolvedRuntimeProtocol>> {
    return resolveRuntimeFamilyProtocol(input);
}

