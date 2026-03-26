
import type { ProviderModelRecord, ProviderRecord } from '@/app/backend/persistence/types';
import type { AppRouter } from '@/app/backend/trpc/router';

import type { inferRouterOutputs } from '@trpc/server';

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ResolvedContextState = RouterOutputs['context']['getResolvedState'];

function formatTokenCount(value: number): string {
    return new Intl.NumberFormat('en-US').format(value);
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
        </section>
    );
}
