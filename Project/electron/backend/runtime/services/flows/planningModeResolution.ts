import type { ModeDefinition, TopLevelTab } from '@/app/backend/runtime/contracts';
import { resolveActiveMode } from '@/app/backend/runtime/services/mode/activeMode';
import { modeSupportsPlanningWorkflow } from '@/app/backend/runtime/services/mode/metadata';
import { resolveModesForTab } from '@/app/backend/runtime/services/registry/service';

export async function resolvePlanningCapableModeForTab(input: {
    profileId: string;
    topLevelTab: TopLevelTab;
    workspaceFingerprint?: string;
}): Promise<ModeDefinition | null> {
    const [activeModeResult, modes] = await Promise.all([
        resolveActiveMode(input),
        resolveModesForTab(input),
    ]);

    if (activeModeResult.isOk() && modeSupportsPlanningWorkflow(activeModeResult.value.activeMode)) {
        return activeModeResult.value.activeMode;
    }

    return modes.find((mode) => modeSupportsPlanningWorkflow(mode)) ?? null;
}
