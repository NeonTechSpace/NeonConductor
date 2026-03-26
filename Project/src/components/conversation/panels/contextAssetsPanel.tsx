import { useState } from 'react';

import { Button } from '@/web/components/ui/button';
import { useDebouncedQueryValue } from '@/web/lib/hooks/useDebouncedQueryValue';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { EntityId, RulesetDefinition, SkillfileDefinition, TopLevelTab } from '@/shared/contracts';

interface ContextAssetsPanelProps {
    profileId: string;
    sessionId: EntityId<'sess'>;
    topLevelTab: TopLevelTab;
    modeKey: string;
    workspaceFingerprint?: string;
    sandboxId?: EntityId<'sb'>;
    attachedRules: RulesetDefinition[];
    missingAttachedRuleKeys: string[];
    attachedSkills: SkillfileDefinition[];
    missingAttachedSkillKeys: string[];
}

function ScopeBadge({ scope }: { scope: RulesetDefinition['scope']   }) {
    const label = scope === 'workspace' ? 'Workspace' : scope === 'global' ? 'Global' : 'Session';
    return (
        <span className='bg-muted text-muted-foreground rounded-full px-2 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase'>
            {label}
        </span>
    );
}

function PresetBadge({ presetKey }: { presetKey?: RulesetDefinition['presetKey']   }) {
    return (
        <span className='bg-background text-muted-foreground rounded-full px-2 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase'>
            {presetKey ?? 'shared'}
        </span>
    );
}

function ActivationBadge({ activationMode }: { activationMode: RulesetDefinition['activationMode'] }) {
    return (
        <span className='bg-primary/10 text-primary rounded-full px-2 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase'>
            {activationMode}
        </span>
    );
}

