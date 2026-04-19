import { useState } from 'react';

import { useContextAssetAttachmentController } from '@/web/components/conversation/panels/useContextAssetAttachmentController';
import { Button } from '@/web/components/ui/button';
import { useDebouncedQueryValue } from '@/web/lib/hooks/useDebouncedQueryValue';
import { summarizeSkillDynamicContext } from '@/web/lib/skillDynamicContextSummary';

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

function SkillDynamicContextBadges({ skillfile }: { skillfile: SkillfileDefinition }) {
    const summary = summarizeSkillDynamicContext(skillfile.dynamicContextSources);
    if (summary.sourceCount === 0) {
        return null;
    }

    return (
        <>
            <span className='bg-primary/10 text-primary rounded-full px-2 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase'>
                {summary.sourceCount} dynamic
            </span>
            {summary.unsafeCount > 0 ? (
                <span className='rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase text-amber-700 dark:text-amber-300'>
                    {summary.unsafeCount} unsafe
                </span>
            ) : null}
            {summary.invalidCount > 0 ? (
                <span className='rounded-full bg-rose-500/10 px-2 py-1 text-[10px] font-semibold tracking-[0.12em] uppercase text-rose-700 dark:text-rose-300'>
                    {summary.invalidCount} invalid
                </span>
            ) : null}
        </>
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
    const attachmentController = useContextAssetAttachmentController({
        profileId,
        sessionId,
        topLevelTab,
        modeKey,
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(sandboxId ? { sandboxId } : {}),
        query: debouncedQuery,
        searchEnabled: true,
        attachedRules,
        missingAttachedRuleKeys,
        attachedSkills,
        missingAttachedSkillKeys,
    });
    const { readModel } = attachmentController;

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
                    <p>{readModel.attachedRules.length} manual rules</p>
                    <p>{readModel.attachedSkills.length} skills</p>
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

            {readModel.missingAttachedRuleKeys.length > 0 ? (
                <div className='mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs'>
                    Unresolved attached rules: {readModel.missingAttachedRuleKeys.join(', ')}. Any save here will prune them.
                </div>
            ) : null}
            {readModel.missingAttachedSkillKeys.length > 0 ? (
                <div className='mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs'>
                    Unresolved attached skills: {readModel.missingAttachedSkillKeys.join(', ')}. Any save here will prune them.
                </div>
            ) : null}
            {attachmentController.mutationError ? (
                <div
                    aria-live='polite'
                    className='text-destructive mt-3 rounded-xl border border-current/20 px-3 py-2 text-xs'>
                    {attachmentController.mutationError}
                </div>
            ) : null}

            <div className='mt-4 space-y-2'>
                <div className='flex items-center justify-between gap-2'>
                    <p className='text-sm font-semibold'>Attached Manual Rules</p>
                    <span className='text-muted-foreground text-xs'>{readModel.attachedRules.length} attached</span>
                </div>
                {readModel.attachedRules.length > 0 ? (
                    readModel.attachedRules.map((ruleset) => (
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
                                disabled={attachmentController.isBusy}
                                onClick={() => {
                                    void attachmentController.detachRule(ruleset.assetKey);
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
                    <span className='text-muted-foreground text-xs'>{readModel.attachedSkills.length} attached</span>
                </div>
                {readModel.attachedSkills.length > 0 ? (
                    readModel.attachedSkills.map((skillfile) => (
                        <div
                            key={skillfile.assetKey}
                            className='border-border bg-background/70 flex min-h-11 items-start justify-between gap-3 rounded-xl border px-3 py-3'>
                            <div className='min-w-0'>
                                <div className='flex flex-wrap items-center gap-2'>
                                    <p className='text-sm font-medium'>{skillfile.name}</p>
                                    <ScopeBadge scope={skillfile.scope} />
                                    <PresetBadge presetKey={skillfile.presetKey} />
                                    <SkillDynamicContextBadges skillfile={skillfile} />
                                </div>
                                <p className='text-muted-foreground mt-1 text-xs'>
                                    {skillfile.description ?? skillfile.assetKey}
                                </p>
                            </div>
                            <Button
                                type='button'
                                size='sm'
                                variant='outline'
                                disabled={attachmentController.isBusy}
                                onClick={() => {
                                    void attachmentController.detachSkill(skillfile.assetKey);
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
                    {readModel.isRefreshingRules ? <p className='text-muted-foreground text-xs'>Refreshing…</p> : null}
                </div>
                {readModel.visibleManualRules.length > 0 ? (
                    readModel.visibleManualRules.map((ruleset) => {
                        const attached = readModel.attachedRuleAssetKeySet.has(ruleset.assetKey);
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
                                    disabled={attached || attachmentController.isBusy}
                                    onClick={() => {
                                        void attachmentController.attachRule(ruleset.assetKey);
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
                    {readModel.isRefreshingSkills ? <p className='text-muted-foreground text-xs'>Refreshing…</p> : null}
                </div>
                {readModel.visibleSkills.length > 0 ? (
                    readModel.visibleSkills.map((skillfile) => {
                        const attached = readModel.attachedSkillAssetKeySet.has(skillfile.assetKey);
                        return (
                            <div
                                key={skillfile.assetKey}
                                className='border-border flex min-h-11 items-start justify-between gap-3 rounded-xl border px-3 py-3'>
                                <div className='min-w-0'>
                                    <div className='flex flex-wrap items-center gap-2'>
                                        <p className='text-sm font-medium'>{skillfile.name}</p>
                                        <ScopeBadge scope={skillfile.scope} />
                                        <PresetBadge presetKey={skillfile.presetKey} />
                                        <SkillDynamicContextBadges skillfile={skillfile} />
                                    </div>
                                    <p className='text-muted-foreground mt-1 text-xs'>
                                        {skillfile.description ?? skillfile.assetKey}
                                    </p>
                                </div>
                                <Button
                                    type='button'
                                    size='sm'
                                    variant={attached ? 'outline' : 'default'}
                                    disabled={attached || attachmentController.isBusy}
                                    onClick={() => {
                                        void attachmentController.attachSkill(skillfile.assetKey);
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
