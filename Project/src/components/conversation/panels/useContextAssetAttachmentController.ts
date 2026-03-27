import { trpc } from '@/web/trpc/client';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';

import type { EntityId, RulesetDefinition, SkillfileDefinition, TopLevelTab } from '@/shared/contracts';

interface ContextAssetAttachmentControllerInput {
    profileId: string;
    sessionId?: EntityId<'sess'>;
    topLevelTab: TopLevelTab;
    modeKey: string;
    workspaceFingerprint?: string;
    sandboxId?: EntityId<'sb'>;
    query?: string;
    searchEnabled?: boolean;
    attachedRules: RulesetDefinition[];
    missingAttachedRuleKeys: string[];
    attachedSkills: SkillfileDefinition[];
    missingAttachedSkillKeys: string[];
}

export interface ContextAssetAttachmentReadModel {
    attachedRules: RulesetDefinition[];
    missingAttachedRuleKeys: string[];
    attachedRuleAssetKeys: string[];
    attachedRuleAssetKeySet: Set<string>;
    attachedSkills: SkillfileDefinition[];
    missingAttachedSkillKeys: string[];
    attachedSkillAssetKeys: string[];
    attachedSkillAssetKeySet: Set<string>;
    resolvedManualRules: RulesetDefinition[];
    resolvedSkills: SkillfileDefinition[];
    visibleManualRules: RulesetDefinition[];
    visibleSkills: SkillfileDefinition[];
    isRefreshingRules: boolean;
    isRefreshingSkills: boolean;
}

function buildRegistryQueryInput(input: ContextAssetAttachmentControllerInput, query: string) {
    return {
        profileId: input.profileId,
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
        ...(query.length > 0 ? { query } : {}),
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        ...(input.sandboxId ? { sandboxId: input.sandboxId } : {}),
    };
}

