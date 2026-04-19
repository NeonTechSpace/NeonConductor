
import type { ProviderModelRecord, ProviderRecord } from '@/app/backend/persistence/types';
import type { AppRouter } from '@/app/backend/trpc/router';

import type { inferRouterOutputs } from '@trpc/server';

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ResolvedContextState = RouterOutputs['context']['getResolvedState'];

function formatTokenCount(value: number): string {
    return new Intl.NumberFormat('en-US').format(value);
}

function formatDelimitedLabel(value: string): string {
    return value
        .split(/[_-]+/g)
        .filter((part) => part.length > 0)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function formatPreparedContextSource(
    source: ResolvedContextState['preparedContext']['contributors'][number]['source']
): string {
    return source.label ?? `${formatDelimitedLabel(source.kind)} · ${source.key}`;
}

interface ContextResolvedSummarySectionProps {
    defaultModel: ProviderModelRecord | undefined;
    defaultProvider: ProviderRecord | undefined;
    state: ResolvedContextState | undefined;
}

export function ContextResolvedSummarySection({
    defaultModel,
    defaultProvider,
    state,
}: ContextResolvedSummarySectionProps) {
    return (
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
                    {state?.policy.limits.contextLength ? (
                        <div>
                            <p className='text-muted-foreground text-xs uppercase'>Context length</p>
                            <p>{formatTokenCount(state.policy.limits.contextLength)}</p>
                        </div>
                    ) : null}
                    {state?.policy.safetyBufferTokens ? (
                        <div>
                            <p className='text-muted-foreground text-xs uppercase'>Safety buffer</p>
                            <p>{formatTokenCount(state.policy.safetyBufferTokens)}</p>
                        </div>
                    ) : null}
                    {state?.policy.usableInputBudgetTokens ? (
                        <div>
                            <p className='text-muted-foreground text-xs uppercase'>Usable input budget</p>
                            <p>{formatTokenCount(state.policy.usableInputBudgetTokens)}</p>
                        </div>
                    ) : null}
                    {state?.policy.thresholdTokens ? (
                        <div>
                            <p className='text-muted-foreground text-xs uppercase'>Compaction threshold</p>
                            <p>{formatTokenCount(state.policy.thresholdTokens)}</p>
                        </div>
                    ) : null}
                    {state?.policy.limits.maxOutputTokens ? (
                        <div>
                            <p className='text-muted-foreground text-xs uppercase'>Max output tokens</p>
                            <p>{formatTokenCount(state.policy.limits.maxOutputTokens)}</p>
                        </div>
                    ) : null}
                    <div>
                        <p className='text-muted-foreground text-xs uppercase'>Limit source</p>
                        <p>{state?.policy.limits.source ?? 'unknown'}</p>
                    </div>
                    <div>
                        <p className='text-muted-foreground text-xs uppercase'>Counting mode</p>
                        <p>{state?.countingMode === 'exact' ? 'Exact' : 'Estimated'}</p>
                    </div>
                    {state?.policy.limits.overrideReason ? (
                        <div className='md:col-span-2'>
                            <p className='text-muted-foreground text-xs uppercase'>Override reason</p>
                            <p>{state.policy.limits.overrideReason}</p>
                        </div>
                    ) : null}
                    {state?.policy.limits.updatedAt ? (
                        <div>
                            <p className='text-muted-foreground text-xs uppercase'>Limit metadata updated</p>
                            <p>{new Date(state.policy.limits.updatedAt).toLocaleString()}</p>
                        </div>
                    ) : null}
                    {state?.policy.mode ? (
                        <div>
                            <p className='text-muted-foreground text-xs uppercase'>Active mode</p>
                            <p>{state.policy.mode}</p>
                        </div>
                    ) : null}
                    {state?.policy.percent ? (
                        <div>
                            <p className='text-muted-foreground text-xs uppercase'>Threshold percent</p>
                            <p>{state.policy.percent}%</p>
                        </div>
                    ) : null}
                    {state?.policy.fixedInputTokens ? (
                        <div>
                            <p className='text-muted-foreground text-xs uppercase'>Fixed input tokens</p>
                            <p>{formatTokenCount(state.policy.fixedInputTokens)}</p>
                        </div>
                    ) : null}
                </div>
            ) : (
                <p className='text-muted-foreground text-sm'>
                    No default provider/model is configured for the selected profile yet.
                </p>
            )}

            {state?.policy.disabledReason === 'missing_model_limits' ? (
                <p className='text-muted-foreground text-xs'>
                    This model does not currently expose a known context window, so token-aware compaction stays
                    disabled.
                </p>
            ) : null}

            <div className='border-border/70 space-y-3 rounded-xl border border-dashed p-3'>
                <div>
                    <h5 className='text-sm font-semibold'>Prepared Context Preview</h5>
                    <p className='text-muted-foreground text-xs'>
                        Backend-owned contributor ledger for the currently resolved preview target.
                    </p>
                </div>

                {state ? (
                    <div className='space-y-3 text-sm'>
                        <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-4'>
                            <div>
                                <p className='text-muted-foreground text-xs uppercase'>Active contributors</p>
                                <p>{state.preparedContext.activeContributorCount}</p>
                            </div>
                            <div>
                                <p className='text-muted-foreground text-xs uppercase'>Contributor digest</p>
                                <p className='break-all font-mono text-xs'>{state.preparedContext.digest.contributorDigest}</p>
                            </div>
                            <div>
                                <p className='text-muted-foreground text-xs uppercase'>Full digest</p>
                                <p className='break-all font-mono text-xs'>{state.preparedContext.digest.fullDigest}</p>
                            </div>
                            <div>
                                <p className='text-muted-foreground text-xs uppercase'>Compaction reseed</p>
                                <p>{state.preparedContext.compactionReseedActive ? 'Active' : 'Inactive'}</p>
                            </div>
                        </div>

                        <div className='rounded-xl border border-dashed p-3'>
                            <p className='text-muted-foreground text-xs uppercase'>Digest hint</p>
                            <p className='mt-1 text-sm leading-6'>{state.preparedContext.digest.cacheabilityHint}</p>
                        </div>

                        <div className='grid gap-3 xl:grid-cols-2'>
                            {Object.values(state.preparedContext.digest.checkpoints).map((checkpoint) => (
                                <div key={checkpoint.checkpoint} className='rounded-xl border border-dashed p-3'>
                                    <p className='text-sm font-semibold'>
                                        {formatDelimitedLabel(checkpoint.checkpoint)}
                                    </p>
                                    <div className='mt-2 grid gap-2 text-sm sm:grid-cols-2'>
                                        <div>
                                            <p className='text-muted-foreground text-xs uppercase'>Included</p>
                                            <p>{checkpoint.includedContributorCount}</p>
                                        </div>
                                        <div>
                                            <p className='text-muted-foreground text-xs uppercase'>Excluded</p>
                                            <p>{checkpoint.excludedContributorCount}</p>
                                        </div>
                                        <div>
                                            <p className='text-muted-foreground text-xs uppercase'>Active</p>
                                            <p>{checkpoint.active ? 'Yes' : 'No'}</p>
                                        </div>
                                        {checkpoint.estimatedTokenCount !== undefined ? (
                                            <div>
                                                <p className='text-muted-foreground text-xs uppercase'>Estimated tokens</p>
                                                <p>{formatTokenCount(checkpoint.estimatedTokenCount)}</p>
                                            </div>
                                        ) : null}
                                    </div>
                                    <p className='text-muted-foreground mt-2 break-all font-mono text-[11px]'>
                                        {checkpoint.digest}
                                    </p>
                                </div>
                            ))}
                        </div>

                        <div className='space-y-2'>
                            <p className='text-muted-foreground text-xs uppercase'>Contributors</p>
                            {state.preparedContext.contributors.length > 0 ? (
                                <div className='grid gap-3'>
                                    {state.preparedContext.contributors.map((contributor) => (
                                        <article key={contributor.id} className='rounded-xl border border-dashed p-3'>
                                            <div className='flex flex-wrap items-start justify-between gap-3'>
                                                <div className='space-y-1'>
                                                    <p className='text-sm font-semibold'>{contributor.label}</p>
                                                    <p className='text-muted-foreground text-xs leading-5'>
                                                        {formatPreparedContextSource(contributor.source)}
                                                    </p>
                                                </div>
                                                <div className='flex flex-wrap gap-2 text-[11px] font-medium'>
                                                    <span className='rounded-full border px-2 py-1'>
                                                        {formatDelimitedLabel(contributor.injectionCheckpoint)}
                                                    </span>
                                                    <span className='rounded-full border px-2 py-1'>
                                                        {formatDelimitedLabel(contributor.inclusionState)}
                                                    </span>
                                                    <span className='rounded-full border px-2 py-1'>
                                                        {formatDelimitedLabel(contributor.kind)}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className='text-muted-foreground mt-2 grid gap-2 text-xs md:grid-cols-2 xl:grid-cols-4'>
                                                <p>Group: {formatDelimitedLabel(contributor.group)}</p>
                                                <p>Order: {contributor.resolvedOrder}</p>
                                                <p>Count mode: {formatDelimitedLabel(contributor.countMode)}</p>
                                                <p>
                                                    Tokens:{' '}
                                                    {contributor.tokenCount !== undefined
                                                        ? formatTokenCount(contributor.tokenCount)
                                                        : 'n/a'}
                                                </p>
                                            </div>
                                            <p className='mt-2 text-sm leading-6'>{contributor.inclusionReason}</p>
                                            <p className='text-muted-foreground mt-2 break-all font-mono text-[11px]'>
                                                {contributor.digest}
                                            </p>
                                        </article>
                                    ))}
                                </div>
                            ) : (
                                <p className='text-muted-foreground text-sm'>
                                    No prepared-context contributors are resolved for this preview yet.
                                </p>
                            )}
                        </div>
                    </div>
                ) : (
                    <p className='text-muted-foreground text-sm'>
                        No prepared-context preview is available until a default provider/model is configured.
                    </p>
                )}
            </div>
        </section>
    );
}
