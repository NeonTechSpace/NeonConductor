import { settingsStore } from '@/app/backend/persistence/stores';
import type { ModeDefinitionRecord } from '@/app/backend/persistence/types';
import type { TopLevelTab } from '@/app/backend/runtime/contracts';
import {
    errModeResolution,
    okModeResolution,
    type ModeResolutionResult,
} from '@/app/backend/runtime/services/mode/errors';
import { pickActiveMode, toActiveModeKey } from '@/app/backend/runtime/services/mode/selection';
import { resolveModesForTab } from '@/app/backend/runtime/services/registry/service';

export interface ResolvedActiveMode {
    modes: ModeDefinitionRecord[];
    activeMode: ModeDefinitionRecord;
    activeKey: string;
}

export async function resolveActiveMode(input: {
    profileId: string;
    topLevelTab: TopLevelTab;
    workspaceFingerprint?: string;
}): Promise<ModeResolutionResult<ResolvedActiveMode>> {
    const modes = await resolveModesForTab(input);
    const firstMode = modes.at(0);
    if (!firstMode) {
        return errModeResolution(
            `No enabled modes found for tab "${input.topLevelTab}" on profile "${input.profileId}".`
        );
    }

    const activeKey = toActiveModeKey(input.topLevelTab, input.workspaceFingerprint);
    const persistedModeKey = await settingsStore.getStringOptional(input.profileId, activeKey);
    const activeMode = pickActiveMode(modes, persistedModeKey, input.topLevelTab) ?? firstMode;

    return okModeResolution({
        modes,
        activeMode,
        activeKey,
    });
}