export function useContextAssetAttachmentController(input: ContextAssetAttachmentControllerInput) {
    const query = input.query?.trim() ?? '';
    const utils = trpc.useUtils();
    const registryQueryInput = buildRegistryQueryInput(input, query);
    const searchEnabled = input.searchEnabled ?? true;
    const searchRulesQuery = trpc.registry.searchRules.useQuery(registryQueryInput, {
        enabled: searchEnabled,
        ...PROGRESSIVE_QUERY_OPTIONS,
    });
    const searchSkillsQuery = trpc.registry.searchSkills.useQuery(registryQueryInput, {
        enabled: searchEnabled,
        ...PROGRESSIVE_QUERY_OPTIONS,
    });
    const sessionRegistryContext = input.sessionId
        ? {
              profileId: input.profileId,
              sessionId: input.sessionId,
              topLevelTab: input.topLevelTab,
              modeKey: input.modeKey,
          }
        : undefined;

    const setAttachedRulesMutation = trpc.session.setAttachedRules.useMutation({
        onMutate: ({ assetKeys }) => {
            if (!sessionRegistryContext) {
                return {};
            }
            const previousAttachedRules = utils.session.getAttachedRules.getData(sessionRegistryContext);
            const rulesByAssetKey = new Map(
                [...input.attachedRules, ...(searchRulesQuery.data?.rulesets ?? [])]
                    .filter((ruleset) => ruleset.activationMode === 'manual')
                    .map((ruleset) => [ruleset.assetKey, ruleset] as const)
            );
            const nextRulesets = assetKeys.flatMap((assetKey) => {
                const ruleset = rulesByAssetKey.get(assetKey);
                return ruleset ? [ruleset] : [];
            });
            const nextMissingAssetKeys = assetKeys.filter((assetKey) => !rulesByAssetKey.has(assetKey));

            utils.session.getAttachedRules.setData(sessionRegistryContext, {
                sessionId: sessionRegistryContext.sessionId,
                presetKeys: previousAttachedRules?.presetKeys ?? [],
                rulesets: nextRulesets,
                ...(nextMissingAssetKeys.length > 0 ? { missingAssetKeys: nextMissingAssetKeys } : {}),
            });

            return { previousAttachedRules };
        },
        onSuccess: (nextAttachedRules) => {
            if (!sessionRegistryContext) {
                return;
            }
            utils.session.getAttachedRules.setData(sessionRegistryContext, nextAttachedRules);
        },
        onError: (_error, _variables, context) => {
            if (!sessionRegistryContext) {
                return;
            }
            if (context?.previousAttachedRules) {
                utils.session.getAttachedRules.setData(sessionRegistryContext, context.previousAttachedRules);
            }
        },
    });

    const setAttachedSkillsMutation = trpc.session.setAttachedSkills.useMutation({
        onMutate: ({ assetKeys }) => {
            if (!sessionRegistryContext) {
                return {};
            }
            const previousAttachedSkills = utils.session.getAttachedSkills.getData(sessionRegistryContext);
            const skillfilesByAssetKey = new Map(
                [...input.attachedSkills, ...(searchSkillsQuery.data?.skillfiles ?? [])].map((skillfile) => [
                    skillfile.assetKey,
                    skillfile,
                ])
            );
            const nextSkillfiles = assetKeys.flatMap((assetKey) => {
                const skillfile = skillfilesByAssetKey.get(assetKey);
                return skillfile ? [skillfile] : [];
            });
            const nextMissingAssetKeys = assetKeys.filter((assetKey) => !skillfilesByAssetKey.has(assetKey));

            utils.session.getAttachedSkills.setData(sessionRegistryContext, {
                sessionId: sessionRegistryContext.sessionId,
                skillfiles: nextSkillfiles,
                ...(nextMissingAssetKeys.length > 0 ? { missingAssetKeys: nextMissingAssetKeys } : {}),
            });

            return { previousAttachedSkills };
        },
        onSuccess: (nextAttachedSkills) => {
            if (!sessionRegistryContext) {
                return;
            }
            utils.session.getAttachedSkills.setData(sessionRegistryContext, nextAttachedSkills);
        },
        onError: (_error, _variables, context) => {
            if (!sessionRegistryContext) {
                return;
            }
            if (context?.previousAttachedSkills) {
                utils.session.getAttachedSkills.setData(sessionRegistryContext, context.previousAttachedSkills);
            }
        },
    });

    const attachedRuleAssetKeys = input.attachedRules.map((ruleset) => ruleset.assetKey);
    const attachedRuleAssetKeySet = new Set(attachedRuleAssetKeys);
    const attachedSkillAssetKeys = input.attachedSkills.map((skillfile) => skillfile.assetKey);
    const attachedSkillAssetKeySet = new Set(attachedSkillAssetKeys);
    const resolvedManualRules = (searchRulesQuery.data?.rulesets ?? []).filter(
        (ruleset) => ruleset.activationMode === 'manual'
    );
    const resolvedSkills = searchSkillsQuery.data?.skillfiles ?? [];

    const readModel: ContextAssetAttachmentReadModel = {
        attachedRules: input.attachedRules,
        missingAttachedRuleKeys: input.missingAttachedRuleKeys,
        attachedRuleAssetKeys,
        attachedRuleAssetKeySet,
        attachedSkills: input.attachedSkills,
        missingAttachedSkillKeys: input.missingAttachedSkillKeys,
        attachedSkillAssetKeys,
        attachedSkillAssetKeySet,
        resolvedManualRules,
        resolvedSkills,
        visibleManualRules: resolvedManualRules.slice(0, 6),
        visibleSkills: resolvedSkills.slice(0, 6),
        isRefreshingRules: searchRulesQuery.isFetching,
        isRefreshingSkills: searchSkillsQuery.isFetching,
    };

    async function updateAttachedRules(assetKeys: string[]) {
        if (!input.sessionId) {
            return;
        }
        await setAttachedRulesMutation.mutateAsync({
            profileId: input.profileId,
            sessionId: input.sessionId,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            assetKeys,
        });
    }

    async function updateAttachedSkills(assetKeys: string[]) {
        if (!input.sessionId) {
            return;
        }
        await setAttachedSkillsMutation.mutateAsync({
            profileId: input.profileId,
            sessionId: input.sessionId,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            assetKeys,
        });
    }

    return {
        readModel,
        isBusy: setAttachedRulesMutation.isPending || setAttachedSkillsMutation.isPending,
        mutationError: setAttachedRulesMutation.error?.message ?? setAttachedSkillsMutation.error?.message,
        updateAttachedRules,
        updateAttachedSkills,
        attachRule: async (assetKey: string) => {
            await updateAttachedRules([...attachedRuleAssetKeys, assetKey]);
        },
        detachRule: async (assetKey: string) => {
            await updateAttachedRules(attachedRuleAssetKeys.filter((candidate) => candidate !== assetKey));
        },
        toggleRule: async (assetKey: string) => {
            await updateAttachedRules(
                attachedRuleAssetKeySet.has(assetKey)
                    ? attachedRuleAssetKeys.filter((candidate) => candidate !== assetKey)
                    : [...attachedRuleAssetKeys, assetKey]
            );
        },
        attachSkill: async (assetKey: string) => {
            await updateAttachedSkills([...attachedSkillAssetKeys, assetKey]);
        },
        detachSkill: async (assetKey: string) => {
            await updateAttachedSkills(attachedSkillAssetKeys.filter((candidate) => candidate !== assetKey));
        },
        toggleSkill: async (assetKey: string) => {
            await updateAttachedSkills(
                attachedSkillAssetKeySet.has(assetKey)
                    ? attachedSkillAssetKeys.filter((candidate) => candidate !== assetKey)
                    : [...attachedSkillAssetKeys, assetKey]
            );
        },
    };
}
