import type {
    ModeDefinitionRecord,
    RulesetDefinitionRecord,
    SkillfileDefinitionRecord,
} from '@/app/backend/persistence/types';
import type { RegistryPresetKey, RegistryScope } from '@/app/backend/runtime/contracts';

function modeLayerPriority(mode: ModeDefinitionRecord): number {
    if (mode.scope === 'session') {
        return 3;
    }
    if (mode.scope === 'workspace') {
        return 2;
    }
    if (mode.scope === 'global') {
        return 1;
    }

    return 0;
}

function assetLayerPriority(asset: { scope: RegistryScope }): number {
    if (asset.scope === 'session') {
        return 3;
    }
    if (asset.scope === 'workspace') {
        return 2;
    }
    if (asset.scope === 'global') {
        return 1;
    }

    return 0;
}

function compareRegistryPriority<T extends { precedence: number; updatedAt: string; scope: RegistryScope }>(
    left: T,
    right: T
): number {
    const layerDelta = assetLayerPriority(right) - assetLayerPriority(left);
    if (layerDelta !== 0) {
        return layerDelta;
    }

    const precedenceDelta = right.precedence - left.precedence;
    if (precedenceDelta !== 0) {
        return precedenceDelta;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
}

function contextualPresetPriority(
    presetKey: RegistryPresetKey | undefined,
    activePresetKeys: RegistryPresetKey[]
): number {
    if (!presetKey) {
        return 0;
    }

    const presetIndex = activePresetKeys.indexOf(presetKey);
    if (presetIndex < 0) {
        return -1;
    }

    return activePresetKeys.length - presetIndex;
}

export function resolveModeDefinitions(input: {
    modes: ModeDefinitionRecord[];
    topLevelTab: 'chat' | 'agent' | 'orchestrator';
    workspaceFingerprint?: string;
}): ModeDefinitionRecord[] {
    const filtered = input.modes.filter((mode) => {
        if (!mode.enabled || mode.topLevelTab !== input.topLevelTab) {
            return false;
        }
        if (mode.scope === 'workspace') {
            return mode.workspaceFingerprint === input.workspaceFingerprint;
        }
        return true;
    });

    const byModeKey = new Map<string, ModeDefinitionRecord>();
    for (const mode of filtered.sort(compareRegistryPriority)) {
        if (!byModeKey.has(mode.modeKey)) {
            byModeKey.set(mode.modeKey, mode);
        }
    }

    return Array.from(byModeKey.values()).sort((left, right) => {
        if (left.scope !== right.scope) {
            return modeLayerPriority(right) - modeLayerPriority(left);
        }
        if (left.precedence !== right.precedence) {
            return right.precedence - left.precedence;
        }
        return left.label.localeCompare(right.label);
    });
}

export function resolveAssetDefinitions<T extends RulesetDefinitionRecord | SkillfileDefinitionRecord>(input: {
    items: T[];
    workspaceFingerprint?: string;
}): T[] {
    const filtered = input.items.filter((item) => {
        if (!item.enabled) {
            return false;
        }
        if (item.scope === 'workspace') {
            return item.workspaceFingerprint === input.workspaceFingerprint;
        }
        return true;
    });

    const byAssetKey = new Map<string, T>();
    for (const item of filtered.sort(compareRegistryPriority)) {
        const key = `${item.presetKey ?? 'shared'}::${item.assetKey || item.name.toLowerCase()}`;
        if (!byAssetKey.has(key)) {
            byAssetKey.set(key, item);
        }
    }

    return Array.from(byAssetKey.values()).sort((left, right) => {
        if (left.scope !== right.scope) {
            return assetLayerPriority(right) - assetLayerPriority(left);
        }
        if (left.precedence !== right.precedence) {
            return right.precedence - left.precedence;
        }
        return left.name.localeCompare(right.name);
    });
}

export function resolveContextualAssetDefinitions<
    T extends RulesetDefinitionRecord | SkillfileDefinitionRecord,
>(input: { items: T[]; workspaceFingerprint?: string; activePresetKeys: RegistryPresetKey[] }): T[] {
    const filtered = input.items.filter((item) => {
        if (!item.enabled) {
            return false;
        }
        if (item.scope === 'workspace' && item.workspaceFingerprint !== input.workspaceFingerprint) {
            return false;
        }

        const presetPriority = contextualPresetPriority(item.presetKey, input.activePresetKeys);
        return presetPriority >= 0;
    });

    const byAssetKey = new Map<string, T>();
    for (const item of filtered.sort((left, right) => {
        const presetDelta =
            contextualPresetPriority(right.presetKey, input.activePresetKeys) -
            contextualPresetPriority(left.presetKey, input.activePresetKeys);
        if (presetDelta !== 0) {
            return presetDelta;
        }

        return compareRegistryPriority(left, right);
    })) {
        const key = item.assetKey || item.name.toLowerCase();
        if (!byAssetKey.has(key)) {
            byAssetKey.set(key, item);
        }
    }

    return Array.from(byAssetKey.values()).sort((left, right) => {
        const presetDelta =
            contextualPresetPriority(right.presetKey, input.activePresetKeys) -
            contextualPresetPriority(left.presetKey, input.activePresetKeys);
        if (presetDelta !== 0) {
            return presetDelta;
        }
        if (left.scope !== right.scope) {
            return assetLayerPriority(right) - assetLayerPriority(left);
        }
        if (left.precedence !== right.precedence) {
            return right.precedence - left.precedence;
        }
        return left.name.localeCompare(right.name);
    });
}
