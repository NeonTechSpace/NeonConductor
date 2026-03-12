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
    const selectedProvider = controller.selection.selectedProvider;
    const effectiveAuthState = controller.providerStatus.authState?.authState ?? selectedProvider?.authState ?? 'logged_out';
    const shouldShowRoutingSection =
        selectedProvider?.features.supportsKiloRouting === true &&
        controller.models.selectedModelId.trim().length > 0 &&
        Boolean(controller.kilo.routingDraft) &&
        controller.kilo.modelProviders.length > 1;

    useEffect(() => {
        if (
            selectedProvider?.id !== 'kilo' ||
            requestedInitialCatalogRefresh ||
            effectiveAuthState !== 'authenticated' ||
            controller.models.options.length > 0 ||
            controller.models.isSyncingCatalog
        ) {
            return;
        }

        setRequestedInitialCatalogRefresh(true);
        void controller.models.syncCatalog();
    }, [
        controller.models.isSyncingCatalog,
        controller.models.options.length,
        controller.models.syncCatalog,
        effectiveAuthState,
        requestedInitialCatalogRefresh,
        selectedProvider?.id,
    ]);

    if (!selectedProvider || selectedProvider.id !== 'kilo') {
        return <p className='text-muted-foreground p-5 text-sm'>Kilo is not available for this profile.</p>;
    }

    const accountContext = controller.kilo.accountContext;
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

                    <SettingsFeedbackBanner message={controller.feedback.message} tone={controller.feedback.tone} />

                    <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
                        <SummaryCard
                            label='Account'
                            value={<SensitiveValue value={accountContext?.displayName} category='person' />}
                            meta={
                                accountContext?.accountId ? `ID ${accountContext.accountId}` : 'No account linked yet'
                            }
                        />
                        <SummaryCard
                            label='Email'
                            value={<SensitiveValue value={accountContext?.emailMasked} category='email' />}
                            meta={
                                controller.providerStatus.authState?.tokenExpiresAt
                                    ? `Token ${formatDateTime(controller.providerStatus.authState.tokenExpiresAt)}`
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
                                    value={formatBalance(
                                        accountContext?.balance?.amount,
                                        accountContext?.balance?.currency
                                    )}
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
                        key={`${profileId}:kilo`}
                        selectedProviderId='kilo'
                        selectedProviderAuthState={selectedProvider.authState}
                        selectedProviderAuthMethod={selectedProvider.authMethod}
                        selectedAuthState={controller.providerStatus.authState}
                        methods={controller.authentication.methods}
                        connectionProfileValue={selectedProvider.connectionProfile.optionProfileId}
                        connectionProfileOptions={selectedProvider.connectionProfile.options}
                        supportsCustomBaseUrl={selectedProvider.features.supportsCustomBaseUrl}
                        baseUrlOverrideValue={selectedProvider.connectionProfile.baseUrlOverride ?? ''}
                        resolvedBaseUrl={selectedProvider.connectionProfile.resolvedBaseUrl}
                        apiKeyCta={selectedProvider.apiKeyCta}
                        activeAuthFlow={controller.authentication.activeAuthFlow}
                        isSavingApiKey={controller.authentication.isSavingApiKey}
                        isSavingConnectionProfile={controller.authentication.isSavingConnectionProfile}
                        isStartingAuth={controller.authentication.isStartingAuth}
                        isPollingAuth={controller.authentication.isPollingAuth}
                        isCancellingAuth={controller.authentication.isCancellingAuth}
                        isOpeningVerificationPage={controller.authentication.isOpeningVerificationPage}
                        onConnectionProfileChange={(value) => {
                            void controller.authentication.changeConnectionProfile(value);
                        }}
                        onSaveApiKey={(value) => {
                            return controller.authentication.saveApiKey(value);
                        }}
                        onSaveBaseUrlOverride={(value) => {
                            return controller.authentication.saveBaseUrlOverride(value);
                        }}
                        onLoadStoredCredential={controller.authentication.loadStoredCredential}
                        onStartOAuthDevice={() => {
                            void controller.authentication.startOAuthDevice();
                        }}
                        onStartDeviceCode={() => {
                            void controller.authentication.startDeviceCode();
                        }}
                        onPollNow={() => {
                            void controller.authentication.pollNow();
                        }}
                        onCancelFlow={() => {
                            void controller.authentication.cancelFlow();
                        }}
                        onOpenVerificationPage={() => {
                            void controller.authentication.openVerificationPage();
                        }}
                        {...(controller.authentication.credentialSummary
                            ? { credentialSummary: controller.authentication.credentialSummary }
                            : {})}
                    />

                    <ProviderDefaultModelSection
                        selectedProviderId='kilo'
                        selectedModelId={controller.models.selectedModelId}
                        models={controller.models.options}
                        isDefaultModel={controller.models.isDefaultModel}
                        isSavingDefault={controller.models.isSavingDefault}
                        isSyncingCatalog={controller.models.isSyncingCatalog}
                        onSelectModel={(modelId) => {
                            controller.models.setSelectedModelId(modelId);
                            if (modelId === controller.models.selectedModelId && controller.models.isDefaultModel) {
                                return;
                            }
                            void controller.models.setDefaultModel(modelId);
                        }}
                        onSyncCatalog={() => {
                            void controller.models.syncCatalog();
                        }}
                    />

                    {shouldShowRoutingSection ? (
                        <details className='border-border/70 bg-card/40 rounded-[24px] border p-4'>
                            <summary className='cursor-pointer list-none text-sm font-semibold'>
                                Advanced routing
                            </summary>
                            <p className='text-muted-foreground mt-2 text-xs leading-5'>
                                Fine-tune which upstream provider Kilo should prefer only after choosing a model that
                                actually supports multiple backing providers.
                            </p>
                            <div className='mt-4'>
                                <KiloRoutingSection
                                    selectedModelId={controller.models.selectedModelId}
                                    draft={controller.kilo.routingDraft!}
                                    providers={controller.kilo.modelProviders}
                                    isLoadingPreference={controller.kilo.isLoadingRoutingPreference}
                                    isLoadingProviders={controller.kilo.isLoadingModelProviders}
                                    isSaving={controller.kilo.isSavingRoutingPreference}
                                    onModeChange={(mode) => {
                                        void controller.kilo.changeRoutingMode(mode);
                                    }}
                                    onSortChange={(sort) => {
                                        void controller.kilo.changeRoutingSort(sort);
                                    }}
                                    onPinnedProviderChange={(providerId) => {
                                        void controller.kilo.changePinnedProvider(providerId);
                                    }}
                                />
                            </div>
                        </details>
                    ) : null}

                    <div className='grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]'>
                        <div className='space-y-5'>
                            <KiloAccountSection
                                accountContext={controller.kilo.accountContext}
                                isLoading={controller.providerStatus.isLoadingAccountContext}
                                isSavingOrganization={controller.kilo.isSavingOrganization}
                                onOrganizationChange={(organizationId) => {
                                    void controller.kilo.changeOrganization(organizationId);
                                }}
                            />
                        </div>

                        <div className='space-y-4'>
                            <SummaryCard
                                label='Session'
                                value={effectiveAuthState}
                                meta={
                                    controller.providerStatus.authState?.tokenExpiresAt
                                        ? `Token ${formatDateTime(controller.providerStatus.authState.tokenExpiresAt)}`
                                        : 'Browser sign-in is the recommended Kilo flow.'
                                }
                            />
                            <SummaryCard
                                label='Active Org ID'
                                value={
                                    <SensitiveValue value={activeOrganization?.organizationId} category='account_id' />
                                }
                                meta='Switch organizations from the Kilo organization panel.'
                            />
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
