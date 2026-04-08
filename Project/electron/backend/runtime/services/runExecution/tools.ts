import { toolStore } from '@/app/backend/persistence/stores';
import type { ProviderRuntimeToolDefinition } from '@/app/backend/providers/types';
import { mcpService } from '@/app/backend/runtime/services/mcp/service';
import { modeUsesReadOnlyExecution } from '@/app/backend/runtime/services/mode/metadata';
import {
    getModeToolCapabilities,
    modeAllowsToolCapabilities,
    modeRequiresNativeTools,
} from '@/app/backend/runtime/services/mode/toolCapabilities';
import {
    getBuiltInRuntimeToolContract,
} from '@/app/backend/runtime/services/runExecution/builtInRuntimeToolContracts';
import { composeRuntimeToolDescription } from '@/app/backend/runtime/services/runExecution/runtimeToolDescriptionBuilder';
import type { RuntimeToolGuidanceContext } from '@/app/backend/runtime/services/runExecution/types';

import type { ModeDefinition, ToolMutability } from '@/shared/contracts';

type RuntimeExposedToolDefinition = ProviderRuntimeToolDefinition & { mutability: ToolMutability };

export function runModeRequiresNativeTools(input: { mode: ModeDefinition }): boolean {
    return modeRequiresNativeTools(input.mode);
}

export async function resolveRuntimeToolsForMode(input: {
    mode: ModeDefinition;
    guidanceContext?: RuntimeToolGuidanceContext;
}): Promise<ProviderRuntimeToolDefinition[]> {
    if (getModeToolCapabilities(input.mode.executionPolicy).length === 0) {
        return [];
    }

    const storedTools = await toolStore.list();
    const nativeTools = storedTools
        .filter((tool) => modeAllowsToolCapabilities(input.mode, tool.capabilities))
        .filter((tool) => !modeUsesReadOnlyExecution(input.mode) || tool.mutability === 'read_only')
        .sort((left, right) => {
            const leftContract = getBuiltInRuntimeToolContract(left.id);
            const rightContract = getBuiltInRuntimeToolContract(right.id);
            const normalizedLeftIndex = leftContract?.implemented
                ? leftContract.exposureOrder
                : Number.MAX_SAFE_INTEGER;
            const normalizedRightIndex = rightContract?.implemented
                ? rightContract.exposureOrder
                : Number.MAX_SAFE_INTEGER;
            return normalizedLeftIndex - normalizedRightIndex || left.label.localeCompare(right.label);
        })
        .map((tool) => {
            const contract = getBuiltInRuntimeToolContract(tool.id);
            if (!contract || !contract.implemented) {
                return null;
            }

            return {
                id: tool.id,
                description: composeRuntimeToolDescription({
                    descriptionKind: contract.descriptionKind,
                    baseDescription: tool.description,
                    ...(input.guidanceContext ? { guidanceContext: input.guidanceContext } : {}),
                }),
                inputSchema: contract.inputSchema,
                mutability: tool.mutability,
            } satisfies RuntimeExposedToolDefinition;
        })
        .filter((tool): tool is RuntimeExposedToolDefinition => tool !== null);

    const mcpTools = modeAllowsToolCapabilities(input.mode, ['mcp'])
        ? (await mcpService.listRuntimeTools()).filter((tool) => !modeUsesReadOnlyExecution(input.mode) || tool.mutability === 'read_only')
        : [];
    return [...nativeTools, ...mcpTools];
}

