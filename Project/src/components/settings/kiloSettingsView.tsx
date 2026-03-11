import { formatDateTime, formatInteger } from '@/web/components/settings/providerSettings/helpers';
import { ProviderAuthenticationSection } from '@/web/components/settings/providerSettings/authenticationSection';
import { ProviderDefaultModelSection } from '@/web/components/settings/providerSettings/defaultModelSection';
import { useProviderSettingsController } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsController';
import { KiloAccountSection } from '@/web/components/settings/providerSettings/kiloAccountSection';
import { KiloRoutingSection } from '@/web/components/settings/providerSettings/kiloRoutingSection';
import { ProviderStatusSection } from '@/web/components/settings/providerSettings/providerStatusSection';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';
import { SensitiveValue } from '@/web/components/ui/sensitiveValue';

import type { ReactNode } from 'react';

interface KiloSettingsViewProps {
    profileId: string;
}

function formatBalance(amount: number | undefined, currency: string | undefined): string {
    if (amount === undefined || !currency) {
        return '-';
    }

    return `${amount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })} ${currency}`;
}

function SummaryCard(input: { label: string; value: ReactNode; meta?: string }) {
    return (
        <article className='border-border/70 bg-background/80 rounded-[22px] border p-4'>
            <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase'>{input.label}</p>
            <div className='mt-2 text-sm font-medium'>{input.value}</div>
            {input.meta ? <p className='text-muted-foreground mt-2 text-xs'>{input.meta}</p> : null}
        </article>
    );
}

