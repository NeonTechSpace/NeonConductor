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
    const customProviders = controller.providerItems.filter((provider) => provider.id !== 'kilo');
    const selectedProvider =
        controller.selectedProvider && controller.selectedProvider.id !== 'kilo' ? controller.selectedProvider : undefined;

    useEffect(() => {
        if (selectedProvider || customProviders.length === 0) {
            return;
        }

        const fallbackProvider = customProviders.find((provider) => provider.isDefault) ?? customProviders[0];
        if (!fallbackProvider) {
            return;
        }

        controller.selectProvider(fallbackProvider.id);
    }, [controller.selectProvider, customProviders, selectedProvider]);

    return (
        <section className='grid h-full min-h-0 min-w-0 overflow-hidden xl:grid-cols-[264px_minmax(0,1fr)]'>
            <ProviderSidebar
                title='Custom providers'
                providers={customProviders}
                selectedProviderId={selectedProvider?.id}
                onSelectProvider={controller.selectProvider}
                onPreviewProvider={controller.prefetchProvider}
            />

            <div className='min-h-0 min-w-0 overflow-y-auto p-4 md:p-5'>
                {selectedProvider ? (
                    <div className='flex w-full min-w-0 flex-col gap-4'>
                        <SettingsFeedbackBanner message={controller.feedbackMessage} tone={controller.feedbackTone} />
                        <div className='flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between'>
                            <div className='min-w-0'>
                                <h4 className='text-xl font-semibold text-balance'>{selectedProvider.label}</h4>
                                <p className='text-muted-foreground mt-1 max-w-3xl text-sm leading-6'>
                                    Connect and tune direct providers here. Kilo sign-in, Kilo default models, and
                                    Kilo routing live in the dedicated Kilo section.
                                </p>
                            </div>
                            <div className='border-border/70 bg-background/80 self-start rounded-full border px-3 py-1.5 text-xs font-medium'>
                                {selectedProvider.authState} via {selectedProvider.authMethod.replace('_', ' ')}
                            </div>
                        </div>

                        <ProviderStatusSection
                            provider={selectedProvider}
                            authState={controller.selectedAuthState}
                            accountContext={controller.kiloAccountContext}
                            usageSummary={controller.selectedProviderUsageSummary}
                            openAISubscriptionUsage={controller.openAISubscriptionUsage}
                            openAISubscriptionRateLimits={controller.openAISubscriptionRateLimits}
                            isLoadingAccountContext={controller.queries.accountContextQuery.isLoading}
                            isLoadingUsageSummary={controller.queries.usageSummaryQuery.isLoading}
                            isLoadingOpenAIUsage={controller.queries.openAISubscriptionUsageQuery.isLoading}
                            isLoadingOpenAIRateLimits={controller.queries.openAISubscriptionRateLimitsQuery.isLoading}
                        />

                        <ProviderAuthenticationSection
                            selectedProviderId={selectedProvider.id}
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
                            {...(controller.credentialSummary
                                ? { credentialSummary: controller.credentialSummary }
                                : {})}
                        />

                        <ProviderDefaultModelSection
                            selectedProviderId={selectedProvider.id}
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
