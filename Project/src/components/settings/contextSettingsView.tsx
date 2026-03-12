import { useState } from 'react';

import { setResolvedContextStateCache } from '@/web/components/context/contextStateCache';
import { isProviderId } from '@/web/components/conversation/shell/workspace/helpers';
import { ComposerMediaSettingsSection } from '@/web/components/settings/composerMediaSettingsSection';
import {
    resolveComposerMediaSettingsDraft,
    type ComposerMediaSettingsDraft,
} from '@/web/components/settings/composerMediaSettingsDrafts';
import {
    resolveContextGlobalDraft,
    resolveContextProfileDraft,
    type ContextGlobalDraft,
    type ContextProfileDraft,
} from '@/web/components/settings/contextSettingsDrafts';
import { resolveSelectedProfileId } from '@/web/components/settings/profileSettings/selection';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';
import { SettingsSelectionRail } from '@/web/components/settings/shared/settingsSelectionRail';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { RuntimeProviderId } from '@/shared/contracts';
import {
    MAX_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY,
    MAX_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
} from '@/shared/contracts';

function formatTokenCount(value: number): string {
    return new Intl.NumberFormat('en-US').format(value);
}

interface ContextSettingsViewProps {
    activeProfileId: string;
}

export function ContextSettingsView({ activeProfileId }: ContextSettingsViewProps) {
    const utils = trpc.useUtils();
    const [selectedProfileId, setSelectedProfileId] = useState(activeProfileId);
    const [globalDraft, setGlobalDraft] = useState<ContextGlobalDraft | undefined>(undefined);
    const [profileDraft, setProfileDraft] = useState<ContextProfileDraft | undefined>(undefined);
    const [composerMediaDraft, setComposerMediaDraft] = useState<ComposerMediaSettingsDraft | undefined>(undefined);
    const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>(undefined);
    const [feedbackTone, setFeedbackTone] = useState<'success' | 'error' | 'info'>('info');

    const profilesQuery = trpc.profile.list.useQuery(undefined, PROGRESSIVE_QUERY_OPTIONS);
    const profiles = profilesQuery.data?.profiles ?? [];
    const resolvedSelectedProfileId = resolveSelectedProfileId(profiles, selectedProfileId, activeProfileId) ?? activeProfileId;
    const globalSettingsQuery = trpc.context.getGlobalSettings.useQuery(undefined, PROGRESSIVE_QUERY_OPTIONS);
    const profileSettingsQuery = trpc.context.getProfileSettings.useQuery(
        { profileId: resolvedSelectedProfileId },
        { enabled: resolvedSelectedProfileId.length > 0, ...PROGRESSIVE_QUERY_OPTIONS }
    );
    const composerMediaSettingsQuery = trpc.composer.getSettings.useQuery(undefined, PROGRESSIVE_QUERY_OPTIONS);
    const shellBootstrapQuery = trpc.runtime.getShellBootstrap.useQuery(
        { profileId: resolvedSelectedProfileId },
        { enabled: resolvedSelectedProfileId.length > 0, ...PROGRESSIVE_QUERY_OPTIONS }
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
            profileId: resolvedSelectedProfileId,
            providerId: effectiveProviderId,
            modelId: effectiveModelId,
        },
        {
            enabled: resolvedSelectedProfileId.length > 0 && Boolean(defaultProviderId) && Boolean(defaultModelId),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const resolvedContextStateQueryInput = {
        profileId: resolvedSelectedProfileId,
        providerId: effectiveProviderId,
        modelId: effectiveModelId,
    };
    const globalForm = resolveContextGlobalDraft({
        settings: globalSettingsQuery.data?.settings,
        draft: globalDraft,
    });
    const profileForm = resolveContextProfileDraft({
        profileId: resolvedSelectedProfileId,
        inheritedPercent: globalForm.percent,
        settings: profileSettingsQuery.data?.settings,
        draft: profileDraft,
    });
    const composerMediaForm = resolveComposerMediaSettingsDraft({
        settings: composerMediaSettingsQuery.data?.settings,
        draft: composerMediaDraft,
    });

    function updateGlobalDraft(
        updater: (current: ContextGlobalDraft) => ContextGlobalDraft
    ): void {
        setGlobalDraft((current) => updater(current ?? globalForm));
    }

    function updateProfileDraft(
        updater: (current: ContextProfileDraft) => ContextProfileDraft
    ): void {
        setProfileDraft((current) =>
            updater(
                current?.profileId === resolvedSelectedProfileId
                    ? current
                    : profileForm
            )
        );
    }

    function updateComposerMediaDraft(
        updater: (current: ComposerMediaSettingsDraft) => ComposerMediaSettingsDraft
    ): void {
        setComposerMediaDraft((current) => updater(current ?? composerMediaForm));
    }

    const setGlobalSettingsMutation = trpc.context.setGlobalSettings.useMutation({
        onSuccess: ({ settings, resolvedState }) => {
            setFeedbackTone('success');
            setFeedbackMessage('Saved global context defaults.');
            setGlobalDraft(undefined);
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
            setProfileDraft(undefined);
            utils.context.getProfileSettings.setData(
                {
                    profileId: resolvedSelectedProfileId,
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
    const setComposerMediaSettingsMutation = trpc.composer.setSettings.useMutation({
        onSuccess: ({ settings }) => {
            setFeedbackTone('success');
            setFeedbackMessage('Saved composer media defaults.');
            setComposerMediaDraft(undefined);
            utils.composer.getSettings.setData(undefined, {
                settings,
            });
        },
        onError: (error) => {
            setFeedbackTone('error');
            setFeedbackMessage(error.message);
        },
    });

    return (
        <section className='grid h-full min-h-0 min-w-0 overflow-hidden grid-cols-[260px_1fr]'>
            <SettingsSelectionRail
                title='Profiles'
                ariaLabel='Context settings profiles'
                selectedId={resolvedSelectedProfileId}
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

            <div className='min-h-0 min-w-0 overflow-y-auto p-4'>
                <div className='space-y-6'>
                    <SettingsFeedbackBanner message={feedbackMessage} tone={feedbackTone} />
                    <ComposerMediaSettingsSection
                        draft={composerMediaForm}
                        isSaving={setComposerMediaSettingsMutation.isPending}
                        onDraftChange={(updater) => {
                            updateComposerMediaDraft(updater);
                            setFeedbackMessage(undefined);
                        }}
                        onSave={() => {
                            const maxImageAttachmentsPerMessage = Number(composerMediaForm.maxImageAttachmentsPerMessage);
                            if (
                                !Number.isInteger(maxImageAttachmentsPerMessage) ||
                                maxImageAttachmentsPerMessage < 1 ||
                                maxImageAttachmentsPerMessage > MAX_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE
                            ) {
                                setFeedbackTone('error');
                                setFeedbackMessage(
                                    `Image limit must be an integer between 1 and ${String(MAX_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE)}.`
                                );
                                return;
                            }

                            const imageCompressionConcurrency = Number(composerMediaForm.imageCompressionConcurrency);
                            if (
                                !Number.isInteger(imageCompressionConcurrency) ||
                                imageCompressionConcurrency < 1 ||
                                imageCompressionConcurrency > MAX_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY
                            ) {
                                setFeedbackTone('error');
                                setFeedbackMessage(
                                    `Compression concurrency must be an integer between 1 and ${String(MAX_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY)}.`
                                );
                                return;
                            }

                            void setComposerMediaSettingsMutation.mutateAsync({
                                maxImageAttachmentsPerMessage,
                                imageCompressionConcurrency,
                            });
                        }}
                    />
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
                                checked={globalForm.enabled}
                                onChange={(event) => {
                                    updateGlobalDraft((current) => ({
                                        ...current,
                                        enabled: event.target.checked,
                                    }));
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
                                value={globalForm.percent}
                                onChange={(event) => {
                                    updateGlobalDraft((current) => ({
                                        ...current,
                                        percent: event.target.value,
                                    }));
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
                                const percent = Number(globalForm.percent);
                                if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
                                    setFeedbackTone('error');
                                    setFeedbackMessage('Global compact threshold must be an integer between 1 and 100.');
                                    return;
                                }

                                void setGlobalSettingsMutation.mutateAsync({
                                    enabled: globalForm.enabled,
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
                                value={profileForm.overrideMode}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    if (value !== 'inherit' && value !== 'percent' && value !== 'fixed_tokens') {
                                        return;
                                    }
                                    updateProfileDraft((current) => ({
                                        ...current,
                                        overrideMode: value,
                                    }));
                                    setFeedbackMessage(undefined);
                                }}
                                className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm'>
                                <option value='inherit'>Inherit global default</option>
                                <option value='percent'>Use a profile-specific percentage</option>
                                <option value='fixed_tokens'>Use a fixed input token budget</option>
                            </select>
                        </div>

                        {profileForm.overrideMode === 'percent' ? (
                            <div className='max-w-sm space-y-1'>
                                <label className='text-sm font-medium'>Profile threshold (%)</label>
                                <input
                                    aria-label='Profile-specific threshold percent'
                                    type='number'
                                    min={1}
                                    max={100}
                                    value={profileForm.percent}
                                    onChange={(event) => {
                                        updateProfileDraft((current) => ({
                                            ...current,
                                            percent: event.target.value,
                                        }));
                                        setFeedbackMessage(undefined);
                                    }}
                                    className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm'
                                />
                            </div>
                        ) : null}

                        {profileForm.overrideMode === 'fixed_tokens' ? (
                            <div className='max-w-sm space-y-1'>
                                <label className='text-sm font-medium'>Fixed input tokens</label>
                                <input
                                    aria-label='Fixed input token budget'
                                    type='number'
                                    min={1}
                                    value={profileForm.fixedInputTokens}
                                    onChange={(event) => {
                                        updateProfileDraft((current) => ({
                                            ...current,
                                            fixedInputTokens: event.target.value,
                                        }));
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
                                if (profileForm.overrideMode === 'inherit') {
                                    void setProfileSettingsMutation.mutateAsync({
                                        profileId: resolvedSelectedProfileId,
                                        overrideMode: 'inherit',
                                        preview: resolvedContextStateQueryInput,
                                    });
                                    return;
                                }

                                if (profileForm.overrideMode === 'percent') {
                                    const percent = Number(profileForm.percent);
                                    if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
                                        setFeedbackTone('error');
                                        setFeedbackMessage(
                                            'Profile compact threshold must be an integer between 1 and 100.'
                                        );
                                        return;
                                    }

                                    void setProfileSettingsMutation.mutateAsync({
                                        profileId: resolvedSelectedProfileId,
                                        overrideMode: 'percent',
                                        percent,
                                        preview: resolvedContextStateQueryInput,
                                    });
                                    return;
                                }

                                const fixedInputTokens = Number(profileForm.fixedInputTokens);
                                if (!Number.isInteger(fixedInputTokens) || fixedInputTokens < 1) {
                                    setFeedbackTone('error');
                                    setFeedbackMessage('Fixed input tokens must be a positive integer.');
                                    return;
                                }

                                void setProfileSettingsMutation.mutateAsync({
                                    profileId: resolvedSelectedProfileId,
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

