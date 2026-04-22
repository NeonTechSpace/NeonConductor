import type {
    ModeDefinitionRecord,
    RulesetDefinitionRecord,
    SkillfileDefinitionRecord,
} from '@/app/backend/persistence/types';
import type {
    RegistryAssetShadowVariant,
    RegistryAssetTargetKind,
    RegistryPresetKey,
    RegistryScope,
} from '@/app/backend/runtime/contracts';
import { modeIsSessionSelectable } from '@/app/backend/runtime/services/mode/metadata';

type ResolvedRegistryAsset = RulesetDefinitionRecord | SkillfileDefinitionRecord;

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

function targetKindPriority(targetKind: RegistryAssetTargetKind): number {
    switch (targetKind) {
        case 'exact_mode':
            return 3;
        case 'preset':
            return 2;
        case 'shared':
        default:
            return 1;
    }
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

function compareRegistryOrder<T extends { name: string; scope: RegistryScope; precedence: number }>(left: T, right: T): number {
    if (left.scope !== right.scope) {
        return assetLayerPriority(right) - assetLayerPriority(left);
    }
    if (left.precedence !== right.precedence) {
        return right.precedence - left.precedence;
    }
    return left.name.localeCompare(right.name);
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

function buildTargetSignature(asset: Pick<ResolvedRegistryAsset, 'assetKey' | 'targetKind' | 'presetKey' | 'targetMode'>): string {
    return [
        asset.assetKey || 'unnamed',
        asset.targetKind,
        asset.presetKey ?? '',
        asset.targetMode?.topLevelTab ?? '',
        asset.targetMode?.modeKey ?? '',
    ].join('::');
}

function toShadowVariant(asset: ResolvedRegistryAsset): RegistryAssetShadowVariant {
    return {
        scope: asset.scope === 'workspace' ? 'workspace' : 'global',
        targetKind: asset.targetKind,
        ...(asset.presetKey ? { presetKey: asset.presetKey } : {}),
        ...(asset.targetMode ? { targetMode: asset.targetMode } : {}),
        ...(asset.relativeRootPath ? { relativeRootPath: asset.relativeRootPath } : {}),
    };
}

function mapContextualMatchReason(
    asset: Pick<ResolvedRegistryAsset, 'targetKind' | 'presetKey' | 'targetMode'>,
    input: { activePresetKeys: RegistryPresetKey[]; topLevelTab: 'chat' | 'agent' | 'orchestrator'; modeKey: string }
): RegistryAssetTargetKind | null {
    if (asset.targetKind === 'shared') {
        return 'shared';
    }
    if (asset.targetKind === 'preset') {
        return contextualPresetPriority(asset.presetKey, input.activePresetKeys) >= 0 ? 'preset' : null;
    }
    if (
        asset.targetMode?.topLevelTab === input.topLevelTab &&
        asset.targetMode.modeKey === input.modeKey
    ) {
        return 'exact_mode';
    }

    return null;
}

function compareContextualResolutionPriority<T extends ResolvedRegistryAsset>(
    left: T,
    right: T,
    input: { activePresetKeys: RegistryPresetKey[]; topLevelTab: 'chat' | 'agent' | 'orchestrator'; modeKey: string }
): number {
    const layerDelta = assetLayerPriority(right) - assetLayerPriority(left);
    if (layerDelta !== 0) {
        return layerDelta;
    }

    const rightMatchReason = mapContextualMatchReason(right, input);
    const leftMatchReason = mapContextualMatchReason(left, input);
    const targetDelta = targetKindPriority(rightMatchReason ?? 'shared') - targetKindPriority(leftMatchReason ?? 'shared');
    if (targetDelta !== 0) {
        return targetDelta;
    }

    if (left.targetKind === 'preset' && right.targetKind === 'preset') {
        const presetDelta =
            contextualPresetPriority(right.presetKey, input.activePresetKeys) -
            contextualPresetPriority(left.presetKey, input.activePresetKeys);
        if (presetDelta !== 0) {
            return presetDelta;
        }
    }

    const precedenceDelta = right.precedence - left.precedence;
    if (precedenceDelta !== 0) {
        return precedenceDelta;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
}

function withContextualDiagnostics<T extends ResolvedRegistryAsset>(
    winner: T,
    shadowedVariants: T[],
    matchReason: RegistryAssetTargetKind
): T {
    return {
        ...winner,
        contextualMatchReason: matchReason,
        ...(shadowedVariants.length > 0
            ? {
                  shadowedVariants: shadowedVariants
                      .filter((variant) => variant.scope === 'global' || variant.scope === 'workspace')
                      .map(toShadowVariant),
              }
            : {}),
    };
}

function withShadowedVariants<T extends ResolvedRegistryAsset>(winner: T, shadowedVariants: T[]): T {
    if (shadowedVariants.length === 0) {
        return winner;
    }

    return {
        ...winner,
        shadowedVariants: shadowedVariants
            .filter((variant) => variant.scope === 'global' || variant.scope === 'workspace')
            .map(toShadowVariant),
    };
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
        if (!modeIsSessionSelectable(mode)) {
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

export function resolveAssetDefinitions<T extends ResolvedRegistryAsset>(input: {
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
        return item.scope === 'global';
    });

    const groupedItems = new Map<string, T[]>();
    for (const item of filtered) {
        const key = buildTargetSignature(item);
        const currentItems = groupedItems.get(key);
        if (currentItems) {
            currentItems.push(item);
        } else {
            groupedItems.set(key, [item]);
        }
    }

    return Array.from(groupedItems.values())
        .flatMap((items) => {
            const [winner, ...shadowedVariants] = items.sort(compareRegistryPriority);
            return winner ? [withShadowedVariants(winner, shadowedVariants) as T] : [];
        })
        .sort((left, right) => {
            const targetDelta = targetKindPriority(right.targetKind) - targetKindPriority(left.targetKind);
            if (targetDelta !== 0) {
                return targetDelta;
            }
            if (left.targetKind === 'preset' && right.targetKind === 'preset') {
                const presetDelta = (right.presetKey ?? '').localeCompare(left.presetKey ?? '');
                if (presetDelta !== 0) {
                    return presetDelta;
                }
            }
            return compareRegistryOrder(left, right);
        }) as T[];
}

export function resolveContextualAssetDefinitions<T extends ResolvedRegistryAsset>(input: {
    items: T[];
    workspaceFingerprint?: string;
    activePresetKeys: RegistryPresetKey[];
    topLevelTab: 'chat' | 'agent' | 'orchestrator';
    modeKey: string;
}): T[] {
    const contextualInput = {
        activePresetKeys: input.activePresetKeys,
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
    } as const;
    const filtered = input.items.filter((item) => {
        if (!item.enabled) {
            return false;
        }
        if (item.scope === 'workspace' && item.workspaceFingerprint !== input.workspaceFingerprint) {
            return false;
        }
        if (item.scope !== 'workspace' && item.scope !== 'global') {
            return false;
        }

        return mapContextualMatchReason(item, contextualInput) !== null;
    });

    const groupedItems = new Map<string, T[]>();
    for (const item of filtered) {
        const key = item.assetKey || item.name.toLowerCase();
        const currentItems = groupedItems.get(key);
        if (currentItems) {
            currentItems.push(item);
        } else {
            groupedItems.set(key, [item]);
        }
    }

    return Array.from(groupedItems.values())
        .flatMap((items) => {
            const orderedItems = items.sort((left, right) =>
                compareContextualResolutionPriority(left, right, contextualInput)
            );
            const [winner, ...shadowedVariants] = orderedItems;
            if (!winner) {
                return [];
            }
            const matchReason = mapContextualMatchReason(winner, contextualInput) ?? 'shared';
            return [withContextualDiagnostics(winner, shadowedVariants, matchReason) as T];
        })
        .sort((left, right) => {
            const layerDelta = assetLayerPriority(right) - assetLayerPriority(left);
            if (layerDelta !== 0) {
                return layerDelta;
            }
            const targetDelta = targetKindPriority(right.contextualMatchReason ?? right.targetKind) -
                targetKindPriority(left.contextualMatchReason ?? left.targetKind);
            if (targetDelta !== 0) {
                return targetDelta;
            }
            if (
                (left.contextualMatchReason ?? left.targetKind) === 'preset' &&
                (right.contextualMatchReason ?? right.targetKind) === 'preset'
            ) {
                const presetDelta =
                    contextualPresetPriority(right.presetKey, input.activePresetKeys) -
                    contextualPresetPriority(left.presetKey, input.activePresetKeys);
                if (presetDelta !== 0) {
                    return presetDelta;
                }
            }
            if (left.precedence !== right.precedence) {
                return right.precedence - left.precedence;
            }
            return left.name.localeCompare(right.name);
        }) as T[];
}
