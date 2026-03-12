import { useEffect, useState } from 'react';

import { ProviderAuthFlowSection } from '@/web/components/settings/providerSettings/authentication/providerAuthFlowSection';
import { ProviderConnectionDetailsSection } from '@/web/components/settings/providerSettings/authentication/providerConnectionDetailsSection';
import { ProviderCredentialSection } from '@/web/components/settings/providerSettings/authentication/providerCredentialSection';
import type { ActiveAuthFlow, ProviderAuthStateView } from '@/web/components/settings/providerSettings/types';

import type { RuntimeProviderId } from '@/shared/contracts';

interface ProviderAuthenticationSectionProps {
    selectedProviderId: RuntimeProviderId | undefined;
    selectedProviderAuthState: string;
    selectedProviderAuthMethod: string;
    selectedAuthState: ProviderAuthStateView | undefined;
    methods: string[];
    connectionProfileValue: string;
    connectionProfileOptions: Array<{ value: string; label: string }>;
    supportsCustomBaseUrl: boolean;
    baseUrlOverrideValue: string;
    resolvedBaseUrl: string | null;
    apiKeyCta?: { label: string; url: string };
    credentialSummary?: {
        hasStoredCredential: boolean;
        credentialSource: 'api_key' | 'access_token' | null;
        maskedValue?: string;
    };
    activeAuthFlow: ActiveAuthFlow | undefined;
    isSavingApiKey: boolean;
    isSavingConnectionProfile: boolean;
    isStartingAuth: boolean;
    isPollingAuth: boolean;
    isCancellingAuth: boolean;
    isOpeningVerificationPage: boolean;
    onConnectionProfileChange: (value: string) => void;
    onSaveApiKey: (value: string) => Promise<void>;
    onSaveBaseUrlOverride: (value: string) => Promise<void>;
    onLoadStoredCredential: () => Promise<string | undefined>;
    onStartOAuthDevice: () => void;
    onStartDeviceCode: () => void;
    onPollNow: () => void;
    onCancelFlow: () => void;
    onOpenVerificationPage: () => void;
}

function AuthStateBadge({ authState, authMethod }: { authState: string; authMethod: string }) {
    return (
        <div className='flex flex-wrap items-center gap-2 text-xs'>
            <span className='border-border/70 bg-background rounded-full border px-2.5 py-1 font-medium'>
                State {authState}
            </span>
            <span className='text-muted-foreground'>via {authMethod.replace('_', ' ')}</span>
        </div>
    );
}

