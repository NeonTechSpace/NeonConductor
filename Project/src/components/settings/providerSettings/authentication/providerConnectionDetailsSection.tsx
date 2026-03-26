import { Button } from '@/web/components/ui/button';

import { openAIExecutionModes, type OpenAIExecutionMode } from '@/shared/contracts';

interface ProviderConnectionDetailsSectionProps {
    selectedProviderId: string | undefined;
    connectionProfileValue: string;
    connectionProfileOptions: Array<{ value: string; label: string }>;
    supportsCustomBaseUrl: boolean;
    baseUrlOverrideValue: string;
    resolvedBaseUrl: string | null;
    executionPreference:
        | {
              mode: OpenAIExecutionMode;
              canUseRealtimeWebSocket: boolean;
              disabledReason?: 'provider_not_supported' | 'api_key_required' | 'base_url_not_supported';
          }
        | undefined;
    isSavingConnectionProfile: boolean;
    isSavingExecutionPreference: boolean;
    onConnectionProfileChange: (value: string) => void;
    onExecutionPreferenceChange: (mode: OpenAIExecutionMode) => void;
    onBaseUrlOverrideChange: (value: string) => void;
    onSaveBaseUrlOverride: () => void;
}

function describeRealtimeDisabledReason(
    reason: 'provider_not_supported' | 'api_key_required' | 'base_url_not_supported' | undefined
): string {
    if (reason === 'api_key_required') {
        return 'Realtime WebSocket currently requires an OpenAI API key.';
    }

    if (reason === 'base_url_not_supported') {
        return 'Realtime WebSocket is limited to the official OpenAI base URL in this version.';
    }

    if (reason === 'provider_not_supported') {
        return 'Realtime WebSocket is only available for the direct OpenAI provider.';
    }

    return 'Realtime WebSocket is only available for agent and orchestrator runs.';
}

function isOpenAIExecutionMode(value: string): value is OpenAIExecutionMode {
    return openAIExecutionModes.some((candidate) => candidate === value);
}

export function ProviderConnectionDetailsSection({
    selectedProviderId,
    connectionProfileValue,
    connectionProfileOptions,
    supportsCustomBaseUrl,
    baseUrlOverrideValue,
    resolvedBaseUrl,
    executionPreference,
    isSavingConnectionProfile,
    isSavingExecutionPreference,
    onConnectionProfileChange,
    onExecutionPreferenceChange,
    onBaseUrlOverrideChange,
    onSaveBaseUrlOverride,
}: ProviderConnectionDetailsSectionProps) {
    if (connectionProfileOptions.length <= 1 && !supportsCustomBaseUrl && !executionPreference) {
        return null;
    }

    return (
        <div className='border-border/70 bg-background/70 min-w-0 space-y-4 rounded-[24px] border p-4'>
            <div className='space-y-1'>
                <p className='text-sm font-semibold'>Connection details</p>
                <p className='text-muted-foreground text-xs leading-5'>
                    Endpoint and auth details that affect how this provider session is resolved locally.
                </p>
            </div>

            <div className='space-y-4'>
                {connectionProfileOptions.length > 1 ? (
                    <label className='space-y-1.5'>
                        <span className='text-muted-foreground block text-xs font-medium'>Connection profile</span>
                        <select
                            id='provider-connection-profile'
                            name='providerConnectionProfile'
                            value={connectionProfileValue}
                            onChange={(event) => {
                                onConnectionProfileChange(event.target.value);
                            }}
                            className='border-border bg-background h-10 w-full rounded-xl border px-3 text-sm'
                            disabled={isSavingConnectionProfile}>
                            {connectionProfileOptions.map((profile) => (
                                <option key={profile.value} value={profile.value}>
                                    {profile.label}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : null}

                {supportsCustomBaseUrl ? (
                    <div className='space-y-2'>
                        <label className='space-y-1.5'>
                            <span className='text-muted-foreground block text-xs font-medium'>Base URL override</span>
                            <div className='grid gap-2 sm:grid-cols-[1fr_auto]'>
                                <input
                                    id='provider-base-url-override'
                                    name='providerBaseUrlOverride'
                                    type='text'
                                    value={baseUrlOverrideValue}
                                    onChange={(event) => {
                                        onBaseUrlOverrideChange(event.target.value);
                                    }}
                                    className='border-border bg-background h-10 rounded-xl border px-3 text-sm'
                                    autoComplete='off'
                                    placeholder='Use provider default'
                                />
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='outline'
                                    disabled={isSavingConnectionProfile}
                                    onClick={onSaveBaseUrlOverride}>
                                    {isSavingConnectionProfile ? 'Saving…' : 'Save URL'}
                                </Button>
                            </div>
                        </label>
                        <p className='text-muted-foreground text-xs leading-5'>
                            Resolved base URL: {resolvedBaseUrl ?? 'Provider default is unavailable'}
                        </p>
                    </div>
                ) : null}

                {selectedProviderId === 'openai' && executionPreference ? (
                    <div className='border-border/70 space-y-2 rounded-2xl border border-dashed p-3'>
                        <div className='space-y-1'>
                            <p className='text-xs font-medium'>Execution mode</p>
                            <p className='text-muted-foreground text-xs leading-5'>
                                Standard HTTP works everywhere. Realtime WebSocket is lower-latency, but only for agent
                                and orchestrator runs on official OpenAI API-key setups.
                            </p>
                        </div>

                        <label className='space-y-1.5'>
                            <span className='text-muted-foreground block text-xs font-medium'>OpenAI execution</span>
                            <select
                                id='provider-openai-execution-mode'
                                name='providerOpenAIExecutionMode'
                                value={executionPreference.mode}
                                onChange={(event) => {
                                    const nextMode = event.target.value;
                                    if (isOpenAIExecutionMode(nextMode)) {
                                        onExecutionPreferenceChange(nextMode);
                                    }
                                }}
                                className='border-border bg-background h-10 w-full rounded-xl border px-3 text-sm'
                                disabled={isSavingExecutionPreference}>
                                <option value='standard_http'>Standard HTTP</option>
                                <option
                                    value='realtime_websocket'
                                    disabled={!executionPreference.canUseRealtimeWebSocket}>
                                    Realtime WebSocket
                                </option>
                            </select>
                        </label>

                        {!executionPreference.canUseRealtimeWebSocket ? (
                            <p className='text-muted-foreground text-xs leading-5'>
                                {describeRealtimeDisabledReason(executionPreference.disabledReason)}
                            </p>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
