import {
    registryResolvedQueryService,
} from '@/app/backend/runtime/services/registry/registryResolvedQueryService';
import { refreshRegistry as refreshRegistryLifecycle } from '@/app/backend/runtime/services/registry/registryRefreshLifecycle';
import {
    applyPromotion as applyPromotionService,
    preparePromotion as preparePromotionService,
} from '@/app/backend/runtime/services/registry/registryPromotionService';
import type { RegistryRefreshResult } from '@/app/backend/runtime/services/registry/types';

export async function listResolvedRegistry(input: {
    profileId: string;
    workspaceFingerprint?: string;
    sandboxId?: `sb_${string}`;
}) {
    return registryResolvedQueryService.listResolvedRegistry(input);
}

export async function searchResolvedSkillfiles(input: {
    profileId: string;
    query?: string;
    workspaceFingerprint?: string;
    sandboxId?: `sb_${string}`;
    topLevelTab?: 'chat' | 'agent' | 'orchestrator';
    modeKey?: string;
}) {
    return registryResolvedQueryService.searchResolvedSkillfiles(input);
}

export async function searchResolvedRulesets(input: {
    profileId: string;
    query?: string;
    workspaceFingerprint?: string;
    sandboxId?: `sb_${string}`;
    topLevelTab?: 'chat' | 'agent' | 'orchestrator';
    modeKey?: string;
}) {
    return registryResolvedQueryService.searchResolvedRulesets(input);
}

export async function readSkillBody(input: {
    profileId: string;
    skillId: string;
}) {
    return registryResolvedQueryService.readSkillBody(input);
}

export async function preparePromotion(input: Parameters<typeof preparePromotionService>[0]) {
    return preparePromotionService(input);
}

export async function applyPromotion(input: Parameters<typeof applyPromotionService>[0]) {
    return applyPromotionService(input);
}

export async function resolveSkillfilesByAssetKeys(input: {
    profileId: string;
    assetKeys: string[];
    workspaceFingerprint?: string;
    sandboxId?: `sb_${string}`;
    topLevelTab: 'chat' | 'agent' | 'orchestrator';
    modeKey: string;
}) {
    return registryResolvedQueryService.resolveSkillfilesByAssetKeys(input);
}

export async function resolveRulesetsByAssetKeys(input: {
    profileId: string;
    assetKeys: string[];
    workspaceFingerprint?: string;
    sandboxId?: `sb_${string}`;
    topLevelTab: 'chat' | 'agent' | 'orchestrator';
    modeKey: string;
}) {
    return registryResolvedQueryService.resolveRulesetsByAssetKeys(input);
}

export async function resolveModesForTab(input: {
    profileId: string;
    topLevelTab: 'chat' | 'agent' | 'orchestrator';
    workspaceFingerprint?: string;
}) {
    return registryResolvedQueryService.resolveModesForTab(input);
}

export async function refreshRegistry(input: {
    profileId: string;
    workspaceFingerprint?: string;
    sandboxId?: `sb_${string}`;
}): Promise<RegistryRefreshResult> {
    return refreshRegistryLifecycle(input);
}

export type { RegistryRefreshResult } from '@/app/backend/runtime/services/registry/types';
