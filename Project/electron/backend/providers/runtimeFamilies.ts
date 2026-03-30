import { runtimeProtocolSelectionDefinitions } from '@/app/backend/providers/runtimeProtocolSelectionPolicy';
import type {
    ResolveRuntimeFamilyInput,
    ResolvedRuntimeFamilyProtocol,
    RuntimeFamilyCatalogInput,
    RuntimeFamilyDefinition,
    RuntimeFamilyExecutionPath,
} from '@/app/backend/providers/runtimeFamilyPolicy.types';
import type { ProviderToolProtocol } from '@/app/backend/providers/types';
import type { RunExecutionResult } from '@/app/backend/runtime/services/runExecution/errors';

const runtimeFamilyDefinitions: Record<ProviderToolProtocol, RuntimeFamilyDefinition> = runtimeProtocolSelectionDefinitions;

export type {
    ResolveRuntimeFamilyInput,
    ResolvedRuntimeFamilyProtocol,
    RuntimeFamilyCatalogInput,
    RuntimeFamilyDefinition,
    RuntimeFamilyExecutionPath,
} from '@/app/backend/providers/runtimeFamilyPolicy.types';

export function getRuntimeFamilyDefinition(toolProtocol: ProviderToolProtocol): RuntimeFamilyDefinition {
    return runtimeFamilyDefinitions[toolProtocol];
}

export function resolveRuntimeFamilyExecutionPath(toolProtocol: ProviderToolProtocol): RuntimeFamilyExecutionPath {
    return getRuntimeFamilyDefinition(toolProtocol).executionPath;
}

export function supportsCatalogRuntimeFamily(input: RuntimeFamilyCatalogInput): boolean {
    const toolProtocol = input.model.runtime.toolProtocol;
    const definition = runtimeFamilyDefinitions[toolProtocol];
    return definition.supportsCatalogModel(input);
}

export async function resolveRuntimeFamilyProtocol(
    input: ResolveRuntimeFamilyInput
): Promise<RunExecutionResult<ResolvedRuntimeFamilyProtocol>> {
    const toolProtocol = input.modelCapabilities.runtime.toolProtocol;
    const definition = runtimeFamilyDefinitions[toolProtocol];
    return definition.resolveProtocol(input);
}