export function KiloSettingsView({ profileId }: KiloSettingsViewProps) {
    const controller = useProviderSettingsController(profileId, {
        initialProviderId: 'kilo',
    });
    const provider = controller.selectedProvider;

    if (!provider || provider.id !== 'kilo') {
        return <p className='text-muted-foreground p-5 text-sm'>Kilo is not available for this profile.</p>;
    }

    const accountContext = controller.kiloAccountContext;
    const activeOrganization = accountContext?.organizations.find((organization) => organization.isActive);

    return (
        <section className='mx-auto flex min-h-full w-full max-w-6xl flex-col gap-5 p-5 md:p-6'>
            <div className='space-y-2'>
                <p className='text-primary text-[11px] font-semibold tracking-[0.18em] uppercase'>Kilo</p>
                <div className='flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between'>
                    <div className='space-y-1'>
                        <h4 className='text-xl font-semibold text-balance'>Kilo account and routing</h4>
                        <p className='text-muted-foreground max-w-3xl text-sm leading-6'>
                            Sign in through the Kilo website, inspect the synced account context, and manage the Kilo
                            organization and routing state from one place.
                        </p>
                    </div>
                    <div className='border-border/70 bg-background/80 rounded-full border px-3 py-1.5 text-xs font-medium'>
                        Auth {controller.selectedAuthState?.authState ?? provider.authState}
                    </div>
                </div>
            </div>

            <SettingsFeedbackBanner message={controller.feedbackMessage} tone={controller.feedbackTone} />

            <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
                <SummaryCard
                    label='Account'
                    value={<SensitiveValue value={accountContext?.displayName} category='person' />}
                    meta={accountContext?.accountId ? `ID ${accountContext.accountId}` : 'No account linked yet'}
                />
                <SummaryCard
                    label='Email'
                    value={<SensitiveValue value={accountContext?.emailMasked} category='email' />}
                    meta={
                        controller.selectedAuthState?.tokenExpiresAt
                            ? `Token ${formatDateTime(controller.selectedAuthState.tokenExpiresAt)}`
                            : 'Token expiry unavailable'
                    }
                />
                <SummaryCard
                    label='Organization'
                    value={<SensitiveValue value={activeOrganization?.name} category='organization' />}
                    meta={`${formatInteger(accountContext?.organizations.length)} orgs available`}
                />
                <SummaryCard
                    label='Balance'
                    value={
                        <SensitiveValue
                            value={formatBalance(accountContext?.balance?.amount, accountContext?.balance?.currency)}
                            category='balance'
                        />
                    }
                    meta={
                        accountContext?.balance?.updatedAt
                            ? `Updated ${formatDateTime(accountContext.balance.updatedAt)}`
                            : 'No balance snapshot yet'
                    }
                />
            </div>

            <div className='grid gap-5 2xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]'>
                <div className='space-y-5'>
                    <ProviderAuthenticationSection
                        selectedProviderId={controller.selectedProviderId}
                        selectedProviderAuthState={provider.authState}
                        selectedProviderAuthMethod={provider.authMethod}
                        selectedAuthState={controller.selectedAuthState}
                        methods={controller.methods}
                        endpointProfileValue={provider.endpointProfile.value}
                        endpointProfileOptions={provider.endpointProfiles}
                        apiKeyCta={provider.apiKeyCta}
                        apiKeyInput={controller.apiKeyInput}
                        activeAuthFlow={controller.activeAuthFlow}
                        isSavingApiKey={controller.mutations.setApiKeyMutation.isPending}
                        isSavingEndpointProfile={controller.mutations.setEndpointProfileMutation.isPending}
                        isStartingAuth={controller.mutations.startAuthMutation.isPending}
                        isPollingAuth={controller.mutations.pollAuthMutation.isPending}
                        isCancellingAuth={controller.mutations.cancelAuthMutation.isPending}
                        isOpeningVerificationPage={controller.mutations.openExternalUrlMutation.isPending}
                        onApiKeyInputChange={controller.setApiKeyInput}
                        onEndpointProfileChange={(value) => {
                            void controller.changeEndpointProfile(value);
                        }}
                        onSaveApiKey={() => {
                            void controller.saveApiKey();
                        }}
                        onStartOAuthDevice={() => {
                            void controller.startOAuthDevice();
                        }}
                        onStartDeviceCode={() => {
                            void controller.startDeviceCode();
                        }}
                        onPollNow={() => {
                            void controller.pollNow();
                        }}
                        onCancelFlow={() => {
                            void controller.cancelFlow();
                        }}
                        onOpenVerificationPage={() => {
                            void controller.openVerificationPage();
                        }}
                    />

                    <ProviderDefaultModelSection
                        selectedProviderId={controller.selectedProviderId}
                        selectedModelId={controller.selectedModelId}
                        models={controller.models}
                        isDefaultModel={controller.selectedIsDefaultModel}
                        isSavingDefault={controller.mutations.setDefaultMutation.isPending}
                        isSyncingCatalog={controller.mutations.syncCatalogMutation.isPending}
                        onSelectModel={controller.setSelectedModelId}
                        onSetDefault={() => {
                            void controller.setDefaultModel();
                        }}
                        onSyncCatalog={() => {
                            void controller.syncCatalog();
                        }}
                    />

                    {provider.features.supportsKiloRouting &&
                    controller.selectedModelId.trim().length > 0 &&
                    controller.kiloRoutingDraft ? (
                        <KiloRoutingSection
                            selectedModelId={controller.selectedModelId}
                            draft={controller.kiloRoutingDraft}
                            providers={controller.kiloModelProviders}
                            isLoadingPreference={controller.queries.kiloRoutingPreferenceQuery.isLoading}
                            isLoadingProviders={controller.queries.kiloModelProvidersQuery.isLoading}
                            isSaving={controller.mutations.setModelRoutingPreferenceMutation.isPending}
                            onModeChange={(mode) => {
                                void controller.changeRoutingMode(mode);
                            }}
                            onSortChange={(sort) => {
                                void controller.changeRoutingSort(sort);
                            }}
                            onPinnedProviderChange={(providerId) => {
                                void controller.changePinnedProvider(providerId);
                            }}
                        />
                    ) : null}

                    <KiloAccountSection
                        accountContext={accountContext}
                        isLoading={controller.queries.accountContextQuery.isLoading}
                        isSavingOrganization={controller.mutations.setOrganizationMutation.isPending}
                        onOrganizationChange={(organizationId) => {
                            void controller.changeOrganization(organizationId);
                        }}
                    />
                </div>

                <div className='space-y-5'>
                    <ProviderStatusSection
                        provider={provider}
                        authState={controller.selectedAuthState}
                        accountContext={accountContext}
                        usageSummary={controller.selectedProviderUsageSummary}
                        openAISubscriptionUsage={controller.openAISubscriptionUsage}
                        openAISubscriptionRateLimits={controller.openAISubscriptionRateLimits}
                        isLoadingAccountContext={controller.queries.accountContextQuery.isLoading}
                        isLoadingUsageSummary={controller.queries.usageSummaryQuery.isLoading}
                        isLoadingOpenAIUsage={controller.queries.openAISubscriptionUsageQuery.isLoading}
                        isLoadingOpenAIRateLimits={controller.queries.openAISubscriptionRateLimitsQuery.isLoading}
                    />
                </div>
            </div>
        </section>
    );
}
