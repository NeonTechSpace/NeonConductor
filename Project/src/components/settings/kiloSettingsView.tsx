import { ProviderAuthenticationSection } from '@/web/components/settings/providerSettings/authenticationSection';
import { ProviderDefaultModelSection } from '@/web/components/settings/providerSettings/defaultModelSection';
import { formatDateTime, formatInteger } from '@/web/components/settings/providerSettings/helpers';
import { KiloAccountSection } from '@/web/components/settings/providerSettings/kiloAccountSection';
import { KiloRoutingSection } from '@/web/components/settings/providerSettings/kiloRoutingSection';
import { useProviderSettingsController } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsController';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';
import { SensitiveValue } from '@/web/components/ui/sensitiveValue';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

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
    const controller = useProviderSettingsController(profileId, { initialProviderId: 'kilo' });
    const [requestedInitialCatalogRefresh, setRequestedInitialCatalogRefresh] = useState(false);
    const selectedProvider = controller.selectedProvider;
    const effectiveAuthState = controller.selectedAuthState?.authState ?? selectedProvider?.authState ?? 'logged_out';
    const shouldShowRoutingSection =
        selectedProvider?.features.supportsKiloRouting === true &&
        controller.selectedModelId.trim().length > 0 &&
        Boolean(controller.kiloRoutingDraft) &&
        controller.kiloModelProviders.length > 1;

    useEffect(() => {
        if (
            selectedProvider?.id !== 'kilo' ||
            requestedInitialCatalogRefresh ||
            effectiveAuthState !== 'authenticated' ||
            controller.models.length > 0 ||
            controller.mutations.syncCatalogMutation.isPending
        ) {
            return;
        }

        setRequestedInitialCatalogRefresh(true);
        void controller.syncCatalog();
    }, [
        controller.models.length,
        controller.mutations.syncCatalogMutation.isPending,
        controller.syncCatalog,
        effectiveAuthState,
        requestedInitialCatalogRefresh,
        selectedProvider?.id,
    ]);

    if (!selectedProvider || selectedProvider.id !== 'kilo') {
        return <p className='text-muted-foreground p-5 text-sm'>Kilo is not available for this profile.</p>;
    }

    const accountContext = controller.kiloAccountContext;
    const activeOrganization = accountContext?.organizations.find((organization) => organization.isActive);

    return (
        <section className='flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
            <div className='min-h-0 flex-1 overflow-y-auto p-5 md:p-6'>
                <div className='flex flex-col gap-5'>
                    <div className='space-y-2'>
                        <p className='text-primary text-[11px] font-semibold tracking-[0.18em] uppercase'>Kilo</p>
                        <div className='flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between'>
                            <div className='space-y-1'>
                                <h4 className='text-xl font-semibold text-balance'>Kilo account and model setup</h4>
                                <p className='text-muted-foreground max-w-3xl text-sm leading-6'>
                                    Sign in to Kilo, choose the default Kilo model, and review the synced identity,
                                    organization membership, and balance snapshots here.
                                </p>
                            </div>
                            <div className='border-border/70 bg-background/80 rounded-full border px-3 py-1.5 text-xs font-medium'>
                                Auth {effectiveAuthState}
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

                    <ProviderAuthenticationSection
                        selectedProviderId='kilo'
                        selectedProviderAuthState={selectedProvider.authState}
                        selectedProviderAuthMethod={selectedProvider.authMethod}
                        selectedAuthState={controller.selectedAuthState}
                        methods={controller.methods}
                        endpointProfileValue={selectedProvider.endpointProfile.value}
                        endpointProfileOptions={selectedProvider.endpointProfiles}
                        apiKeyCta={selectedProvider.apiKeyCta}
                        apiKeyInput={controller.apiKeyInput}
                        isCredentialVisible={controller.isCredentialVisible}
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
                        onRevealStoredCredential={() => {
                            void controller.revealStoredCredential();
                        }}
                        onHideStoredCredential={controller.hideStoredCredential}
                        onCopyStoredCredential={() => {
                            void controller.copyStoredCredential();
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
                        {...(controller.credentialSummary ? { credentialSummary: controller.credentialSummary } : {})}
                    />

                    <ProviderDefaultModelSection
                        selectedProviderId='kilo'
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

                    {shouldShowRoutingSection ? (
                        <details className='border-border/70 bg-card/40 rounded-[24px] border p-4'>
                            <summary className='cursor-pointer list-none text-sm font-semibold'>Advanced routing</summary>
                            <p className='text-muted-foreground mt-2 text-xs leading-5'>
                                Fine-tune which upstream provider Kilo should prefer only after choosing a model that
                                actually supports multiple backing providers.
                            </p>
                            <div className='mt-4'>
                                <KiloRoutingSection
                                    selectedModelId={controller.selectedModelId}
                                    draft={controller.kiloRoutingDraft!}
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
                            </div>
                        </details>
                    ) : null}

                    <div className='grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]'>
                        <div className='space-y-5'>
                            <KiloAccountSection
                                accountContext={accountContext}
                                isLoading={controller.queries.accountContextQuery.isLoading}
                                isSavingOrganization={controller.mutations.setOrganizationMutation.isPending}
                                onOrganizationChange={(organizationId) => {
                                    void controller.changeOrganization(organizationId);
                                }}
                            />
                        </div>

                        <div className='space-y-4'>
                            <SummaryCard
                                label='Session'
                                value={effectiveAuthState}
                                meta={
                                    controller.selectedAuthState?.tokenExpiresAt
                                        ? `Token ${formatDateTime(controller.selectedAuthState.tokenExpiresAt)}`
                                        : 'Browser sign-in is the recommended Kilo flow.'
                                }
                            />
                            <SummaryCard
                                label='Active Org ID'
                                value={<SensitiveValue value={activeOrganization?.organizationId} category='account_id' />}
                                meta='Switch organizations from the Kilo organization panel.'
                            />
                            <SummaryCard
                                label='Email'
                                value={<SensitiveValue value={accountContext?.emailMasked} category='email' />}
                                meta='Identity data is synced from the Kilo account profile.'
                            />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
