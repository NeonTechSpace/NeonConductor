import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/web/components/ui/sensitiveValue', () => ({
    SensitiveValue: ({ value }: { value?: string }) => <span>{value ?? '-'}</span>,
}));

import { ProviderStatusSection } from '@/web/components/settings/providerSettings/providerStatusSection';

import type { ProviderListItem } from '@/web/components/settings/providerSettings/types';

function createProvider(id: ProviderListItem['id'], label: string): ProviderListItem {
    return {
        id,
        label,
        isDefault: false,
        authState: id === 'openai_codex' ? 'authenticated' : 'logged_out',
        authMethod: id === 'openai_codex' ? 'oauth_pkce' : 'api_key',
        availableAuthMethods: id === 'openai_codex' ? ['oauth_pkce', 'oauth_device'] : ['api_key'],
        connectionProfile: {
            optionProfileId: 'default',
            label: 'Default',
            options: [{ value: 'default', label: 'Default' }],
            resolvedBaseUrl: id === 'openai' ? 'https://api.openai.com/v1' : null,
        },
        apiKeyCta: {
            label: 'Create key',
            url: 'https://example.com',
        },
        features: {
            catalogStrategy: 'static',
            supportsKiloRouting: false,
            supportsModelProviderListing: false,
            supportsConnectionOptions: false,
            supportsCustomBaseUrl: id === 'openai',
            supportsOrganizationScope: false,
        },
    };
}

describe('ProviderStatusSection', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('shows live OpenAI Codex account windows with refresh and freshness state', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-03-23T12:00:00.000Z'));

        const html = renderToStaticMarkup(
            <ProviderStatusSection
                provider={createProvider('openai_codex', 'OpenAI Codex')}
                authState={{
                    authState: 'authenticated',
                    authMethod: 'oauth_pkce',
                    accountId: 'acct_codex',
                    tokenExpiresAt: '2026-03-23T14:00:00.000Z',
                }}
                accountContext={undefined}
                usageSummary={{
                    providerId: 'openai_codex',
                    runCount: 12,
                    totalTokens: 32000,
                    totalCostMicrounits: 0,
                }}
                openAISubscriptionUsage={{
                    providerId: 'openai_codex',
                    billedVia: 'openai_subscription',
                    fiveHour: {
                        windowLabel: 'last_5_hours',
                        windowStart: '2026-03-23T07:00:00.000Z',
                        windowEnd: '2026-03-23T12:00:00.000Z',
                        runCount: 4,
                        inputTokens: 9000,
                        outputTokens: 3000,
                        cachedTokens: 0,
                        reasoningTokens: 0,
                        totalTokens: 12000,
                        totalCostMicrounits: 0,
                    },
                    weekly: {
                        windowLabel: 'last_7_days',
                        windowStart: '2026-03-16T12:00:00.000Z',
                        windowEnd: '2026-03-23T12:00:00.000Z',
                        runCount: 9,
                        inputTokens: 20000,
                        outputTokens: 6000,
                        cachedTokens: 0,
                        reasoningTokens: 0,
                        totalTokens: 26000,
                        totalCostMicrounits: 0,
                    },
                }}
                openAISubscriptionRateLimits={{
                    providerId: 'openai_codex',
                    source: 'chatgpt_wham',
                    fetchedAt: new Date('2026-03-23T11:47:00.000Z').valueOf(),
                    planType: 'pro',
                    primary: {
                        usedPercent: 61,
                        windowMinutes: 300,
                        resetsAt: new Date('2026-03-23T13:15:00.000Z').valueOf(),
                    },
                    secondary: {
                        usedPercent: 38,
                        windowMinutes: 10080,
                        resetsAt: new Date('2026-03-27T12:00:00.000Z').valueOf(),
                    },
                    limits: [],
                }}
                isLoadingAccountContext={false}
                isLoadingUsageSummary={false}
                isLoadingOpenAIUsage={false}
                isLoadingOpenAIRateLimits={false}
                isRefreshingOpenAICodexUsage={false}
                onRefreshOpenAICodexUsage={() => {}}
            />
        );

        expect(html).toContain('Refresh');
        expect(html).toContain('Last refreshed 13m ago');
        expect(html).toContain('This Codex account snapshot is stale.');
        expect(html).toContain('Plan');
        expect(html).toContain('pro');
        expect(html).toContain('Resets in 1h 15m');
        expect(html).toContain('Last 5h');
        expect(html).toMatch(/12[.,]000 tokens/);
        expect(html).toContain('Last 7d');
        expect(html).toMatch(/26[.,]000 tokens/);
    });

    it('keeps direct OpenAI scoped to API status without Codex account windows', () => {
        const html = renderToStaticMarkup(
            <ProviderStatusSection
                provider={createProvider('openai', 'OpenAI')}
                authState={undefined}
                accountContext={undefined}
                usageSummary={undefined}
                openAISubscriptionUsage={undefined}
                openAISubscriptionRateLimits={undefined}
                isLoadingAccountContext={false}
                isLoadingUsageSummary={false}
                isLoadingOpenAIUsage={false}
                isLoadingOpenAIRateLimits={false}
                isRefreshingOpenAICodexUsage={false}
                onRefreshOpenAICodexUsage={() => {}}
            />
        );

        expect(html).toContain('Use an API key for direct OpenAI API access and realtime execution.');
        expect(html).not.toContain('OpenAI Codex Windows');
        expect(html).not.toContain('Refresh');
    });
});
