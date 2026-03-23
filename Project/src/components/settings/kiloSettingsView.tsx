import { ProviderAuthenticationSection } from '@/web/components/settings/providerSettings/authenticationSection';
import { ProviderDefaultModelSection } from '@/web/components/settings/providerSettings/defaultModelSection';
import { formatDateTime, formatInteger } from '@/web/components/settings/providerSettings/helpers';
import { KiloAccountSection } from '@/web/components/settings/providerSettings/kiloAccountSection';
import { KiloRoutingSection } from '@/web/components/settings/providerSettings/kiloRoutingSection';
import { useProviderSettingsController } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsController';
import { ProviderSpecialistDefaultsSection } from '@/web/components/settings/providerSettings/specialistDefaultsSection';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';
import { SettingsPlannedSection } from '@/web/components/settings/shared/settingsPlannedSection';
import { SettingsSelectionRail } from '@/web/components/settings/shared/settingsSelectionRail';
import { KILO_SETTINGS_SUBSECTIONS, type KiloSettingsSubsectionId } from '@/web/components/settings/settingsNavigation';
import { SensitiveValue } from '@/web/components/ui/sensitiveValue';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

interface KiloSettingsViewProps {
    profileId: string;
    subsection?: KiloSettingsSubsectionId;
    onSubsectionChange?: (subsection: KiloSettingsSubsectionId) => void;
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

function KiloSectionHeader({
    eyebrow,
    title,
    description,
    meta,
}: {
    eyebrow: string;
    title: string;
    description: string;
    meta?: ReactNode;
}) {
    return (
        <div className='space-y-2'>
            <p className='text-primary text-[11px] font-semibold tracking-[0.18em] uppercase'>{eyebrow}</p>
            <div className='flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between'>
                <div className='space-y-1'>
                    <h4 className='text-xl font-semibold text-balance'>{title}</h4>
                    <p className='text-muted-foreground max-w-3xl text-sm leading-6'>{description}</p>
                </div>
                {meta ? <div className='shrink-0'>{meta}</div> : null}
            </div>
        </div>
    );
}

function KiloAccountAccessScreen({
    profileId,
    controller,
    effectiveAuthState,
}: {
    profileId: string;
    controller: ReturnType<typeof useProviderSettingsController>;
    effectiveAuthState: string;
}) {
    const accountContext = controller.kilo.accountContext;
    const activeOrganization = accountContext?.organizations.find((organization) => organization.isActive);
    const selectedProvider = controller.selection.selectedProvider!;

    return (
        <div className='space-y-5'>
            <KiloSectionHeader
                eyebrow='Kilo'
                title='Account & Access'
                description='Sign in to Kilo, inspect identity and organization state, and manage session access from one place.'
                meta={
                    <div className='border-border/70 bg-background/80 rounded-full border px-3 py-1.5 text-xs font-medium'>
                        Auth {effectiveAuthState}
                    </div>
                }
            />

            <SettingsFeedbackBanner message={controller.feedback.message} tone={controller.feedback.tone} />

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
                executionPreference={undefined}
                apiKeyCta={selectedProvider.apiKeyCta}
                activeAuthFlow={controller.authentication.activeAuthFlow}
                isSavingApiKey={controller.authentication.isSavingApiKey}
                isSavingConnectionProfile={controller.authentication.isSavingConnectionProfile}
                isSavingExecutionPreference={false}
                isStartingAuth={controller.authentication.isStartingAuth}
                isPollingAuth={controller.authentication.isPollingAuth}
                isCancellingAuth={controller.authentication.isCancellingAuth}
                isOpeningVerificationPage={controller.authentication.isOpeningVerificationPage}
                onConnectionProfileChange={(value) => {
                    void controller.authentication.changeConnectionProfile(value);
                }}
                onExecutionPreferenceChange={() => {}}
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
                        value={<SensitiveValue value={activeOrganization?.organizationId} category='account_id' />}
                        meta='Switch organizations from the Kilo organization panel.'
                    />
                </div>
            </div>
        </div>
    );
}

function KiloGatewayModelsScreen({
    profileId,
    controller,
}: {
    profileId: string;
    controller: ReturnType<typeof useProviderSettingsController>;
}) {
    return (
        <div className='space-y-5'>
            <KiloSectionHeader
                eyebrow='Kilo'
                title='Gateway Models'
                description='Set the default Kilo model for this profile and decide which provider/model pairs specialists should prefer.'
            />

            <SettingsFeedbackBanner message={controller.feedback.message} tone={controller.feedback.tone} />

            <ProviderSpecialistDefaultsSection profileId={profileId} />

            <ProviderDefaultModelSection
                selectedProviderId='kilo'
                selectedModelId={controller.models.selectedModelId}
                models={controller.models.options}
                catalogStateReason={controller.models.catalogStateReason}
                {...(controller.models.catalogStateDetail ? { catalogStateDetail: controller.models.catalogStateDetail } : {})}
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
        </div>
    );
}

function KiloRoutingScreen({
    controller,
}: {
    controller: ReturnType<typeof useProviderSettingsController>;
}) {
    const shouldShowRoutingSection =
        controller.selection.selectedProvider?.features.supportsKiloRouting === true &&
        controller.models.selectedModelId.trim().length > 0 &&
        Boolean(controller.kilo.routingDraft) &&
        controller.kilo.modelProviders.length > 1;

    return (
        <div className='space-y-5'>
            <KiloSectionHeader
                eyebrow='Kilo'
                title='Routing'
                description='Choose how Kilo should route a selected model when multiple upstream providers are available.'
            />

            <SettingsFeedbackBanner message={controller.feedback.message} tone={controller.feedback.tone} />

            <ProviderDefaultModelSection
                selectedProviderId='kilo'
                selectedModelId={controller.models.selectedModelId}
                models={controller.models.options}
                catalogStateReason={controller.models.catalogStateReason}
                {...(controller.models.catalogStateDetail ? { catalogStateDetail: controller.models.catalogStateDetail } : {})}
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

            {shouldShowRoutingSection && controller.kilo.routingDraft ? (
                <KiloRoutingSection
                    selectedModelId={controller.models.selectedModelId}
                    draft={controller.kilo.routingDraft}
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
            ) : (
                <div className='border-border/70 bg-card/40 rounded-[24px] border p-5'>
                    <p className='text-sm font-semibold'>Routing is not configurable yet</p>
                    <p className='text-muted-foreground mt-2 text-sm leading-6'>
                        Choose a Kilo model that exposes multiple upstream providers before advanced routing controls
                        become available here.
                    </p>
                </div>
            )}
        </div>
    );
}

export function KiloSettingsView({ profileId, subsection = 'account', onSubsectionChange }: KiloSettingsViewProps) {
    const controller = useProviderSettingsController(profileId, { initialProviderId: 'kilo' });
    const [requestedInitialCatalogRefresh, setRequestedInitialCatalogRefresh] = useState(false);
    const selectedProvider = controller.selection.selectedProvider;
    const effectiveAuthState = controller.providerStatus.authState?.authState ?? selectedProvider?.authState ?? 'logged_out';

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

    return (
        <section className='grid h-full min-h-0 min-w-0 overflow-hidden xl:grid-cols-[280px_minmax(0,1fr)]'>
            <SettingsSelectionRail
                title='Kilo'
                ariaLabel='Kilo settings sections'
                selectedId={subsection}
                onSelect={(itemId) => {
                    const nextSection = KILO_SETTINGS_SUBSECTIONS.find((candidate) => candidate.id === itemId);
                    if (!nextSection || nextSection.availability !== 'available') {
                        return;
                    }

                    onSubsectionChange?.(nextSection.id);
                }}
                items={KILO_SETTINGS_SUBSECTIONS.map((item) => ({
                    id: item.id,
                    title: item.label,
                    subtitle: item.description,
                    ...(item.availability === 'planned' ? { meta: 'Planned', disabled: true } : {}),
                }))}
            />

            <div className='min-h-0 min-w-0 overflow-y-auto p-5 md:p-6'>
                {subsection === 'account' ? (
                    <KiloAccountAccessScreen
                        profileId={profileId}
                        controller={controller}
                        effectiveAuthState={effectiveAuthState}
                    />
                ) : null}
                {subsection === 'models' ? <KiloGatewayModelsScreen profileId={profileId} controller={controller} /> : null}
                {subsection === 'routing' ? <KiloRoutingScreen controller={controller} /> : null}
                {subsection === 'instructions' ? (
                    <SettingsPlannedSection
                        eyebrow='Kilo'
                        title='Modes & Instructions'
                        description='Global Kilo prompt layers, shipped mode overrides, and custom mode management will live here.'
                        warning='Editing built-in Kilo, chat, agent, or orchestrator instructions can make the app behave differently than shipped defaults. This surface should ship with warnings and reset-to-default controls.'
                    />
                ) : null}
                {subsection === 'marketplace' ? (
                    <SettingsPlannedSection
                        eyebrow='Kilo'
                        title='Marketplace'
                        description='Marketplace installation and update management are intentionally reserved here instead of being mixed into registry diagnostics.'
                    />
                ) : null}
            </div>
        </section>
    );
}
