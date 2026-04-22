import type { AgentMode, OrchestratorMode, TopLevelTab } from '@/shared/contracts/enums';

export const registryPresetKeys = ['ask', 'code', 'debug', 'orchestrator'] as const;
export type RegistryPresetKey = (typeof registryPresetKeys)[number];

export const registryAssetTargetKinds = ['shared', 'preset', 'exact_mode'] as const;
export type RegistryAssetTargetKind = (typeof registryAssetTargetKinds)[number];

export interface RegistryExactModeTarget {
    topLevelTab: TopLevelTab;
    modeKey: string;
}

export const ruleActivationModes = ['always', 'auto', 'manual'] as const;
export type RuleActivationMode = (typeof ruleActivationModes)[number];

function isAgentMode(value: string): value is AgentMode {
    return value === 'plan' || value === 'ask' || value === 'code' || value === 'debug';
}

function isOrchestratorMode(value: string): value is OrchestratorMode {
    return value === 'plan' || value === 'orchestrate' || value === 'debug';
}

export function getRegistryPresetKeysForMode(input: {
    topLevelTab: TopLevelTab;
    modeKey: string;
}): RegistryPresetKey[] {
    if (input.topLevelTab === 'chat') {
        return [];
    }

    if (input.topLevelTab === 'agent') {
        if (!isAgentMode(input.modeKey)) {
            return [];
        }

        switch (input.modeKey) {
            case 'ask':
                return ['ask'];
            case 'code':
                return ['code'];
            case 'debug':
                return ['debug'];
            default:
                return [];
        }
    }

    if (!isOrchestratorMode(input.modeKey)) {
        return [];
    }

    switch (input.modeKey) {
        case 'debug':
            return ['debug', 'orchestrator'];
        case 'plan':
        case 'orchestrate':
            return ['orchestrator'];
        default:
            return [];
    }
}
