import { ProviderAuthenticationSection } from '@/web/components/settings/providerSettings/authenticationSection';
import { ProviderDefaultModelSection } from '@/web/components/settings/providerSettings/defaultModelSection';
import { useProviderSettingsController } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsController';
import { KiloRoutingSection } from '@/web/components/settings/providerSettings/kiloRoutingSection';
import { ProviderSidebar } from '@/web/components/settings/providerSettings/providerSidebar';
import { ProviderStatusSection } from '@/web/components/settings/providerSettings/providerStatusSection';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';

interface ProviderSettingsViewProps {
    profileId: string;
}

export function ProviderSettingsView({ profileId }: ProviderSettingsViewProps) {
    const controller = useProviderSettingsController(profileId);

    return (
        <section className='grid min-h-full grid-cols-[260px_1fr]'>
            <ProviderSidebar
                providers={controller.providerItems}
                selectedProviderId={controller.selectedProviderId}
                onSelectProvider={controller.selectProvider}
                onPreviewProvider={controller.prefetchProvider}
            />

            <div className='min-h-0 overflow-y-auto p-4'>
                {controller.selectedProvider ? (
                    <div className='space-y-5'>
                        <SettingsFeedbackBanner message={controller.feedbackMessage} tone={controller.feedbackTone} />
                        <div>
                            <h4 className='text-base font-semibold text-balance'>
                                {controller.selectedProvider.label}
                            </h4>
                            <p className='text-muted-foreground text-sm'>
                                Local runtime works with any configured provider. Kilo login is only required for
                                Kilo-specific extras.
                            </p>
                        </div>

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

                        {controller.selectedProvider.features.supportsKiloRouting &&
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

                        <ProviderAuthenticationSection
                            selectedProviderId={controller.selectedProviderId}
                            selectedProviderAuthState={controller.selectedProvider.authState}
                            selectedProviderAuthMethod={controller.selectedProvider.authMethod}
                            selectedAuthState={controller.selectedAuthState}
                            methods={controller.methods}
                            endpointProfileValue={controller.selectedProvider.endpointProfile.value}
                            endpointProfileOptions={controller.selectedProvider.endpointProfiles}
                            apiKeyCta={controller.selectedProvider.apiKeyCta}
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

                        <ProviderStatusSection
                            provider={controller.selectedProvider}
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
                    </div>
                ) : (
                    <p className='text-muted-foreground text-sm'>No providers available.</p>
                )}
            </div>
        </section>
    );
}
