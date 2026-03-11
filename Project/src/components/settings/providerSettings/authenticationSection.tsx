import { ExternalLink } from 'lucide-react';

import type { ActiveAuthFlow, ProviderAuthStateView } from '@/web/components/settings/providerSettings/types';
import { Button } from '@/web/components/ui/button';

import type { RuntimeProviderId } from '@/shared/contracts';

interface ProviderAuthenticationSectionProps {
    selectedProviderId: RuntimeProviderId | undefined;
    selectedProviderAuthState: string;
    selectedProviderAuthMethod: string;
    selectedAuthState: ProviderAuthStateView | undefined;
    methods: string[];
    endpointProfileValue: string;
    endpointProfileOptions: Array<{ value: string; label: string }>;
    apiKeyCta?: { label: string; url: string };
    apiKeyInput: string;
    activeAuthFlow: ActiveAuthFlow | undefined;
    isSavingApiKey: boolean;
    isSavingEndpointProfile: boolean;
    isStartingAuth: boolean;
    isPollingAuth: boolean;
    isCancellingAuth: boolean;
    isOpeningVerificationPage: boolean;
    onApiKeyInputChange: (value: string) => void;
    onEndpointProfileChange: (value: string) => void;
    onSaveApiKey: () => void;
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

function EndpointProfileField(input: {
    endpointProfileValue: string;
    endpointProfileOptions: Array<{ value: string; label: string }>;
    isSavingEndpointProfile: boolean;
    onEndpointProfileChange: (value: string) => void;
}) {
    if (input.endpointProfileOptions.length <= 1) {
        return null;
    }

    return (
        <label className='space-y-1.5'>
            <span className='text-muted-foreground block text-xs font-medium'>Endpoint profile</span>
            <select
                id='provider-endpoint-profile'
                name='providerEndpointProfile'
                value={input.endpointProfileValue}
                onChange={(event) => {
                    input.onEndpointProfileChange(event.target.value);
                }}
                className='border-border bg-background h-10 w-full rounded-xl border px-3 text-sm'
                disabled={input.isSavingEndpointProfile}>
                {input.endpointProfileOptions.map((profile) => (
                    <option key={profile.value} value={profile.value}>
                        {profile.label}
                    </option>
                ))}
            </select>
        </label>
    );
}

function ApiKeyField(input: {
    selectedProviderId: RuntimeProviderId | undefined;
    apiKeyInput: string;
    isSavingApiKey: boolean;
    apiKeyCta?: { label: string; url: string };
    onApiKeyInputChange: (value: string) => void;
    onSaveApiKey: () => void;
    compactIntro: string;
}) {
    return (
        <div className='border-border/70 bg-background/75 space-y-3 rounded-2xl border p-4'>
            <div className='space-y-1'>
                <p className='text-sm font-semibold'>Advanced API key access</p>
                <p className='text-muted-foreground text-xs'>{input.compactIntro}</p>
            </div>

            <div className='grid gap-2 sm:grid-cols-[1fr_auto]'>
                <label className='sr-only' htmlFor='provider-api-key-input'>
                    API key
                </label>
                <input
                    id='provider-api-key-input'
                    name='providerApiKey'
                    type='password'
                    value={input.apiKeyInput}
                    onChange={(event) => {
                        input.onApiKeyInputChange(event.target.value);
                    }}
                    className='border-border bg-card h-10 rounded-xl border px-3 text-sm'
                    autoComplete='off'
                    placeholder='Paste API key'
                />
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={
                        input.apiKeyInput.trim().length === 0 || input.isSavingApiKey || !input.selectedProviderId
                    }
                    onClick={input.onSaveApiKey}>
                    {input.isSavingApiKey ? 'Saving…' : 'Save API Key'}
                </Button>
            </div>

            {input.apiKeyCta ? (
                <Button size='sm' variant='ghost' asChild>
                    <a href={input.apiKeyCta.url} target='_blank' rel='noreferrer'>
                        {input.apiKeyCta.label}
                        <ExternalLink className='h-3.5 w-3.5' />
                    </a>
                </Button>
            ) : null}
        </div>
    );
}

export function ProviderAuthenticationSection({
    selectedProviderId,
    selectedProviderAuthState,
    selectedProviderAuthMethod,
    selectedAuthState,
    methods,
    endpointProfileValue,
    endpointProfileOptions,
    apiKeyCta,
    apiKeyInput,
    activeAuthFlow,
    isSavingApiKey,
    isSavingEndpointProfile,
    isStartingAuth,
    isPollingAuth,
    isCancellingAuth,
    isOpeningVerificationPage,
    onApiKeyInputChange,
    onEndpointProfileChange,
    onSaveApiKey,
    onStartOAuthDevice,
    onStartDeviceCode,
    onPollNow,
    onCancelFlow,
    onOpenVerificationPage,
}: ProviderAuthenticationSectionProps) {
    const effectiveAuthState = selectedAuthState?.authState ?? selectedProviderAuthState;
    const effectiveAuthMethod = selectedAuthState?.authMethod ?? selectedProviderAuthMethod;
    const isKilo = selectedProviderId === 'kilo';
    const canStartDeviceCode = methods.includes('device_code');
    const canStartOAuthDevice = methods.includes('oauth_device');
    const canUseApiKey = methods.includes('api_key');
    const activeFlowForSelectedProvider =
        activeAuthFlow?.providerId === selectedProviderId ? activeAuthFlow : undefined;

    return (
        <section className='border-border/70 bg-card/55 space-y-4 rounded-[24px] border p-5'>
            <div className='flex flex-col gap-3 md:flex-row md:items-start md:justify-between'>
                <div className='space-y-1'>
                    <p className='text-sm font-semibold'>{isKilo ? 'Kilo Access' : 'Authentication'}</p>
                    <p className='text-muted-foreground text-xs leading-5'>
                        {isKilo
                            ? 'Use browser sign-in for the app-first Kilo flow. API keys stay available only as an advanced fallback.'
                            : 'Connect the provider once, then keep model selection local to the active profile.'}
                    </p>
                </div>
                <AuthStateBadge authState={effectiveAuthState} authMethod={effectiveAuthMethod} />
            </div>

            <div className='grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]'>
                <div className='space-y-4'>
                    {isKilo ? (
                        <div className='border-primary/20 bg-primary/5 space-y-4 rounded-[24px] border p-4'>
                            <div className='space-y-1'>
                                <p className='text-sm font-semibold'>Sign in with Kilo</p>
                                <p className='text-muted-foreground text-xs leading-5'>
                                    Press the login button and finish the authorization in your browser. Neon Conductor
                                    keeps the account session and syncs your Kilo account context after approval.
                                </p>
                            </div>

                            <div className='flex flex-wrap gap-2'>
                                {canStartDeviceCode ? (
                                    <Button
                                        type='button'
                                        size='sm'
                                        disabled={isStartingAuth || !selectedProviderId}
                                        onClick={onStartDeviceCode}>
                                        {isStartingAuth ? 'Opening browser…' : 'Log In to Kilo'}
                                    </Button>
                                ) : null}
                                {activeFlowForSelectedProvider?.verificationUri ? (
                                    <Button
                                        type='button'
                                        size='sm'
                                        variant='outline'
                                        disabled={isOpeningVerificationPage}
                                        onClick={onOpenVerificationPage}>
                                        {isOpeningVerificationPage ? 'Opening…' : 'Open Browser Again'}
                                    </Button>
                                ) : null}
                            </div>

                            {activeFlowForSelectedProvider ? (
                                <div className='border-border/70 bg-background/80 rounded-2xl border p-4'>
                                    <p className='text-sm font-semibold'>Authorization in progress</p>
                                    <p className='text-muted-foreground mt-1 text-xs leading-5'>
                                        Enter code{' '}
                                        <span className='text-foreground font-semibold'>
                                            {activeFlowForSelectedProvider.userCode ?? '-'}
                                        </span>{' '}
                                        in the Kilo website, then return here. Polling continues in the background.
                                    </p>
                                    <div className='mt-3 flex flex-wrap gap-2'>
                                        <Button
                                            type='button'
                                            size='sm'
                                            variant='outline'
                                            disabled={isPollingAuth}
                                            onClick={onPollNow}>
                                            {isPollingAuth ? 'Polling…' : 'Check Login Status'}
                                        </Button>
                                        <Button
                                            type='button'
                                            size='sm'
                                            variant='ghost'
                                            disabled={isCancellingAuth}
                                            onClick={onCancelFlow}>
                                            {isCancellingAuth ? 'Cancelling…' : 'Cancel'}
                                        </Button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <div className='border-border/70 bg-background/75 space-y-3 rounded-2xl border p-4'>
                            <div className='flex flex-wrap gap-2'>
                                {canStartOAuthDevice ? (
                                    <Button
                                        type='button'
                                        size='sm'
                                        variant='outline'
                                        disabled={isStartingAuth || !selectedProviderId}
                                        onClick={onStartOAuthDevice}>
                                        {isStartingAuth ? 'Starting…' : 'Start OAuth Device'}
                                    </Button>
                                ) : null}
                                {canStartDeviceCode ? (
                                    <Button
                                        type='button'
                                        size='sm'
                                        variant='outline'
                                        disabled={isStartingAuth || !selectedProviderId}
                                        onClick={onStartDeviceCode}>
                                        {isStartingAuth ? 'Starting…' : 'Start Device Code'}
                                    </Button>
                                ) : null}
                                {activeFlowForSelectedProvider?.verificationUri ? (
                                    <Button
                                        type='button'
                                        size='sm'
                                        variant='ghost'
                                        disabled={isOpeningVerificationPage}
                                        onClick={onOpenVerificationPage}>
                                        {isOpeningVerificationPage ? 'Opening…' : 'Open Verification Page'}
                                        <ExternalLink className='h-3.5 w-3.5' />
                                    </Button>
                                ) : null}
                            </div>

                            {activeFlowForSelectedProvider ? (
                                <div className='border-border/70 bg-card/80 rounded-xl border p-3'>
                                    <p className='text-xs font-semibold'>Auth flow in progress</p>
                                    <p className='text-muted-foreground mt-1 text-xs leading-5'>
                                        Enter code{' '}
                                        <span className='text-foreground font-semibold'>
                                            {activeFlowForSelectedProvider.userCode ?? '-'}
                                        </span>{' '}
                                        and confirm in browser.
                                    </p>
                                    <div className='mt-2 flex flex-wrap gap-2'>
                                        <Button
                                            type='button'
                                            size='sm'
                                            variant='outline'
                                            disabled={isPollingAuth}
                                            onClick={onPollNow}>
                                            {isPollingAuth ? 'Polling…' : 'Poll Now'}
                                        </Button>
                                        <Button
                                            type='button'
                                            size='sm'
                                            variant='outline'
                                            disabled={isCancellingAuth}
                                            onClick={onCancelFlow}>
                                            {isCancellingAuth ? 'Cancelling…' : 'Cancel'}
                                        </Button>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    )}

                    {canUseApiKey ? (
                        <ApiKeyField
                            selectedProviderId={selectedProviderId}
                            apiKeyInput={apiKeyInput}
                            isSavingApiKey={isSavingApiKey}
                            apiKeyCta={apiKeyCta}
                            onApiKeyInputChange={onApiKeyInputChange}
                            onSaveApiKey={onSaveApiKey}
                            compactIntro={
                                isKilo
                                    ? 'Keep this for manual or support-driven setups. The normal Kilo path is browser login.'
                                    : 'Use an API key when you want direct token-based access instead of an interactive login.'
                            }
                        />
                    ) : null}
                </div>

                <div className='border-border/70 bg-background/70 space-y-4 rounded-[24px] border p-4'>
                    <div className='space-y-1'>
                        <p className='text-sm font-semibold'>Connection details</p>
                        <p className='text-muted-foreground text-xs leading-5'>
                            Endpoint and auth details that affect how this provider session is resolved locally.
                        </p>
                    </div>
                    <EndpointProfileField
                        endpointProfileValue={endpointProfileValue}
                        endpointProfileOptions={endpointProfileOptions}
                        isSavingEndpointProfile={isSavingEndpointProfile}
                        onEndpointProfileChange={onEndpointProfileChange}
                    />
                </div>
            </div>
        </section>
    );
}
