import { ExternalLink } from 'lucide-react';

import { Button } from '@/web/components/ui/button';

export interface ProviderCredentialActionStatus {
    tone: 'error' | 'success';
    message: string;
}

interface ProviderCredentialSectionProps {
    selectedProviderId: string | undefined;
    isKilo: boolean;
    canUseApiKey: boolean;
    apiKeyInput: string;
    isCredentialVisible: boolean;
    isSavingApiKey: boolean;
    apiKeyCta: { label: string; url: string } | undefined;
    credentialActionStatus?: ProviderCredentialActionStatus;
    credentialSummary:
        | {
              hasStoredCredential: boolean;
              credentialSource: 'api_key' | 'access_token' | null;
              maskedValue?: string;
          }
        | undefined;
    onApiKeyInputChange: (value: string) => void;
    onSaveApiKey: () => void;
    onRevealStoredCredential: () => void | Promise<void>;
    onHideStoredCredential: () => void;
    onCopyStoredCredential: () => void | Promise<void>;
}

function ApiKeyField({
    selectedProviderId,
    apiKeyInput,
    isCredentialVisible,
    isSavingApiKey,
    apiKeyCta,
    credentialActionStatus,
    credentialSummary,
    onApiKeyInputChange,
    onSaveApiKey,
    onRevealStoredCredential,
    onHideStoredCredential,
    onCopyStoredCredential,
    compactIntro,
}: ProviderCredentialSectionProps & { compactIntro: string }) {
    const credentialActionMessageClassName = propsCredentialActionToneToClassName(
        credentialActionStatus?.tone ?? undefined
    );

    return (
        <div className='border-border/70 bg-background/75 space-y-3 rounded-2xl border p-4'>
            <div className='space-y-1'>
                <p className='text-sm font-semibold'>Advanced API key access</p>
                <p className='text-muted-foreground text-xs'>{compactIntro}</p>
            </div>

            <div className='grid gap-2 sm:grid-cols-[1fr_auto]'>
                <label className='sr-only' htmlFor='provider-api-key-input'>
                    API key
                </label>
                <input
                    id='provider-api-key-input'
                    name='providerApiKey'
                    type={isCredentialVisible ? 'text' : 'password'}
                    value={apiKeyInput}
                    onChange={(event) => {
                        onApiKeyInputChange(event.target.value);
                    }}
                    className='border-border bg-card h-10 rounded-xl border px-3 text-sm'
                    autoComplete='off'
                    placeholder={credentialSummary?.maskedValue ?? 'Paste API key'}
                />
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={apiKeyInput.trim().length === 0 || isSavingApiKey || !selectedProviderId}
                    onClick={onSaveApiKey}>
                    {isSavingApiKey ? 'Saving…' : 'Save API Key'}
                </Button>
            </div>

            {credentialSummary?.hasStoredCredential ? (
                <div className='flex flex-wrap items-center gap-2 text-xs'>
                    <span className='text-muted-foreground'>
                        Stored {credentialSummary.credentialSource === 'access_token' ? 'session token' : 'API key'}{' '}
                        {credentialSummary.maskedValue ? `(${credentialSummary.maskedValue})` : ''}
                    </span>
                    <Button
                        type='button'
                        size='sm'
                        variant='ghost'
                        onClick={() => {
                            if (isCredentialVisible) {
                                onHideStoredCredential();
                                return;
                            }

                            void onRevealStoredCredential();
                        }}>
                        {isCredentialVisible ? 'Hide' : 'Reveal'}
                    </Button>
                    <Button
                        type='button'
                        size='sm'
                        variant='ghost'
                        onClick={() => {
                            void onCopyStoredCredential();
                        }}>
                        Copy
                    </Button>
                </div>
            ) : null}

            {credentialActionStatus ? (
                <p className={`text-xs ${credentialActionMessageClassName}`}>{credentialActionStatus.message}</p>
            ) : null}

            {apiKeyCta ? (
                <Button size='sm' variant='ghost' asChild>
                    <a href={apiKeyCta.url} target='_blank' rel='noreferrer'>
                        {apiKeyCta.label}
                        <ExternalLink className='h-3.5 w-3.5' />
                    </a>
                </Button>
            ) : null}
        </div>
    );
}

function propsCredentialActionToneToClassName(tone: ProviderCredentialActionStatus['tone'] | undefined): string {
    return tone === 'error' ? 'text-destructive' : 'text-muted-foreground';
}

export function ProviderCredentialSection(props: ProviderCredentialSectionProps) {
    if (!props.canUseApiKey) {
        return null;
    }

    if (props.isKilo) {
        return (
            <details className='border-border/70 bg-background/75 rounded-[24px] border p-4'>
                <summary className='cursor-pointer list-none text-sm font-semibold'>Advanced API key access</summary>
                <div className='mt-3'>
                    <ApiKeyField
                        {...props}
                        compactIntro='Keep this for manual or support-driven setups. The normal Kilo path is browser login.'
                    />
                </div>
            </details>
        );
    }

    return (
        <ApiKeyField
            {...props}
            compactIntro='Use an API key when you want direct token-based access instead of an interactive login.'
        />
    );
}
