import {
    formatDateTime,
    formatInteger,
    formatPercent,
    methodLabel,
} from '@/web/components/settings/providerSettings/helpers';
import type { ProviderAuthStateView, ProviderListItem } from '@/web/components/settings/providerSettings/types';
import { SensitiveValue } from '@/web/components/ui/sensitiveValue';

import type {
    OpenAISubscriptionRateLimitsSummary,
    OpenAISubscriptionUsageSummary,
    ProviderUsageSummary,
} from '@/app/backend/persistence/types';

import type { KiloAccountContext } from '@/shared/contracts';

import type { ReactNode } from 'react';

interface ProviderStatusSectionProps {
    provider: ProviderListItem;
    authState: ProviderAuthStateView | undefined;
    accountContext: KiloAccountContext | undefined;
    usageSummary: ProviderUsageSummary | undefined;
    openAISubscriptionUsage: OpenAISubscriptionUsageSummary | undefined;
    openAISubscriptionRateLimits: OpenAISubscriptionRateLimitsSummary | undefined;
    isLoadingAccountContext: boolean;
    isLoadingUsageSummary: boolean;
    isLoadingOpenAIUsage: boolean;
    isLoadingOpenAIRateLimits: boolean;
}

function formatBalance(balance: KiloAccountContext['balance']): string {
    if (!balance) {
        return '-';
    }

    return `${balance.amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })} ${balance.currency}`;
}

function formatMicrounits(value: number | undefined): string {
    if (value === undefined || !Number.isFinite(value)) {
        return '-';
    }

    return `${Math.round(value).toLocaleString()} microunits`;
}

function readActiveOrganization(accountContext: KiloAccountContext | undefined) {
    return accountContext?.organizations.find((organization) => organization.isActive);
}

function StatusCard({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className='border-border bg-background min-w-0 rounded-[22px] border p-4'>
            <p className='text-xs font-semibold tracking-[0.12em] uppercase'>{title}</p>
            <div className='mt-3'>{children}</div>
        </section>
    );
}

