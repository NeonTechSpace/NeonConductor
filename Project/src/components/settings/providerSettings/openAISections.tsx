import {
    formatInteger,
    formatPercent,
    formatResetCountdown,
    formatWindowLabel,
} from '@/web/components/settings/providerSettings/helpers';

import type {
    OpenAISubscriptionRateLimitsSummary,
    OpenAISubscriptionUsageSummary,
} from '@/app/backend/persistence/types';

interface OpenAIAccountLimitsSectionProps {
    isLoading: boolean;
    rateLimits: OpenAISubscriptionRateLimitsSummary | undefined;
}

interface OpenAILocalUsageSectionProps {
    isLoading: boolean;
    usage: OpenAISubscriptionUsageSummary | undefined;
}

export function OpenAIAccountLimitsSection({ isLoading, rateLimits }: OpenAIAccountLimitsSectionProps) {
    return (
        <section className='space-y-2'>
            <p className='text-sm font-semibold'>OpenAI Subscription Limits (Account)</p>
            <p className='text-muted-foreground text-xs'>
                Pulled from OpenAI Codex ChatGPT usage windows when OAuth is active. This reflects account-level
                limits, not only this app.
            </p>
            {isLoading ? <p className='text-muted-foreground text-xs'>Loading subscription limits...</p> : null}
            {rateLimits?.source === 'chatgpt_wham' ? (
                <div className='space-y-2'>
                    <p className='text-muted-foreground text-xs'>Plan: {rateLimits.planType ?? 'unknown'}</p>
                    <div className='grid gap-2 md:grid-cols-2'>
                        <div className='border-border bg-background rounded-md border p-3'>
                            <p className='text-xs font-semibold'>
                                {formatWindowLabel(rateLimits.primary?.windowMinutes)}
                            </p>
                            <p className='text-muted-foreground mt-1 text-xs'>
                                Used: {formatPercent(rateLimits.primary?.usedPercent)}
                            </p>
                            <div className='bg-border mt-1 h-1.5 w-full overflow-hidden rounded'>
                                <div
                                    className='bg-primary h-full'
                                    style={{
                                        width: `${String(Math.max(0, Math.min(100, rateLimits.primary?.usedPercent ?? 0)))}%`,
                                    }}
                                />
                            </div>
                            <p className='text-muted-foreground mt-1 text-xs'>
                                Resets: {formatResetCountdown(rateLimits.primary?.resetsAt)}
                            </p>
                        </div>
                        <div className='border-border bg-background rounded-md border p-3'>
                            <p className='text-xs font-semibold'>
                                {formatWindowLabel(rateLimits.secondary?.windowMinutes)}
                            </p>
                            <p className='text-muted-foreground mt-1 text-xs'>
                                Used: {formatPercent(rateLimits.secondary?.usedPercent)}
                            </p>
                            <div className='bg-border mt-1 h-1.5 w-full overflow-hidden rounded'>
                                <div
                                    className='bg-primary h-full'
                                    style={{
                                        width: `${String(Math.max(0, Math.min(100, rateLimits.secondary?.usedPercent ?? 0)))}%`,
                                    }}
                                />
                            </div>
                            <p className='text-muted-foreground mt-1 text-xs'>
                                Resets: {formatResetCountdown(rateLimits.secondary?.resetsAt)}
                            </p>
                        </div>
                    </div>
                </div>
            ) : null}
            {rateLimits?.source === 'unavailable' ? (
                <p className='text-muted-foreground text-xs'>
                    {rateLimits.detail ??
                        'Subscription limits unavailable. Sign in with OpenAI OAuth for account-level windows.'}
                </p>
            ) : null}
        </section>
    );
}

export function OpenAILocalUsageSection({ isLoading, usage }: OpenAILocalUsageSectionProps) {
    return (
        <section className='space-y-2'>
            <p className='text-sm font-semibold'>OpenAI Subscription Usage (Local)</p>
            <p className='text-muted-foreground text-xs'>
                Rolling windows from local `openai_subscription` run telemetry captured by this app only.
            </p>
            {isLoading ? <p className='text-muted-foreground text-xs'>Loading subscription usage...</p> : null}
            {usage ? (
                <div className='grid gap-2 md:grid-cols-2'>
                    <div className='border-border bg-background rounded-md border p-3'>
                        <p className='text-xs font-semibold'>Last 5 Hours</p>
                        <p className='text-muted-foreground mt-1 text-xs'>
                            Runs: {formatInteger(usage.fiveHour.runCount)}
                        </p>
                        <p className='text-muted-foreground text-xs'>
                            Total tokens: {formatInteger(usage.fiveHour.totalTokens)}
                        </p>
                        <p className='text-muted-foreground text-xs'>
                            Input/Output: {formatInteger(usage.fiveHour.inputTokens)} /{' '}
                            {formatInteger(usage.fiveHour.outputTokens)}
                        </p>
                        <p className='text-muted-foreground text-xs'>
                            Cached/Reasoning: {formatInteger(usage.fiveHour.cachedTokens)} /{' '}
                            {formatInteger(usage.fiveHour.reasoningTokens)}
                        </p>
                        <p className='text-muted-foreground text-xs'>
                            Avg latency: {formatInteger(usage.fiveHour.averageLatencyMs)} ms
                        </p>
                    </div>
                    <div className='border-border bg-background rounded-md border p-3'>
                        <p className='text-xs font-semibold'>Last 7 Days</p>
                        <p className='text-muted-foreground mt-1 text-xs'>
                            Runs: {formatInteger(usage.weekly.runCount)}
                        </p>
                        <p className='text-muted-foreground text-xs'>
                            Total tokens: {formatInteger(usage.weekly.totalTokens)}
                        </p>
                        <p className='text-muted-foreground text-xs'>
                            Input/Output: {formatInteger(usage.weekly.inputTokens)} /{' '}
                            {formatInteger(usage.weekly.outputTokens)}
                        </p>
                        <p className='text-muted-foreground text-xs'>
                            Cached/Reasoning: {formatInteger(usage.weekly.cachedTokens)} /{' '}
                            {formatInteger(usage.weekly.reasoningTokens)}
                        </p>
                        <p className='text-muted-foreground text-xs'>
                            Avg latency: {formatInteger(usage.weekly.averageLatencyMs)} ms
                        </p>
                    </div>
                </div>
            ) : null}
        </section>
    );
}
