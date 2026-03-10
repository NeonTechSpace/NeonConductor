import { useEffect, useState } from 'react';

import { setResolvedContextStateCache } from '@/web/components/context/contextStateCache';
import { isProviderId } from '@/web/components/conversation/shell/workspace/helpers';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';
import { SettingsSelectionRail } from '@/web/components/settings/shared/settingsSelectionRail';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';

function formatTokenCount(value: number): string {
    return new Intl.NumberFormat('en-US').format(value);
}

interface ContextSettingsViewProps {
    activeProfileId: string;
}

export function ContextSettingsView({ activeProfileId }: ContextSettingsViewProps) {
    const utils = trpc.useUtils();
    const [selectedProfileId, setSelectedProfileId] = useState(activeProfileId);
    const [globalEnabled, setGlobalEnabled] = useState(true);
    const [globalPercent, setGlobalPercent] = useState('90');
    const [profileOverrideMode, setProfileOverrideMode] = useState<'inherit' | 'percent' | 'fixed_tokens'>('inherit');
    const [profilePercent, setProfilePercent] = useState('90');
    const [profileFixedInputTokens, setProfileFixedInputTokens] = useState('');
    const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>(undefined);
    const [feedbackTone, setFeedbackTone] = useState<'success' | 'error' | 'info'>('info');

    const profilesQuery = trpc.profile.list.useQuery(undefined, PROGRESSIVE_QUERY_OPTIONS);
    const globalSettingsQuery = trpc.context.getGlobalSettings.useQuery(undefined, PROGRESSIVE_QUERY_OPTIONS);
    const profileSettingsQuery = trpc.context.getProfileSettings.useQuery(
        { profileId: selectedProfileId },
        { enabled: selectedProfileId.length > 0, ...PROGRESSIVE_QUERY_OPTIONS }
    );
    const shellBootstrapQuery = trpc.runtime.getShellBootstrap.useQuery(
        { profileId: selectedProfileId },
        { enabled: selectedProfileId.length > 0, ...PROGRESSIVE_QUERY_OPTIONS }
    );

    const defaultProviderId = shellBootstrapQuery.data?.defaults.providerId;
    const defaultModelId = shellBootstrapQuery.data?.defaults.modelId;
    const effectiveProviderId: RuntimeProviderId = isProviderId(defaultProviderId) ? defaultProviderId : 'openai';
    const effectiveModelId = defaultModelId ?? 'openai/gpt-5';
    const defaultModel = shellBootstrapQuery.data?.providerModels.find(
        (model) => model.providerId === defaultProviderId && model.id === defaultModelId
    );
    const defaultProvider = shellBootstrapQuery.data?.providers.find((provider) => provider.id === defaultProviderId);

    const resolvedContextStateQuery = trpc.context.getResolvedState.useQuery(
        {
            profileId: selectedProfileId,
            providerId: effectiveProviderId,
            modelId: effectiveModelId,
        },
        {
            enabled: selectedProfileId.length > 0 && Boolean(defaultProviderId) && Boolean(defaultModelId),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const resolvedContextStateQueryInput = {
        profileId: selectedProfileId,
        providerId: effectiveProviderId,
        modelId: effectiveModelId,
    };

    const setGlobalSettingsMutation = trpc.context.setGlobalSettings.useMutation({
        onSuccess: ({ settings, resolvedState }) => {
            setFeedbackTone('success');
            setFeedbackMessage('Saved global context defaults.');
            setGlobalEnabled(settings.enabled);
            setGlobalPercent(String(settings.percent));
            utils.context.getGlobalSettings.setData(undefined, {
                settings,
            });
            if (resolvedState) {
                setResolvedContextStateCache({
                    utils,
                    queryInput: resolvedContextStateQueryInput,
                    state: resolvedState,
                });
            }
        },
        onError: (error) => {
            setFeedbackTone('error');
            setFeedbackMessage(error.message);
        },
    });
    const setProfileSettingsMutation = trpc.context.setProfileSettings.useMutation({
        onSuccess: ({ settings, resolvedState }) => {
            setFeedbackTone('success');
            setFeedbackMessage('Saved profile context override.');
            setProfileOverrideMode(settings.overrideMode);
            setProfilePercent(settings.percent !== undefined ? String(settings.percent) : globalPercent);
            setProfileFixedInputTokens(
                settings.fixedInputTokens !== undefined ? String(settings.fixedInputTokens) : ''
            );
            utils.context.getProfileSettings.setData(
                {
                    profileId: selectedProfileId,
                },
                {
                    settings,
                }
            );
            if (resolvedState) {
                setResolvedContextStateCache({
                    utils,
                    queryInput: resolvedContextStateQueryInput,
                    state: resolvedState,
                });
            }
        },
        onError: (error) => {
            setFeedbackTone('error');
            setFeedbackMessage(error.message);
        },
    });

    useEffect(() => {
        if (profilesQuery.data?.profiles.length) {
            const exists = profilesQuery.data.profiles.some((profile) => profile.id === selectedProfileId);
            if (!exists) {
                setSelectedProfileId(activeProfileId);
            }
        }
    }, [activeProfileId, profilesQuery.data?.profiles, selectedProfileId]);

    useEffect(() => {
        const settings = globalSettingsQuery.data?.settings;
        if (!settings) {
            return;
        }

        setGlobalEnabled(settings.enabled);
        setGlobalPercent(String(settings.percent));
    }, [globalSettingsQuery.data?.settings]);

    useEffect(() => {
        const settings = profileSettingsQuery.data?.settings;
        if (!settings) {
            return;
        }

        setProfileOverrideMode(settings.overrideMode);
        setProfilePercent(settings.percent !== undefined ? String(settings.percent) : globalPercent);
        setProfileFixedInputTokens(settings.fixedInputTokens !== undefined ? String(settings.fixedInputTokens) : '');
    }, [globalPercent, profileSettingsQuery.data?.settings]);

    return (
        <section className='grid min-h-full grid-cols-[260px_1fr]'>
            <SettingsSelectionRail
                title='Profiles'
                ariaLabel='Context settings profiles'
                selectedId={selectedProfileId}
                onSelect={(profileId) => {
                    setSelectedProfileId(profileId);
                    setFeedbackMessage(undefined);
                }}
                items={(profilesQuery.data?.profiles ?? []).map((profile) => ({
                    id: profile.id,
                    title: profile.name,
                    subtitle: profile.id,
                }))}
            />

            <div className='min-h-0 overflow-y-auto p-4'>
                <div className='space-y-6'>
                    <SettingsFeedbackBanner message={feedbackMessage} tone={feedbackTone} />
                    <section className='space-y-3'>
                        <div>
                            <h4 className='text-sm font-semibold'>Global Default</h4>
                            <p className='text-muted-foreground text-xs'>
                                Context management is on by default and compacts older session history before runs when
                                the selected model approaches its input threshold.
                            </p>
                        </div>

                        <label className='flex items-center gap-2 text-sm'>
                            <input
                                type='checkbox'
                                checked={globalEnabled}
                                onChange={(event) => {
                                    setGlobalEnabled(event.target.checked);
                                    setFeedbackMessage(undefined);
                                }}
                            />
                            Enable automatic context management
                        </label>

                        <div className='max-w-sm space-y-1'>
                            <label className='text-sm font-medium'>Compact threshold (%)</label>
                            <input
                                aria-label='Global context compact threshold percent'
                                type='number'
                                min={1}
                                max={100}
                                value={globalPercent}
                                onChange={(event) => {
                                    setGlobalPercent(event.target.value);
                                    setFeedbackMessage(undefined);
                                }}
                                className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm'
                            />
                            <p className='text-muted-foreground text-xs'>
                                Applies after subtracting the model safety buffer.
                            </p>
                        </div>

                        <button
                            type='button'
                            className='border-border bg-background hover:bg-accent rounded-md border px-3 py-2 text-sm'
                            disabled={setGlobalSettingsMutation.isPending}
                            onClick={() => {
                                const percent = Number(globalPercent);
                                if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
                                    setFeedbackTone('error');
                                    setFeedbackMessage('Global compact threshold must be an integer between 1 and 100.');
                                    return;
                                }

                                void setGlobalSettingsMutation.mutateAsync({
                                    enabled: globalEnabled,
                                    mode: 'percent',
                                    percent,
                                    preview: resolvedContextStateQueryInput,
                                });
                            }}>
                            Save global defaults
                        </button>
                    </section>

                    <section className='space-y-3'>
                        <div>
                            <h4 className='text-sm font-semibold'>Profile Override</h4>
                            <p className='text-muted-foreground text-xs'>
                                Override the global default for the selected profile with either another percentage or a
                                fixed input-token ceiling.
                            </p>
                        </div>

                        <div className='max-w-sm space-y-1'>
                            <label className='text-sm font-medium'>Override mode</label>
                            <select
                                aria-label='Profile override mode'
                                value={profileOverrideMode}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    if (value !== 'inherit' && value !== 'percent' && value !== 'fixed_tokens') {
                                        return;
                                    }
                                    setProfileOverrideMode(value);
                                    setFeedbackMessage(undefined);
                                }}
                                className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm'>
                                <option value='inherit'>Inherit global default</option>
                                <option value='percent'>Use a profile-specific percentage</option>
                                <option value='fixed_tokens'>Use a fixed input token budget</option>
                            </select>
                        </div>

                        {profileOverrideMode === 'percent' ? (
                            <div className='max-w-sm space-y-1'>
                                <label className='text-sm font-medium'>Profile threshold (%)</label>
                                <input
                                    aria-label='Profile-specific threshold percent'
                                    type='number'
                                    min={1}
                                    max={100}
                                    value={profilePercent}
                                    onChange={(event) => {
                                        setProfilePercent(event.target.value);
                                        setFeedbackMessage(undefined);
                                    }}
                                    className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm'
                                />
                            </div>
                        ) : null}

                        {profileOverrideMode === 'fixed_tokens' ? (
                            <div className='max-w-sm space-y-1'>
                                <label className='text-sm font-medium'>Fixed input tokens</label>
                                <input
                                    aria-label='Fixed input token budget'
                                    type='number'
                                    min={1}
                                    value={profileFixedInputTokens}
                                    onChange={(event) => {
                                        setProfileFixedInputTokens(event.target.value);
                                        setFeedbackMessage(undefined);
                                    }}
                                    className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm'
                                    disabled={!resolvedContextStateQuery.data?.policy.limits.modelLimitsKnown}
                                />
                                {!resolvedContextStateQuery.data?.policy.limits.modelLimitsKnown ? (
                                    <p className='text-muted-foreground text-xs'>
                                        Fixed-token overrides need a model with a known context length.
                                    </p>
                                ) : null}
                            </div>
                        ) : null}

                        <button
                            type='button'
                            className='border-border bg-background hover:bg-accent rounded-md border px-3 py-2 text-sm'
                            disabled={setProfileSettingsMutation.isPending}
                            onClick={() => {
                                if (profileOverrideMode === 'inherit') {
                                    void setProfileSettingsMutation.mutateAsync({
                                        profileId: selectedProfileId,
                                        overrideMode: 'inherit',
                                        preview: resolvedContextStateQueryInput,
                                    });
                                    return;
                                }

                                if (profileOverrideMode === 'percent') {
                                    const percent = Number(profilePercent);
                                    if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
                                        setFeedbackTone('error');
                                        setFeedbackMessage(
                                            'Profile compact threshold must be an integer between 1 and 100.'
                                        );
                                        return;
                                    }

                                    void setProfileSettingsMutation.mutateAsync({
                                        profileId: selectedProfileId,
                                        overrideMode: 'percent',
                                        percent,
                                        preview: resolvedContextStateQueryInput,
                                    });
                                    return;
                                }

                                const fixedInputTokens = Number(profileFixedInputTokens);
                                if (!Number.isInteger(fixedInputTokens) || fixedInputTokens < 1) {
                                    setFeedbackTone('error');
                                    setFeedbackMessage('Fixed input tokens must be a positive integer.');
                                    return;
                                }

                                void setProfileSettingsMutation.mutateAsync({
                                    profileId: selectedProfileId,
                                    overrideMode: 'fixed_tokens',
                                    fixedInputTokens,
                                    preview: resolvedContextStateQueryInput,
                                });
                            }}>
                            Save profile override
                        </button>
                    </section>

                    <section className='border-border bg-card/40 space-y-3 rounded-lg border p-4'>
                        <div>
                            <h4 className='text-sm font-semibold'>Effective Budget Preview</h4>
                            <p className='text-muted-foreground text-xs'>
                                Preview uses the selected profile&apos;s current default provider/model.
                            </p>
                        </div>

                        {defaultProvider && defaultModel ? (
                            <div className='grid gap-2 text-sm md:grid-cols-2'>
                                <div>
                                    <p className='text-muted-foreground text-xs uppercase'>Default target</p>
                                    <p>
                                        {defaultProvider.label} · {defaultModel.label}
                                    </p>
                                </div>
                                {resolvedContextStateQuery.data?.policy.limits.contextLength ? (
                                    <div>
                                        <p className='text-muted-foreground text-xs uppercase'>Context length</p>
                                        <p>{formatTokenCount(resolvedContextStateQuery.data.policy.limits.contextLength)}</p>
                                    </div>
                                ) : null}
                                {resolvedContextStateQuery.data?.policy.safetyBufferTokens ? (
                                    <div>
                                        <p className='text-muted-foreground text-xs uppercase'>Safety buffer</p>
                                        <p>{formatTokenCount(resolvedContextStateQuery.data.policy.safetyBufferTokens)}</p>
                                    </div>
                                ) : null}
                                {resolvedContextStateQuery.data?.policy.usableInputBudgetTokens ? (
                                    <div>
                                        <p className='text-muted-foreground text-xs uppercase'>Usable input budget</p>
                                        <p>
                                            {formatTokenCount(
                                                resolvedContextStateQuery.data.policy.usableInputBudgetTokens
                                            )}
                                        </p>
                                    </div>
                                ) : null}
                                {resolvedContextStateQuery.data?.policy.thresholdTokens ? (
                                    <div>
                                        <p className='text-muted-foreground text-xs uppercase'>Compaction threshold</p>
                                        <p>{formatTokenCount(resolvedContextStateQuery.data.policy.thresholdTokens)}</p>
                                    </div>
                                ) : null}
                                {resolvedContextStateQuery.data?.policy.limits.maxOutputTokens ? (
                                    <div>
                                        <p className='text-muted-foreground text-xs uppercase'>Max output tokens</p>
                                        <p>
                                            {formatTokenCount(
                                                resolvedContextStateQuery.data.policy.limits.maxOutputTokens
                                            )}
                                        </p>
                                    </div>
                                ) : null}
                                <div>
                                    <p className='text-muted-foreground text-xs uppercase'>Limit source</p>
                                    <p>{resolvedContextStateQuery.data?.policy.limits.source ?? 'unknown'}</p>
                                </div>
                                <div>
                                    <p className='text-muted-foreground text-xs uppercase'>Counting mode</p>
                                    <p>{resolvedContextStateQuery.data?.countingMode === 'exact' ? 'Exact' : 'Estimated'}</p>
                                </div>
                                {resolvedContextStateQuery.data?.policy.limits.overrideReason ? (
                                    <div className='md:col-span-2'>
                                        <p className='text-muted-foreground text-xs uppercase'>Override reason</p>
                                        <p>{resolvedContextStateQuery.data.policy.limits.overrideReason}</p>
                                    </div>
                                ) : null}
                                {resolvedContextStateQuery.data?.policy.limits.updatedAt ? (
                                    <div>
                                        <p className='text-muted-foreground text-xs uppercase'>Limit metadata updated</p>
                                        <p>{new Date(resolvedContextStateQuery.data.policy.limits.updatedAt).toLocaleString()}</p>
                                    </div>
                                ) : null}
                                {resolvedContextStateQuery.data?.policy.mode ? (
                                    <div>
                                        <p className='text-muted-foreground text-xs uppercase'>Active mode</p>
                                        <p>{resolvedContextStateQuery.data.policy.mode}</p>
                                    </div>
                                ) : null}
                                {resolvedContextStateQuery.data?.policy.percent ? (
                                    <div>
                                        <p className='text-muted-foreground text-xs uppercase'>Threshold percent</p>
                                        <p>{resolvedContextStateQuery.data.policy.percent}%</p>
                                    </div>
                                ) : null}
                                {resolvedContextStateQuery.data?.policy.fixedInputTokens ? (
                                    <div>
                                        <p className='text-muted-foreground text-xs uppercase'>Fixed input tokens</p>
                                        <p>{formatTokenCount(resolvedContextStateQuery.data.policy.fixedInputTokens)}</p>
                                    </div>
                                ) : null}
                            </div>
                        ) : (
                            <p className='text-muted-foreground text-sm'>
                                No default provider/model is configured for the selected profile yet.
                            </p>
                        )}

                        {resolvedContextStateQuery.data?.policy.disabledReason === 'missing_model_limits' ? (
                            <p className='text-muted-foreground text-xs'>
                                This model does not currently expose a known context window, so token-aware compaction
                                stays disabled.
                            </p>
                        ) : null}
                    </section>

                </div>
            </div>
        </section>
    );
}
