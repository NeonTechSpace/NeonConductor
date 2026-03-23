import { ProviderAuthenticationSection } from '@/web/components/settings/providerSettings/authenticationSection';
import { ProviderDefaultModelSection } from '@/web/components/settings/providerSettings/defaultModelSection';
import { useProviderSettingsController } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsController';
import { KiloRoutingSection } from '@/web/components/settings/providerSettings/kiloRoutingSection';
import { ProviderSidebar } from '@/web/components/settings/providerSettings/providerSidebar';
import { ProviderSpecialistDefaultsSection } from '@/web/components/settings/providerSettings/specialistDefaultsSection';
import { ProviderStatusSection } from '@/web/components/settings/providerSettings/providerStatusSection';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';

import type { RuntimeProviderId } from '@/shared/contracts';

interface ProviderSettingsViewProps {
    profileId: string;
    selectedProviderId?: RuntimeProviderId;
    onProviderChange?: (providerId: RuntimeProviderId) => void;
}

function sortProviderItems(
    providers: ReturnType<typeof useProviderSettingsController>['selection']['providerItems']
) {
    const kiloProvider = providers.find((provider) => provider.id === 'kilo');
    const directProviders = providers
        .filter((provider) => provider.id !== 'kilo')
        .toSorted((left, right) => left.label.localeCompare(right.label));

    return kiloProvider ? [kiloProvider, ...directProviders] : directProviders;
}

function KiloProviderContent({
    profileId,
    controller,
}: {
    profileId: string;
    controller: ReturnType<typeof useProviderSettingsController>;
}) {
    const selectedProvider = controller.selection.selectedProvider!;
    const shouldShowRoutingSection =
        selectedProvider.features.supportsKiloRouting &&
        controller.models.selectedModelId.trim().length > 0 &&
        Boolean(controller.kilo.routingDraft) &&
        controller.kilo.modelProviders.length > 1;

    return (
        <div className='flex w-full min-w-0 flex-col gap-4'>
            <SettingsFeedbackBanner message={controller.feedback.message} tone={controller.feedback.tone} />
            <div className='flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between'>
                <div className='min-w-0'>
                    <h4 className='text-xl font-semibold text-balance'>Kilo Gateway</h4>
                    <p className='text-muted-foreground mt-1 max-w-3xl text-sm leading-6'>
                        Keep Kilo Gateway first in the shared provider surface. Account access, default models, and
                        routing live here without splitting provider management into a separate tab set.
                    </p>
                </div>
                <div className='border-border/70 bg-background/80 self-start rounded-full border px-3 py-1.5 text-xs font-medium'>
                    {controller.providerStatus.authState?.authState ?? selectedProvider.authState}
                </div>
            </div>

            <ProviderSpecialistDefaultsSection profileId={profileId} />

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
            ) : null}
        </div>
    );
}