export function ContextAssetsPanel({
    profileId,
    sessionId,
    topLevelTab,
    modeKey,
    workspaceFingerprint,
    sandboxId,
    attachedRules,
    missingAttachedRuleKeys,
    attachedSkills,
    missingAttachedSkillKeys,
}: ContextAssetsPanelProps) {
    const [query, setQuery] = useState('');
    const debouncedQuery = useDebouncedQueryValue(query.trim());
    const [mutationError, setMutationError] = useState<string | undefined>(undefined);
    const utils = trpc.useUtils();
    const queryInput = {
        profileId,
        topLevelTab,
        modeKey,
        ...(debouncedQuery.length > 0 ? { query: debouncedQuery } : {}),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(sandboxId ? { sandboxId } : {}),
    };
    const searchRulesQuery = trpc.registry.searchRules.useQuery(queryInput, PROGRESSIVE_QUERY_OPTIONS);
    const searchSkillsQuery = trpc.registry.searchSkills.useQuery(queryInput, PROGRESSIVE_QUERY_OPTIONS);
    const attachedRulesQueryInput = {
        profileId,
        sessionId,
        topLevelTab,
        modeKey,
    };
    const setAttachedRulesMutation = trpc.session.setAttachedRules.useMutation({
        onMutate: ({ assetKeys }) => {
            setMutationError(undefined);
            const previousAttachedRules = utils.session.getAttachedRules.getData(attachedRulesQueryInput);
            const rulesByAssetKey = new Map(
                [...attachedRules, ...(searchRulesQuery.data?.rulesets ?? [])]
                    .filter((ruleset) => ruleset.activationMode === 'manual')
                    .map((ruleset) => [ruleset.assetKey, ruleset] as const)
            );
            const nextRulesets = assetKeys.flatMap((assetKey) => {
                const ruleset = rulesByAssetKey.get(assetKey);
                return ruleset ? [ruleset] : [];
            });
            const nextMissingAssetKeys = assetKeys.filter((assetKey) => !rulesByAssetKey.has(assetKey));

            utils.session.getAttachedRules.setData(attachedRulesQueryInput, {
                sessionId,
                presetKeys: previousAttachedRules?.presetKeys ?? [],
                rulesets: nextRulesets,
                ...(nextMissingAssetKeys.length > 0 ? { missingAssetKeys: nextMissingAssetKeys } : {}),
            });

            return { previousAttachedRules };
        },
        onSuccess: (nextAttachedRules) => {
            setMutationError(undefined);
            utils.session.getAttachedRules.setData(attachedRulesQueryInput, nextAttachedRules);
        },
        onError: (error, _variables, context) => {
            if (context?.previousAttachedRules) {
                utils.session.getAttachedRules.setData(attachedRulesQueryInput, context.previousAttachedRules);
            }
            setMutationError(error.message);
        },
    });
    const attachedSkillsQueryInput = {
        profileId,
        sessionId,
        topLevelTab,
        modeKey,
    };
    const setAttachedSkillsMutation = trpc.session.setAttachedSkills.useMutation({
        onMutate: ({ assetKeys }) => {
            setMutationError(undefined);
            const previousAttachedSkills = utils.session.getAttachedSkills.getData(attachedSkillsQueryInput);
            const skillfilesByAssetKey = new Map(
                [...attachedSkills, ...(searchSkillsQuery.data?.skillfiles ?? [])].map((skillfile) => [
                    skillfile.assetKey,
                    skillfile,
                ])
            );
            const nextSkillfiles = assetKeys.flatMap((assetKey) => {
                const skillfile = skillfilesByAssetKey.get(assetKey);
                return skillfile ? [skillfile] : [];
            });
            const nextMissingAssetKeys = assetKeys.filter((assetKey) => !skillfilesByAssetKey.has(assetKey));

            utils.session.getAttachedSkills.setData(attachedSkillsQueryInput, {
                sessionId,
                skillfiles: nextSkillfiles,
                ...(nextMissingAssetKeys.length > 0 ? { missingAssetKeys: nextMissingAssetKeys } : {}),
            });

            return { previousAttachedSkills };
        },
        onSuccess: (nextAttachedSkills) => {
            setMutationError(undefined);
            utils.session.getAttachedSkills.setData(attachedSkillsQueryInput, nextAttachedSkills);
        },
        onError: (error, _variables, context) => {
            if (context?.previousAttachedSkills) {
                utils.session.getAttachedSkills.setData(attachedSkillsQueryInput, context.previousAttachedSkills);
            }
            setMutationError(error.message);
        },
    });

    const attachedRuleAssetKeys = attachedRules.map((ruleset) => ruleset.assetKey);
    const attachedRuleAssetKeySet = new Set(attachedRuleAssetKeys);
    const attachedSkillAssetKeys = attachedSkills.map((skillfile) => skillfile.assetKey);
    const attachedSkillAssetKeySet = new Set(attachedSkillAssetKeys);
    const visibleManualRules = (searchRulesQuery.data?.rulesets ?? [])
        .filter((ruleset) => ruleset.activationMode === 'manual')
        .slice(0, 6);
    const visibleSkills = (searchSkillsQuery.data?.skillfiles ?? []).slice(0, 6);

    const applyAttachedRules = (assetKeys: string[]) => {
        setMutationError(undefined);
        void setAttachedRulesMutation
            .mutateAsync({
                profileId,
                sessionId,
                topLevelTab,
                modeKey,
                assetKeys,
            })
            .catch((error: unknown) => {
                setMutationError(error instanceof Error ? error.message : 'Manual rules could not be updated.');
            });
    };

    const applyAttachedSkills = (assetKeys: string[]) => {
        setMutationError(undefined);
        void setAttachedSkillsMutation
            .mutateAsync({
                profileId,
                sessionId,
                topLevelTab,
                modeKey,
                assetKeys,
            })
            .catch((error: unknown) => {
                setMutationError(error instanceof Error ? error.message : 'Attached skills could not be updated.');
            });
    };

    return (
        <section className='border-border bg-card mb-3 rounded-2xl border p-3'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
                <div>
                    <p className='text-sm font-semibold'>Context Assets</p>
                    <p className='text-muted-foreground text-xs'>
                        Always and auto rules apply automatically. Manual rules and skills stay explicit per session.
                    </p>
                </div>
                <div className='text-muted-foreground text-right text-xs [font-variant-numeric:tabular-nums]'>
                    <p>{attachedRules.length} manual rules</p>
                    <p>{attachedSkills.length} skills</p>
                </div>
            </div>

            <label className='mt-3 block'>
                <span className='sr-only'>Search context assets</span>
                <input
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value);
                    }}
                    className='border-border bg-background h-11 w-full rounded-xl border px-3 text-sm'
                    autoComplete='off'
                    name='contextAssetSearch'
                    placeholder='Search manual rules and skills by name or tag…'
                />
            </label>

            {missingAttachedRuleKeys.length > 0 ? (
                <div className='mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs'>
                    Unresolved attached rules: {missingAttachedRuleKeys.join(', ')}. Any save here will prune them.
                </div>
            ) : null}
            {missingAttachedSkillKeys.length > 0 ? (
                <div className='mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs'>
                    Unresolved attached skills: {missingAttachedSkillKeys.join(', ')}. Any save here will prune them.
                </div>
            ) : null}
            {mutationError ? (
                <div
                    aria-live='polite'
                    className='text-destructive mt-3 rounded-xl border border-current/20 px-3 py-2 text-xs'>
                    {mutationError}
                </div>
            ) : null}

            <div className='mt-4 space-y-2'>
                <div className='flex items-center justify-between gap-2'>
                    <p className='text-sm font-semibold'>Attached Manual Rules</p>
                    <span className='text-muted-foreground text-xs'>{attachedRules.length} attached</span>
                </div>
                {attachedRules.length > 0 ? (
                    attachedRules.map((ruleset) => (
                        <div
                            key={ruleset.assetKey}
                            className='border-border bg-background/70 flex min-h-11 items-start justify-between gap-3 rounded-xl border px-3 py-3'>
                            <div className='min-w-0'>
                                <div className='flex flex-wrap items-center gap-2'>
                                    <p className='text-sm font-medium'>{ruleset.name}</p>
                                    <ScopeBadge scope={ruleset.scope} />
                                    <PresetBadge presetKey={ruleset.presetKey} />
                                    <ActivationBadge activationMode={ruleset.activationMode} />
                                </div>
                                <p className='text-muted-foreground mt-1 text-xs'>
                                    {ruleset.description ?? ruleset.assetKey}
                                </p>
                            </div>
                            <Button
                                type='button'
                                size='sm'
                                variant='outline'
                                disabled={setAttachedRulesMutation.isPending}
                                onClick={() => {
                                    applyAttachedRules(
                                        attachedRuleAssetKeys.filter((assetKey) => assetKey !== ruleset.assetKey)
                                    );
                                }}>
                                Remove
                            </Button>
                        </div>
                    ))
                ) : (
                    <p className='text-muted-foreground rounded-xl border border-dashed px-3 py-3 text-sm'>
                        No manual rules attached to this session yet.
                    </p>
                )}
            </div>

            <div className='mt-4 space-y-2'>
                <div className='flex items-center justify-between gap-2'>
                    <p className='text-sm font-semibold'>Attached Skills</p>
                    <span className='text-muted-foreground text-xs'>{attachedSkills.length} attached</span>
                </div>
                {attachedSkills.length > 0 ? (
                    attachedSkills.map((skillfile) => (
                        <div
                            key={skillfile.assetKey}
                            className='border-border bg-background/70 flex min-h-11 items-start justify-between gap-3 rounded-xl border px-3 py-3'>
                            <div className='min-w-0'>
                                <div className='flex flex-wrap items-center gap-2'>
                                    <p className='text-sm font-medium'>{skillfile.name}</p>
                                    <ScopeBadge scope={skillfile.scope} />
                                    <PresetBadge presetKey={skillfile.presetKey} />
                                </div>
                                <p className='text-muted-foreground mt-1 text-xs'>
                                    {skillfile.description ?? skillfile.assetKey}
                                </p>
                            </div>
                            <Button
                                type='button'
                                size='sm'
                                variant='outline'
                                disabled={setAttachedSkillsMutation.isPending}
                                onClick={() => {
                                    applyAttachedSkills(
                                        attachedSkillAssetKeys.filter((assetKey) => assetKey !== skillfile.assetKey)
                                    );
                                }}>
                                Remove
                            </Button>
                        </div>
                    ))
                ) : (
                    <p className='text-muted-foreground rounded-xl border border-dashed px-3 py-3 text-sm'>
                        No skills attached to this session yet.
                    </p>
                )}
            </div>

            <div className='mt-4 space-y-2'>
                <div className='flex items-center justify-between gap-2'>
                    <p className='text-sm font-semibold'>Manual Rule Search</p>
                    {searchRulesQuery.isFetching ? <p className='text-muted-foreground text-xs'>Refreshing…</p> : null}
                </div>
                {visibleManualRules.length > 0 ? (
                    visibleManualRules.map((ruleset) => {
                        const attached = attachedRuleAssetKeySet.has(ruleset.assetKey);
                        return (
                            <div
                                key={ruleset.assetKey}
                                className='border-border flex min-h-11 items-start justify-between gap-3 rounded-xl border px-3 py-3'>
                                <div className='min-w-0'>
                                    <div className='flex flex-wrap items-center gap-2'>
                                        <p className='text-sm font-medium'>{ruleset.name}</p>
                                        <ScopeBadge scope={ruleset.scope} />
                                        <PresetBadge presetKey={ruleset.presetKey} />
                                        <ActivationBadge activationMode={ruleset.activationMode} />
                                    </div>
                                    <p className='text-muted-foreground mt-1 text-xs'>
                                        {ruleset.description ?? ruleset.assetKey}
                                    </p>
                                </div>
                                <Button
                                    type='button'
                                    size='sm'
                                    variant={attached ? 'outline' : 'default'}
                                    disabled={attached || setAttachedRulesMutation.isPending}
                                    onClick={() => {
                                        applyAttachedRules([...attachedRuleAssetKeys, ruleset.assetKey]);
                                    }}>
                                    {attached ? 'Attached' : 'Attach'}
                                </Button>
                            </div>
                        );
                    })
                ) : (
                    <p className='text-muted-foreground rounded-xl border border-dashed px-3 py-3 text-sm'>
                        {debouncedQuery.length > 0
                            ? 'No manual rules match this search.'
                            : 'No manual rules available.'}
                    </p>
                )}
            </div>

            <div className='mt-4 space-y-2'>
                <div className='flex items-center justify-between gap-2'>
                    <p className='text-sm font-semibold'>Resolved Skill Search</p>
                    {searchSkillsQuery.isFetching ? <p className='text-muted-foreground text-xs'>Refreshing…</p> : null}
                </div>
                {visibleSkills.length > 0 ? (
                    visibleSkills.map((skillfile) => {
                        const attached = attachedSkillAssetKeySet.has(skillfile.assetKey);
                        return (
                            <div
                                key={skillfile.assetKey}
                                className='border-border flex min-h-11 items-start justify-between gap-3 rounded-xl border px-3 py-3'>
                                <div className='min-w-0'>
                                    <div className='flex flex-wrap items-center gap-2'>
                                        <p className='text-sm font-medium'>{skillfile.name}</p>
                                        <ScopeBadge scope={skillfile.scope} />
                                        <PresetBadge presetKey={skillfile.presetKey} />
                                    </div>
                                    <p className='text-muted-foreground mt-1 text-xs'>
                                        {skillfile.description ?? skillfile.assetKey}
                                    </p>
                                </div>
                                <Button
                                    type='button'
                                    size='sm'
                                    variant={attached ? 'outline' : 'default'}
                                    disabled={attached || setAttachedSkillsMutation.isPending}
                                    onClick={() => {
                                        applyAttachedSkills([...attachedSkillAssetKeys, skillfile.assetKey]);
                                    }}>
                                    {attached ? 'Attached' : 'Attach'}
                                </Button>
                            </div>
                        );
                    })
                ) : (
                    <p className='text-muted-foreground rounded-xl border border-dashed px-3 py-3 text-sm'>
                        {debouncedQuery.length > 0
                            ? 'No resolved skills match this search.'
                            : 'No resolved skills available.'}
                    </p>
                )}
            </div>
        </section>
    );
}
