import type { ModeDefinition } from '@/shared/contracts';
import type { KiloModeHeader } from '@/shared/kiloModels';

export function resolveKiloModeHeader(mode: ModeDefinition): KiloModeHeader | undefined {
    if (mode.topLevelTab === 'chat' && mode.modeKey === 'chat') {
        return 'general';
    }

    if (mode.topLevelTab === 'agent') {
        if (mode.modeKey === 'ask' || mode.modeKey === 'code' || mode.modeKey === 'debug') {
            return mode.modeKey;
        }

        return undefined;
    }

    if (mode.topLevelTab === 'orchestrator') {
        if (mode.modeKey === 'orchestrate') {
            return 'orchestrator';
        }
        if (mode.modeKey === 'debug') {
            return 'debug';
        }
    }

    return undefined;
}