function DirectProviderContent({
    profileId,
    controller,
}: {
    profileId: string;
    controller: ReturnType<typeof useProviderSettingsController>;
}) {
    const selectedProvider = controller.selection.selectedProvider!;

    return (
        <div className='flex w-full min-w-0 flex-col gap-4'>
            <div className='mb-4'>
                <ProviderSpecialistDefaultsSection profileId={profileId} />
            </div>

            <SettingsFeedbackBanner message={controller.feedback.message} tone={controller.feedback.tone} />
            <div className='flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between'>
                <div className='min-w-0'>
                    <h4 className='text-xl font-semibold text-balance'>{selectedProvider.label}</h4>
                    <p className='text-muted-foreground mt-1 max-w-3xl text-sm leading-6'>
                        Connect and tune direct providers here. Kilo Gateway stays pinned above the divider, while
                        custom providers stay together in this shared surface.
                    </p>
                </div>
                <div className='border-border/70 bg-background/80 self-start rounded-full border px-3 py-1.5 text-xs font-medium'>
                    {selectedProvider.authState} via {selectedProvider.authMethod.replace('_', ' ')}
                </div>
            </div>

            <ProviderStatusSection
                provider={selectedProvider}
                authState={controller.providerStatus.authState}
                accountContext={controller.providerStatus.accountContext}
                usageSummary={controller.providerStatus.usageSummary}
                openAISubscriptionUsage={controller.providerStatus.openAISubscriptionUsage}
                openAISubscriptionRateLimits={controller.providerStatus.openAISubscriptionRateLimits}
                isLoadingAccountContext={controller.providerStatus.isLoadingAccountContext}
                isLoadingUsageSummary={controller.providerStatus.isLoadingUsageSummary}
                isLoadingOpenAIUsage={controller.providerStatus.isLoadingOpenAIUsage}
                isLoadingOpenAIRateLimits={controller.providerStatus.isLoadingOpenAIRateLimits}
                isRefreshingOpenAICodexUsage={controller.providerStatus.isRefreshingOpenAICodexUsage}
                onRefreshOpenAICodexUsage={() => {
                    void controller.providerStatus.refreshOpenAICodexUsage();
                }}
            />

            <ProviderAuthenticationSection
                key={`${profileId}:${selectedProvider.id}`}
                selectedProviderId={selectedProvider.id}
                selectedProviderAuthState={selectedProvider.authState}
                selectedProviderAuthMethod={selectedProvider.authMethod}
                selectedAuthState={controller.providerStatus.authState}
                methods={controller.authentication.methods}
                connectionProfileValue={selectedProvider.connectionProfile.optionProfileId}
                connectionProfileOptions={selectedProvider.connectionProfile.options}
                supportsCustomBaseUrl={selectedProvider.features.supportsCustomBaseUrl}
                baseUrlOverrideValue={selectedProvider.connectionProfile.baseUrlOverride ?? ''}
                resolvedBaseUrl={selectedProvider.connectionProfile.resolvedBaseUrl}
                executionPreference={controller.authentication.executionPreference}
                apiKeyCta={selectedProvider.apiKeyCta}
                activeAuthFlow={controller.authentication.activeAuthFlow}
                isSavingApiKey={controller.authentication.isSavingApiKey}
                isSavingConnectionProfile={controller.authentication.isSavingConnectionProfile}
                isSavingExecutionPreference={controller.authentication.isSavingExecutionPreference}
                isStartingAuth={controller.authentication.isStartingAuth}
                isPollingAuth={controller.authentication.isPollingAuth}
                isCancellingAuth={controller.authentication.isCancellingAuth}
                isOpeningVerificationPage={controller.authentication.isOpeningVerificationPage}
                onConnectionProfileChange={(value) => {
                    void controller.authentication.changeConnectionProfile(value);
                }}
                onExecutionPreferenceChange={(mode) => {
                    void controller.authentication.changeExecutionPreference(mode);
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
                selectedProviderId={selectedProvider.id}
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

export function ProviderSettingsView({
    profileId,
    selectedProviderId = 'kilo',
    onProviderChange,
}: ProviderSettingsViewProps) {
    const controller = useProviderSettingsController(profileId, { initialProviderId: selectedProviderId });
    const providerItems = sortProviderItems(controller.selection.providerItems);
    const selectedProvider = controller.selection.selectedProvider;

    return (
        <section className='grid h-full min-h-0 min-w-0 overflow-hidden xl:grid-cols-[264px_minmax(0,1fr)]'>
            <ProviderSidebar
                providers={providerItems}
                selectedProviderId={selectedProvider?.id}
                onSelectProvider={(providerId) => {
                    if (onProviderChange) {
                        onProviderChange(providerId);
                        return;
                    }

                    controller.selection.selectProvider(providerId);
                }}
                onPreviewProvider={controller.selection.prefetchProvider}
            />

            <div className='min-h-0 min-w-0 overflow-y-auto p-4 md:p-5'>
                {selectedProvider ? (
                    selectedProvider.id === 'kilo' ? (
                        <KiloProviderContent profileId={profileId} controller={controller} />
                    ) : (
                        <DirectProviderContent profileId={profileId} controller={controller} />
                    )
                ) : (
                    <div className='border-border/70 bg-card/40 space-y-2 rounded-[24px] border p-5'>
                        <p className='text-sm font-semibold'>No provider selected</p>
                        <p className='text-muted-foreground text-sm leading-6'>
                            Choose Kilo Gateway or a direct provider from the provider rail to inspect auth, models,
                            and runtime defaults.
                        </p>
                    </div>
                )}
            </div>
        </section>
    );
}
