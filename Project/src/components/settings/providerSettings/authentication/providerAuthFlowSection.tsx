import { ExternalLink } from 'lucide-react';

import { Button } from '@/web/components/ui/button';

interface ProviderAuthFlowSectionProps {
    isKilo: boolean;
    isAuthenticated: boolean;
    methods: string[];
    activeUserCode: string | undefined;
    activeVerificationUri: string | undefined;
    credentialLabel: string;
    isStartingAuth: boolean;
    isPollingAuth: boolean;
    isCancellingAuth: boolean;
    isOpeningVerificationPage: boolean;
    onStartOAuthDevice: () => void;
    onStartDeviceCode: () => void;
    onPollNow: () => void;
    onCancelFlow: () => void;
    onOpenVerificationPage: () => void;
}

export function ProviderAuthFlowSection({
    isKilo,
    isAuthenticated,
    methods,
    activeUserCode,
    activeVerificationUri,
    credentialLabel,
    isStartingAuth,
    isPollingAuth,
    isCancellingAuth,
    isOpeningVerificationPage,
    onStartOAuthDevice,
    onStartDeviceCode,
    onPollNow,
    onCancelFlow,
    onOpenVerificationPage,
}: ProviderAuthFlowSectionProps) {
    const canStartDeviceCode = methods.includes('device_code');
    const canStartOAuthDevice = methods.includes('oauth_device');
    const hasActiveFlow = Boolean(activeUserCode || activeVerificationUri);

    if (isKilo) {
        return (
            <div className='border-primary/20 bg-primary/5 space-y-4 rounded-[24px] border p-4'>
                {isAuthenticated && !hasActiveFlow ? (
                    <div className='border-border/70 bg-background/80 rounded-2xl border p-4'>
                        <p className='text-sm font-semibold'>Kilo connected</p>
                        <p className='text-muted-foreground mt-1 text-xs leading-5'>
                            {credentialLabel} Default model selection is ready immediately, and the catalog refreshes
                            automatically when needed.
                        </p>
                    </div>
                ) : (
                    <>
                        <div className='space-y-1'>
                            <p className='text-sm font-semibold'>Sign in with Kilo</p>
                            <p className='text-muted-foreground text-xs leading-5'>
                                Press the login button and finish the authorization in your browser. Neon Conductor
                                keeps the account session and syncs your Kilo account context after approval.
                            </p>
                        </div>

                        <div className='flex flex-wrap gap-2'>
                            {canStartDeviceCode ? (
                                <Button type='button' size='sm' disabled={isStartingAuth} onClick={onStartDeviceCode}>
                                    {isStartingAuth ? 'Opening browser…' : 'Log In to Kilo'}
                                </Button>
                            ) : null}
                            {activeVerificationUri ? (
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
                    </>
                )}

                {hasActiveFlow ? (
                    <div className='border-border/70 bg-background/80 rounded-2xl border p-4'>
                        <p className='text-sm font-semibold'>Authorization in progress</p>
                        <p className='text-muted-foreground mt-1 text-xs leading-5'>
                            Enter code <span className='text-foreground font-semibold'>{activeUserCode ?? '-'}</span> in
                            the Kilo website, then return here. Polling continues in the background.
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
        );
    }

    return (
        <div className='border-border/70 bg-background/75 space-y-3 rounded-2xl border p-4'>
            <div className='space-y-1'>
                <p className='text-sm font-semibold'>Interactive sign-in</p>
                <p className='text-muted-foreground text-xs leading-5'>
                    Use a browser-based auth flow when you want account-backed access and local session reuse.
                </p>
            </div>
            <div className='flex flex-wrap gap-2'>
                {canStartOAuthDevice ? (
                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        disabled={isStartingAuth}
                        onClick={onStartOAuthDevice}>
                        {isStartingAuth ? 'Starting…' : 'Start OAuth Device'}
                    </Button>
                ) : null}
                {canStartDeviceCode ? (
                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        disabled={isStartingAuth}
                        onClick={onStartDeviceCode}>
                        {isStartingAuth ? 'Starting…' : 'Start Device Code'}
                    </Button>
                ) : null}
                {activeVerificationUri ? (
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

            {hasActiveFlow ? (
                <div className='border-border/70 bg-card/80 rounded-xl border p-3'>
                    <p className='text-xs font-semibold'>Auth flow in progress</p>
                    <p className='text-muted-foreground mt-1 text-xs leading-5'>
                        Enter code <span className='text-foreground font-semibold'>{activeUserCode ?? '-'}</span> and
                        confirm in browser.
                    </p>
                    <div className='mt-2 flex flex-wrap gap-2'>
                        <Button type='button' size='sm' variant='outline' disabled={isPollingAuth} onClick={onPollNow}>
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
    );
}
