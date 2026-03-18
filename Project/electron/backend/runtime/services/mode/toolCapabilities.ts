import type { ModeDefinition, ModeExecutionPolicy, ToolCapability } from '@/app/backend/runtime/contracts';

function uniqueToolCapabilities(toolCapabilities: readonly ToolCapability[] | undefined): ToolCapability[] {
    if (!toolCapabilities || toolCapabilities.length === 0) {
        return [];
    }

    return Array.from(new Set(toolCapabilities));
}

export function getModeToolCapabilities(policy: ModeExecutionPolicy): ToolCapability[] {
    return uniqueToolCapabilities(policy.toolCapabilities);
}

export function modeRequiresNativeTools(mode: Pick<ModeDefinition, 'executionPolicy'>): boolean {
    if (mode.executionPolicy.planningOnly) {
        return false;
    }

    return getModeToolCapabilities(mode.executionPolicy).length > 0;
}

export function modeAllowsToolCapabilities(
    mode: Pick<ModeDefinition, 'executionPolicy'>,
    requiredCapabilities: readonly ToolCapability[]
): boolean {
    const allowedCapabilities = new Set(getModeToolCapabilities(mode.executionPolicy));
    return requiredCapabilities.every((capability) => allowedCapabilities.has(capability));
}
