import { ProviderAuthenticationSection } from '@/web/components/settings/providerSettings/authenticationSection';
import { ProviderDefaultModelSection } from '@/web/components/settings/providerSettings/defaultModelSection';
import { useDirectProviderSettingsController } from '@/web/components/settings/providerSettings/hooks/useDirectProviderSettingsController';
import { ProviderSidebar } from '@/web/components/settings/providerSettings/providerSidebar';
import { ProviderStatusSection } from '@/web/components/settings/providerSettings/providerStatusSection';
import { ProviderSpecialistDefaultsSection } from '@/web/components/settings/providerSettings/specialistDefaultsSection';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';

import type { RuntimeProviderId } from '@/shared/contracts';

interface ProviderSettingsViewProps {
    profileId: string;
    selectedProviderId?: RuntimeProviderId;
    onProviderChange?: (providerId: RuntimeProviderId) => void;
    onOpenKiloSettings?: () => void;
}

function buildProviderSettingsControllerKey(profileId: string, selectedProviderId: RuntimeProviderId): string {
    return `${profileId}:${selectedProviderId}`;
}

function KiloSettingsHandoff({
    onOpenKiloSettings,
}: {
    onOpenKiloSettings: (() => void) | undefined;
}) {
    return (
        <div className='border-border/70 bg-card/40 space-y-4 rounded-[24px] border p-5'>
            <div className='space-y-1'>
                <p className='text-sm font-semibold'>Kilo settings live in the dedicated Kilo route</p>
                <p className='text-muted-foreground text-sm leading-6'>
                    Kilo auth, account access, gateway models, and routing controls are managed in the dedicated Kilo
                    settings surface. Providers &amp; Models now focuses on direct-provider setup.
                </p>
            </div>
            {onOpenKiloSettings ? (
                <div className='flex justify-start'>
                    <button
                        type='button'
                        className='border-border bg-background hover:bg-accent rounded-full border px-4 py-2 text-sm font-medium transition-colors'
                        onClick={onOpenKiloSettings}>
                        Open Kilo settings
                    </button>
                </div>
            ) : null}
        </div>
    );
}

function DirectProviderContent({
    profileId,
    controller,
    selectedProvider,
}: {
    profileId: string;
    controller: ReturnType<typeof useDirectProviderSettingsController>;
    selectedProvider: NonNullable<ReturnType<typeof useDirectProviderSettingsController>['selection']['selectedProvider']>;
}) {
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
                        Connect direct providers and adjust their settings here. Kilo stays in its own dedicated
                        setup surface.
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
                onExecutionPreferenceChange={(value) => {
                    void controller.authentication.changeExecutionPreference(value);
                }}
                onSaveApiKey={(value) => controller.authentication.saveApiKey(value)}
                onSaveBaseUrlOverride={(value) => controller.authentication.saveBaseUrlOverride(value)}
                onLoadStoredCredential={() => controller.authentication.loadStoredCredential()}
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
                {...(controller.models.catalogStateDetail
                    ? { catalogStateDetail: controller.models.catalogStateDetail }
                    : {})}
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

function ProviderSettingsViewBody({
    profileId,
    selectedProviderId,
    onProviderChange,
    onOpenKiloSettings,
}: ProviderSettingsViewProps) {
    const controller = useDirectProviderSettingsController(
        profileId,
        selectedProviderId ? { initialProviderId: selectedProviderId } : undefined
    );
    const selectedProvider = controller.selection.selectedProvider;

    return (
        <section className='grid h-full min-h-0 min-w-0 overflow-hidden xl:grid-cols-[264px_minmax(0,1fr)]'>
            <ProviderSidebar
                providers={controller.selection.providerItems}
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
                {controller.isKiloSelected ? (
                    <KiloSettingsHandoff onOpenKiloSettings={onOpenKiloSettings} />
                ) : selectedProvider ? (
                    <DirectProviderContent
                        profileId={profileId}
                        controller={controller}
                        selectedProvider={selectedProvider}
                    />
                ) : (
                    <div className='border-border/70 bg-card/40 space-y-2 rounded-[24px] border p-5'>
                        <p className='text-sm font-semibold'>No provider selected</p>
                        <p className='text-muted-foreground text-sm leading-6'>
                            Choose a direct provider from the provider rail to inspect auth, models, and runtime
                            defaults.
                        </p>
                    </div>
                )}
            </div>
        </section>
    );
}

export function ProviderSettingsView({
    profileId,
    selectedProviderId = 'kilo',
    onProviderChange,
    onOpenKiloSettings,
}: ProviderSettingsViewProps) {
    return (
        <ProviderSettingsViewBody
            key={buildProviderSettingsControllerKey(profileId, selectedProviderId)}
            profileId={profileId}
            selectedProviderId={selectedProviderId}
            {...(onProviderChange ? { onProviderChange } : {})}
            {...(onOpenKiloSettings ? { onOpenKiloSettings } : {})}
        />
    );
}
