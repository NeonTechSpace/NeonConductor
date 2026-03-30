import { settingsStore } from '@/app/backend/persistence/stores';
import type { ModeDefinitionRecord } from '@/app/backend/persistence/types';
import { InvariantError } from '@/app/backend/runtime/services/common/fatalErrors';
import { pickActiveMode, toActiveModeKey } from '@/app/backend/runtime/services/mode/selection';
import type { RegistryActiveModeSelectionResult } from '@/app/backend/runtime/services/registry/registryLifecycle.types';

export async function readActiveAgentModeAfterRefresh(input: {
    profileId: string;
    workspaceFingerprint?: string;
    agentModes: ModeDefinitionRecord[];
}): Promise<RegistryActiveModeSelectionResult> {
    const persistedAgentModeKey = await settingsStore.getStringOptional(
        input.profileId,
        toActiveModeKey('agent', input.workspaceFingerprint)
    );
    const activeAgentMode = pickActiveMode(input.agentModes, persistedAgentModeKey, 'agent') ?? input.agentModes[0];
    if (!activeAgentMode) {
        throw new InvariantError(`No enabled agent modes found for profile "${input.profileId}".`);
    }

    return {
        agentModes: input.agentModes,
        activeAgentMode,
    };
}
