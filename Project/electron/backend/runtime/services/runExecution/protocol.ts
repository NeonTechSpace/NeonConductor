import { resolveRuntimeFamilyProtocol } from '@/app/backend/providers/runtimeFamilies';
import type {
    ProviderApiFamily,
    ProviderModelCapabilities,
    ProviderRoutedApiFamily,
    ProviderToolProtocol,
} from '@/app/backend/providers/types';
import type { RuntimeProviderId, RuntimeRunOptions } from '@/app/backend/runtime/contracts';
import type { ProviderAuthMethod } from '@/app/backend/runtime/contracts';
import type { RunExecutionResult } from '@/app/backend/runtime/services/runExecution/errors';
import type { RunTransportResolution } from '@/app/backend/runtime/services/runExecution/types';

export interface ResolvedRuntimeProtocol {
    toolProtocol: ProviderToolProtocol;
    apiFamily?: ProviderApiFamily;
    routedApiFamily?: ProviderRoutedApiFamily;
    transport: RunTransportResolution;
}

interface ResolveRuntimeProtocolInput {
    profileId: string;
    providerId: RuntimeProviderId;
    modelId: string;
    modelCapabilities: ProviderModelCapabilities;
    authMethod: ProviderAuthMethod | 'none';
    runtimeOptions: RuntimeRunOptions;
}

export async function resolveRuntimeProtocol(
    input: ResolveRuntimeProtocolInput
): Promise<RunExecutionResult<ResolvedRuntimeProtocol>> {
    return resolveRuntimeFamilyProtocol(input);
}