export function ProviderAuthenticationSection({
    selectedProviderId,
    selectedProviderAuthState,
    selectedProviderAuthMethod,
    selectedAuthState,
    methods,
    connectionProfileValue,
    connectionProfileOptions,
    supportsCustomBaseUrl,
    baseUrlOverrideValue,
    resolvedBaseUrl,
    apiKeyCta,
    credentialSummary,
    activeAuthFlow,
    isSavingApiKey,
    isSavingConnectionProfile,
    isStartingAuth,
    isPollingAuth,
    isCancellingAuth,
    isOpeningVerificationPage,
    onConnectionProfileChange,
    onSaveApiKey,
    onSaveBaseUrlOverride,
    onLoadStoredCredential,
    onStartOAuthDevice,
    onStartDeviceCode,
    onPollNow,
    onCancelFlow,
    onOpenVerificationPage,
}: ProviderAuthenticationSectionProps) {
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [baseUrlOverrideInput, setBaseUrlOverrideInput] = useState(baseUrlOverrideValue);
    const [isCredentialVisible, setIsCredentialVisible] = useState(false);
    const [hasLoadedStoredCredential, setHasLoadedStoredCredential] = useState(false);
    const effectiveAuthState = selectedAuthState?.authState ?? selectedProviderAuthState;
    const effectiveAuthMethod = selectedAuthState?.authMethod ?? selectedProviderAuthMethod;
    const isKilo = selectedProviderId === 'kilo';
    const canUseApiKey = methods.includes('api_key');
    const activeFlowForSelectedProvider =
        activeAuthFlow?.providerId === selectedProviderId ? activeAuthFlow : undefined;
    const isAuthenticated = effectiveAuthState === 'authenticated';
    const kiloCredentialLabel =
        credentialSummary?.credentialSource === 'access_token'
            ? 'Browser session token is stored locally for Kilo.'
            : credentialSummary?.credentialSource === 'api_key'
              ? 'An API key is stored locally for Kilo.'
              : 'Kilo account access is ready in this profile.';

    useEffect(() => {
        setApiKeyInput('');
        setBaseUrlOverrideInput(baseUrlOverrideValue);
        setIsCredentialVisible(false);
        setHasLoadedStoredCredential(false);
    }, [baseUrlOverrideValue, connectionProfileValue, selectedProviderId]);

    useEffect(() => {
        if (
            selectedProviderId !== 'kilo' ||
            hasLoadedStoredCredential ||
            credentialSummary?.credentialSource !== 'access_token' ||
            apiKeyInput.trim().length > 0
        ) {
            return;
        }

        let cancelled = false;
        void onLoadStoredCredential()
            .then((credentialValue) => {
                if (!credentialValue || cancelled) {
                    return;
                }

                setApiKeyInput(credentialValue);
                setHasLoadedStoredCredential(true);
            })
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [apiKeyInput, credentialSummary?.credentialSource, hasLoadedStoredCredential, onLoadStoredCredential, selectedProviderId]);

    const revealStoredCredential = () => {
        void (async () => {
            if (apiKeyInput.trim().length === 0 && credentialSummary?.hasStoredCredential) {
                const credentialValue = await onLoadStoredCredential();
                if (!credentialValue) {
                    return;
                }

                setApiKeyInput(credentialValue);
                setHasLoadedStoredCredential(true);
            }

            setIsCredentialVisible(true);
        })();
    };

    const copyStoredCredential = () => {
        void (async () => {
            const credentialValue =
                apiKeyInput.trim().length > 0 ? apiKeyInput : await onLoadStoredCredential();
            if (!credentialValue) {
                return;
            }

            await navigator.clipboard.writeText(credentialValue);
            setHasLoadedStoredCredential(true);
        })();
    };

    const saveApiKey = () => {
        void onSaveApiKey(apiKeyInput)
            .then(() => {
                setApiKeyInput('');
                setIsCredentialVisible(false);
                setHasLoadedStoredCredential(false);
            })
            .catch(() => undefined);
    };

    const saveBaseUrlOverride = () => {
        void onSaveBaseUrlOverride(baseUrlOverrideInput).catch(() => undefined);
    };

    return (
        <section className='border-border/70 bg-card/55 space-y-4 rounded-[24px] border p-5'>
            <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
                <div className='min-w-0 space-y-1'>
                    <p className='text-sm font-semibold'>{isKilo ? 'Kilo Access' : 'Authentication'}</p>
                    <p className='text-muted-foreground text-xs leading-5'>
                        {isKilo
                            ? 'Use browser sign-in for the app-first Kilo flow. API keys stay available only as an advanced fallback.'
                            : 'Connect the provider once, then keep model selection local to the active profile.'}
                    </p>
                </div>
                <div className='self-start'>
                    <AuthStateBadge authState={effectiveAuthState} authMethod={effectiveAuthMethod} />
                </div>
            </div>

            <div className='space-y-4'>
                <ProviderAuthFlowSection
                    isKilo={isKilo}
                    isAuthenticated={isAuthenticated}
                    methods={methods}
                    activeUserCode={activeFlowForSelectedProvider?.userCode}
                    activeVerificationUri={activeFlowForSelectedProvider?.verificationUri}
                    credentialLabel={kiloCredentialLabel}
                    isStartingAuth={isStartingAuth}
                    isPollingAuth={isPollingAuth}
                    isCancellingAuth={isCancellingAuth}
                    isOpeningVerificationPage={isOpeningVerificationPage}
                    onStartOAuthDevice={onStartOAuthDevice}
                    onStartDeviceCode={onStartDeviceCode}
                    onPollNow={onPollNow}
                    onCancelFlow={onCancelFlow}
                    onOpenVerificationPage={onOpenVerificationPage}
                />

                <div className='grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)]'>
                    <div className='min-w-0'>
                        <ProviderCredentialSection
                            selectedProviderId={selectedProviderId}
                            isKilo={isKilo}
                            canUseApiKey={canUseApiKey}
                            apiKeyInput={apiKeyInput}
                            isCredentialVisible={isCredentialVisible}
                            isSavingApiKey={isSavingApiKey}
                            apiKeyCta={apiKeyCta}
                            credentialSummary={credentialSummary}
                            onApiKeyInputChange={setApiKeyInput}
                            onSaveApiKey={saveApiKey}
                            onRevealStoredCredential={revealStoredCredential}
                            onHideStoredCredential={() => {
                                setIsCredentialVisible(false);
                            }}
                            onCopyStoredCredential={copyStoredCredential}
                        />
                    </div>

                    <ProviderConnectionDetailsSection
                        connectionProfileValue={connectionProfileValue}
                        connectionProfileOptions={connectionProfileOptions}
                        supportsCustomBaseUrl={supportsCustomBaseUrl}
                        baseUrlOverrideValue={baseUrlOverrideInput}
                        resolvedBaseUrl={resolvedBaseUrl}
                        isSavingConnectionProfile={isSavingConnectionProfile}
                        onConnectionProfileChange={onConnectionProfileChange}
                        onBaseUrlOverrideChange={setBaseUrlOverrideInput}
                        onSaveBaseUrlOverride={saveBaseUrlOverride}
                    />
                </div>
            </div>
        </section>
    );
}