export function ProviderStatusSection({
    provider,
    authState,
    accountContext,
    usageSummary,
    openAISubscriptionUsage,
    openAISubscriptionRateLimits,
    isLoadingAccountContext,
    isLoadingUsageSummary,
    isLoadingOpenAIUsage,
    isLoadingOpenAIRateLimits,
}: ProviderStatusSectionProps) {
    const activeOrganization = readActiveOrganization(accountContext);
    const effectiveAuthState = authState?.authState ?? provider.authState;
    const effectiveAuthMethod = authState?.authMethod ?? provider.authMethod;

    return (
        <section className='border-border/70 bg-card/40 space-y-4 rounded-[24px] border p-5'>
            <div>
                <p className='text-sm font-semibold'>Provider Status</p>
                <p className='text-muted-foreground text-xs'>
                    Runtime readiness, account identity, and local telemetry for the selected provider.
                </p>
            </div>

            <div className='grid gap-3 lg:grid-cols-2'>
                <StatusCard title='Connection'>
                    <dl className='space-y-2 text-sm'>
                        <div className='grid grid-cols-[8rem_1fr] gap-2'>
                            <dt className='text-muted-foreground'>Auth state</dt>
                            <dd className='min-w-0 break-words font-medium'>{effectiveAuthState}</dd>
                        </div>
                        <div className='grid grid-cols-[8rem_1fr] gap-2'>
                            <dt className='text-muted-foreground'>Method</dt>
                            <dd className='min-w-0 break-words'>{methodLabel(effectiveAuthMethod)}</dd>
                        </div>
                        <div className='grid grid-cols-[8rem_1fr] gap-2'>
                            <dt className='text-muted-foreground'>Endpoint</dt>
                            <dd className='min-w-0 break-words'>{provider.endpointProfile.label}</dd>
                        </div>
                        <div className='grid grid-cols-[8rem_1fr] gap-2'>
                            <dt className='text-muted-foreground'>Token expiry</dt>
                            <dd className='min-w-0 break-words'>{formatDateTime(authState?.tokenExpiresAt)}</dd>
                        </div>
                    </dl>
                </StatusCard>

                <StatusCard title='Identity'>
                    {provider.id === 'kilo' ? (
                        isLoadingAccountContext ? (
                            <p className='text-muted-foreground text-xs'>Loading Kilo account context...</p>
                        ) : (
                            <dl className='space-y-2 text-sm'>
                                <div className='grid grid-cols-[8rem_1fr] gap-2'>
                                    <dt className='text-muted-foreground'>Display name</dt>
                                    <dd className='min-w-0 break-words'>
                                        <SensitiveValue value={accountContext?.displayName} category='person' />
                                    </dd>
                                </div>
                                <div className='grid grid-cols-[8rem_1fr] gap-2'>
                                    <dt className='text-muted-foreground'>Email</dt>
                                    <dd className='min-w-0 break-words'>
                                        <SensitiveValue value={accountContext?.emailMasked} category='email' />
                                    </dd>
                                </div>
                                <div className='grid grid-cols-[8rem_1fr] gap-2'>
                                    <dt className='text-muted-foreground'>Account ID</dt>
                                    <dd className='min-w-0 break-words'>
                                        <SensitiveValue value={accountContext?.accountId} category='account_id' />
                                    </dd>
                                </div>
                                <div className='grid grid-cols-[8rem_1fr] gap-2'>
                                    <dt className='text-muted-foreground'>Last sync</dt>
                                    <dd className='min-w-0 break-words'>{formatDateTime(accountContext?.updatedAt)}</dd>
                                </div>
                            </dl>
                        )
                    ) : (
                        <dl className='space-y-2 text-sm'>
                            <div className='grid grid-cols-[8rem_1fr] gap-2'>
                                <dt className='text-muted-foreground'>Account ID</dt>
                                <dd className='min-w-0 break-words'>
                                    <SensitiveValue value={authState?.accountId} category='account_id' />
                                </dd>
                            </div>
                            <div className='grid grid-cols-[8rem_1fr] gap-2'>
                                <dt className='text-muted-foreground'>Auth guidance</dt>
                                <dd className='text-muted-foreground min-w-0 break-words text-xs leading-5'>
                                    {effectiveAuthState === 'authenticated'
                                        ? 'OpenAI account context is ready.'
                                        : 'Use OAuth for account limits or an API key for direct Responses access.'}
                                </dd>
                            </div>
                        </dl>
                    )}
                </StatusCard>

                <StatusCard title='Workspace Telemetry'>
                    {isLoadingUsageSummary ? (
                        <p className='text-muted-foreground text-xs'>Loading local usage summary...</p>
                    ) : usageSummary ? (
                        <dl className='grid gap-2 text-sm sm:grid-cols-2'>
                            <div>
                                <dt className='text-muted-foreground text-xs'>Runs</dt>
                                <dd className='mt-1 font-medium'>{formatInteger(usageSummary.runCount)}</dd>
                            </div>
                            <div>
                                <dt className='text-muted-foreground text-xs'>Tokens</dt>
                                <dd className='mt-1 font-medium'>{formatInteger(usageSummary.totalTokens)}</dd>
                            </div>
                            <div className='sm:col-span-2'>
                                <dt className='text-muted-foreground text-xs'>Billed cost</dt>
                                <dd className='mt-1 font-medium'>{formatMicrounits(usageSummary.totalCostMicrounits)}</dd>
                            </div>
                        </dl>
                    ) : (
                        <p className='text-muted-foreground text-xs'>
                            No local usage has been recorded for this provider yet.
                        </p>
                    )}
                </StatusCard>

                <StatusCard title={provider.id === 'kilo' ? 'Provider Extras' : 'OpenAI Windows'}>
                    {provider.id === 'kilo' ? (
                        isLoadingAccountContext ? (
                            <p className='text-muted-foreground text-xs'>Loading organization and balance state...</p>
                        ) : (
                            <dl className='space-y-2 text-sm'>
                                <div className='grid grid-cols-[8rem_1fr] gap-2'>
                                    <dt className='text-muted-foreground'>Active org</dt>
                                    <dd className='min-w-0 break-words'>
                                        <SensitiveValue value={activeOrganization?.name} category='organization' />
                                    </dd>
                                </div>
                                <div className='grid grid-cols-[8rem_1fr] gap-2'>
                                    <dt className='text-muted-foreground'>Org count</dt>
                                    <dd className='min-w-0 break-words'>{formatInteger(accountContext?.organizations.length)}</dd>
                                </div>
                                <div className='grid grid-cols-[8rem_1fr] gap-2'>
                                    <dt className='text-muted-foreground'>Balance</dt>
                                    <dd className='min-w-0 break-words'>
                                        <SensitiveValue
                                            value={accountContext?.balance ? formatBalance(accountContext.balance) : undefined}
                                            category='balance'
                                        />
                                    </dd>
                                </div>
                                <div className='grid grid-cols-[8rem_1fr] gap-2'>
                                    <dt className='text-muted-foreground'>Balance updated</dt>
                                    <dd className='min-w-0 break-words'>{formatDateTime(accountContext?.balance?.updatedAt)}</dd>
                                </div>
                            </dl>
                        )
                    ) : (
                        <div className='space-y-3 text-sm'>
                            <div>
                                <p className='text-muted-foreground text-xs'>Account limits</p>
                                {isLoadingOpenAIRateLimits ? (
                                    <p className='text-muted-foreground mt-1 text-xs'>Loading OpenAI account limits...</p>
                                ) : openAISubscriptionRateLimits?.source === 'chatgpt_wham' ? (
                                    <dl className='mt-2 grid gap-2 sm:grid-cols-2'>
                                        <div>
                                            <dt className='text-muted-foreground text-xs'>Plan</dt>
                                            <dd className='mt-1 font-medium'>
                                                {openAISubscriptionRateLimits.planType ?? 'unknown'}
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className='text-muted-foreground text-xs'>Primary window</dt>
                                            <dd className='mt-1 font-medium'>
                                                {formatPercent(openAISubscriptionRateLimits.primary?.usedPercent)}
                                            </dd>
                                        </div>
                                        <div className='sm:col-span-2'>
                                            <dt className='text-muted-foreground text-xs'>Secondary window</dt>
                                            <dd className='mt-1 font-medium'>
                                                {formatPercent(openAISubscriptionRateLimits.secondary?.usedPercent)}
                                            </dd>
                                        </div>
                                    </dl>
                                ) : (
                                    <p className='text-muted-foreground mt-1 text-xs'>
                                        {openAISubscriptionRateLimits?.detail ??
                                            'OpenAI account limits are unavailable until OAuth is connected.'}
                                    </p>
                                )}
                            </div>

                            <div>
                                <p className='text-muted-foreground text-xs'>Local subscription windows</p>
                                {isLoadingOpenAIUsage ? (
                                    <p className='text-muted-foreground mt-1 text-xs'>Loading local OpenAI usage...</p>
                                ) : openAISubscriptionUsage ? (
                                    <dl className='mt-2 grid gap-2 sm:grid-cols-2'>
                                        <div>
                                            <dt className='text-muted-foreground text-xs'>Last 5h</dt>
                                            <dd className='mt-1 font-medium'>
                                                {formatInteger(openAISubscriptionUsage.fiveHour.totalTokens)} tokens
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className='text-muted-foreground text-xs'>Last 7d</dt>
                                            <dd className='mt-1 font-medium'>
                                                {formatInteger(openAISubscriptionUsage.weekly.totalTokens)} tokens
                                            </dd>
                                        </div>
                                    </dl>
                                ) : (
                                    <p className='text-muted-foreground mt-1 text-xs'>
                                        No local `openai_subscription` telemetry is available yet.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </StatusCard>
            </div>
        </section>
    );
}

