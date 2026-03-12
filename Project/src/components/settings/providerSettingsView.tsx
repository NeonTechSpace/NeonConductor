import { ProviderAuthenticationSection } from '@/web/components/settings/providerSettings/authenticationSection';
import { ProviderDefaultModelSection } from '@/web/components/settings/providerSettings/defaultModelSection';
import { useProviderSettingsController } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsController';
import { ProviderSidebar } from '@/web/components/settings/providerSettings/providerSidebar';
import { ProviderStatusSection } from '@/web/components/settings/providerSettings/providerStatusSection';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';

import { useEffect } from 'react';

interface ProviderSettingsViewProps {
    profileId: string;
}

export function ProviderSettingsView({ profileId }: ProviderSettingsViewProps) {
    const controller = useProviderSettingsController(profileId);
    const customProviders = controller.selection.providerItems.filter((provider) => provider.id !== 'kilo');
    const selectedProvider =
        controller.selection.selectedProvider && controller.selection.selectedProvider.id !== 'kilo'
            ? controller.selection.selectedProvider
            : undefined;

    useEffect(() => {
        if (selectedProvider || customProviders.length === 0) {
            return;
        }

        const fallbackProvider = customProviders.find((provider) => provider.isDefault) ?? customProviders[0];
        if (!fallbackProvider) {
            return;
        }

        controller.selection.selectProvider(fallbackProvider.id);
    }, [controller.selection.selectProvider, customProviders, selectedProvider]);

    return (
        <section className='grid h-full min-h-0 min-w-0 overflow-hidden xl:grid-cols-[264px_minmax(0,1fr)]'>
            <ProviderSidebar
                title='Custom providers'
                providers={customProviders}
                selectedProviderId={selectedProvider?.id}
                onSelectProvider={controller.selection.selectProvider}
                onPreviewProvider={controller.selection.prefetchProvider}
            />

            <div className='min-h-0 min-w-0 overflow-y-auto p-4 md:p-5'>
                {selectedProvider ? (
                    <div className='flex w-full min-w-0 flex-col gap-4'>
                        <SettingsFeedbackBanner message={controller.feedback.message} tone={controller.feedback.tone} />
                        <div className='flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between'>
                            <div className='min-w-0'>
                                <h4 className='text-xl font-semibold text-balance'>{selectedProvider.label}</h4>
                                <p className='text-muted-foreground mt-1 max-w-3xl text-sm leading-6'>
                                    Connect and tune direct providers here. Kilo sign-in, Kilo default models, and Kilo
                                    routing live in the dedicated Kilo section.
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
                            selectedProviderId={selectedProvider.id}
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
                    </div>
                ) : (
                    <div className='border-border/70 bg-card/40 space-y-2 rounded-[24px] border p-5'>
                        <p className='text-sm font-semibold'>No custom providers selected</p>
                        <p className='text-muted-foreground text-sm leading-6'>
                            Use the Kilo section for the default app experience. This area is reserved for direct
                            OpenAI, Moonshot, and Z.AI credentials.
                        </p>
                    </div>
                )}
            </div>
        </section>
    );
}
