import { Button } from '@/web/components/ui/button';

interface ProviderConnectionDetailsSectionProps {
    connectionProfileValue: string;
    connectionProfileOptions: Array<{ value: string; label: string }>;
    supportsCustomBaseUrl: boolean;
    baseUrlOverrideValue: string;
    resolvedBaseUrl: string | null;
    isSavingConnectionProfile: boolean;
    onConnectionProfileChange: (value: string) => void;
    onBaseUrlOverrideChange: (value: string) => void;
    onSaveBaseUrlOverride: () => void;
}

export function ProviderConnectionDetailsSection({
    connectionProfileValue,
    connectionProfileOptions,
    supportsCustomBaseUrl,
    baseUrlOverrideValue,
    resolvedBaseUrl,
    isSavingConnectionProfile,
    onConnectionProfileChange,
    onBaseUrlOverrideChange,
    onSaveBaseUrlOverride,
}: ProviderConnectionDetailsSectionProps) {
    if (connectionProfileOptions.length <= 1 && !supportsCustomBaseUrl) {
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
            </div>
        </div>
    );
}
