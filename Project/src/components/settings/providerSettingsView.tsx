import { ExternalLink, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/web/components/ui/button';
import { trpc } from '@/web/trpc/client';

import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';

interface ActiveAuthFlow {
    providerId: RuntimeProviderId;
    flowId: string;
    userCode?: string;
    verificationUri?: string;
    pollAfterSeconds: number;
}

function isProviderId(value: string | undefined): value is RuntimeProviderId {
    return value === 'kilo' || value === 'openai';
}

function methodLabel(method: string): string {
    if (method === 'api_key') return 'API key';
    if (method === 'device_code') return 'Device code';
    if (method === 'oauth_device') return 'OAuth device';
    if (method === 'oauth_pkce') return 'OAuth PKCE';
    return method;
}

function formatMetric(value: number | undefined, fallback = '-'): string {
    if (value === undefined || !Number.isFinite(value)) {
        return fallback;
    }

    return String(value);
}

interface ProviderSettingsViewProps {
    profileId: string;
}

export function ProviderSettingsView({ profileId }: ProviderSettingsViewProps) {
    const providersQuery = trpc.provider.listProviders.useQuery({ profileId }, { refetchOnWindowFocus: false });
    const authMethodsQuery = trpc.provider.listAuthMethods.useQuery({ profileId }, { refetchOnWindowFocus: false });
    const snapshotQuery = trpc.runtime.getSnapshot.useQuery({ profileId }, { refetchOnWindowFocus: false });

    const providers = providersQuery.data?.providers ?? [];
    const defaults = snapshotQuery.data?.defaults;

    const [selectedProviderId, setSelectedProviderId] = useState<RuntimeProviderId | undefined>(undefined);
    const [selectedModelId, setSelectedModelId] = useState<string>('');
    const [apiKeyInput, setApiKeyInput] = useState('');
    const [activeAuthFlow, setActiveAuthFlow] = useState<ActiveAuthFlow | undefined>(undefined);
    const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined);

    useEffect(() => {
        setActiveAuthFlow(undefined);
        setApiKeyInput('');
        setStatusMessage(undefined);
    }, [profileId]);

    useEffect(() => {
        if (selectedProviderId && providers.some((provider) => provider.id === selectedProviderId)) {
            return;
        }

        const fallbackProvider = providers.find((provider) => provider.isDefault)?.id ?? providers[0]?.id;
        if (fallbackProvider) {
            setSelectedProviderId(fallbackProvider);
        }
    }, [providers, selectedProviderId]);

    const selectedProvider = providers.find((provider) => provider.id === selectedProviderId);

    const listModelsQuery = trpc.provider.listModels.useQuery(
        {
            profileId,
            providerId: selectedProviderId ?? 'openai',
        },
        {
            enabled: Boolean(selectedProviderId),
            refetchOnWindowFocus: false,
        }
    );

    const authStateQuery = trpc.provider.getAuthState.useQuery(
        {
            profileId,
            providerId: selectedProviderId ?? 'openai',
        },
        {
            enabled: Boolean(selectedProviderId),
            refetchOnWindowFocus: false,
        }
    );

    const accountContextQuery = trpc.provider.getAccountContext.useQuery(
        {
            profileId,
            providerId: selectedProviderId ?? 'kilo',
        },
        {
            enabled: selectedProviderId === 'kilo',
            refetchOnWindowFocus: false,
        }
    );

    const setDefaultMutation = trpc.provider.setDefault.useMutation({
        onSuccess: (result) => {
            if (!result.success) {
                setStatusMessage(result.reason === 'model_not_found' ? 'Selected model is not available.' : 'Default update failed.');
                return;
            }

            setStatusMessage('Default provider/model updated.');
            void providersQuery.refetch();
            void snapshotQuery.refetch();
        },
    });

    const setApiKeyMutation = trpc.provider.setApiKey.useMutation({
        onSuccess: (result) => {
            if (!result.success) {
                setStatusMessage('Provider not found.');
                return;
            }

            setApiKeyInput('');
            setStatusMessage('API key saved. Provider is ready.');
            void providersQuery.refetch();
            void authStateQuery.refetch();
        },
    });

    const syncCatalogMutation = trpc.provider.syncCatalog.useMutation({
        onSuccess: (result) => {
            if (!result.ok) {
                setStatusMessage(result.reason ? `Catalog sync failed: ${result.reason}` : 'Catalog sync failed.');
                return;
            }

            setStatusMessage(`Catalog synced (${String(result.modelCount)} models).`);
            void listModelsQuery.refetch();
            void snapshotQuery.refetch();
        },
    });

    const startAuthMutation = trpc.provider.startAuth.useMutation({
        onSuccess: (result, variables) => {
            setStatusMessage(`${methodLabel(variables.method)} flow started.`);
            setActiveAuthFlow({
                providerId: variables.providerId,
                flowId: result.flow.id,
                ...(result.userCode ? { userCode: result.userCode } : {}),
                ...(result.verificationUri ? { verificationUri: result.verificationUri } : {}),
                pollAfterSeconds: result.pollAfterSeconds ?? 5,
            });
            void authStateQuery.refetch();
            void providersQuery.refetch();
        },
    });

    const pollAuthMutation = trpc.provider.pollAuth.useMutation({
        onSuccess: (result) => {
            if (result.flow.status === 'pending') {
                setStatusMessage('Waiting for authorization confirmation...');
                return;
            }

            setStatusMessage(`Auth flow ${result.flow.status}. State: ${result.state.authState}.`);
            setActiveAuthFlow(undefined);
            void authStateQuery.refetch();
            void providersQuery.refetch();
            if (selectedProviderId === 'kilo') {
                void accountContextQuery.refetch();
            }
        },
    });

    const cancelAuthMutation = trpc.provider.cancelAuth.useMutation({
        onSuccess: () => {
            setStatusMessage('Auth flow cancelled.');
            setActiveAuthFlow(undefined);
            void authStateQuery.refetch();
            void providersQuery.refetch();
        },
    });

    useEffect(() => {
        if (!activeAuthFlow || pollAuthMutation.isPending) {
            return;
        }

        const timer = window.setTimeout(() => {
            void pollAuthMutation.mutateAsync({
                profileId,
                providerId: activeAuthFlow.providerId,
                flowId: activeAuthFlow.flowId,
            });
        }, Math.max(1, activeAuthFlow.pollAfterSeconds) * 1000);

        return () => {
            window.clearTimeout(timer);
        };
    }, [activeAuthFlow, pollAuthMutation, profileId]);

    const authMethodMap = useMemo(() => {
        const map = new Map<RuntimeProviderId, string[]>();
        for (const entry of authMethodsQuery.data?.methods ?? []) {
            if (isProviderId(entry.providerId)) {
                map.set(entry.providerId, entry.methods);
            }
        }

        return map;
    }, [authMethodsQuery.data?.methods]);

    const methods = selectedProviderId ? authMethodMap.get(selectedProviderId) ?? [] : [];
    const models = listModelsQuery.data?.models ?? [];

    useEffect(() => {
        if (!selectedProviderId) {
            return;
        }

        if (selectedModelId && models.some((model) => model.id === selectedModelId)) {
            return;
        }

        if (defaults?.providerId === selectedProviderId && models.some((model) => model.id === defaults.modelId)) {
            setSelectedModelId(defaults.modelId);
            return;
        }

        setSelectedModelId(models[0]?.id ?? '');
    }, [defaults?.modelId, defaults?.providerId, models, selectedModelId, selectedProviderId]);

    const selectedAuthState = authStateQuery.data?.found ? authStateQuery.data.state : undefined;
    const selectedIsDefaultProvider = defaults?.providerId === selectedProviderId;
    const selectedIsDefaultModel = selectedIsDefaultProvider && defaults?.modelId === selectedModelId;

    return (
        <section className='grid min-h-full grid-cols-[260px_1fr]'>
            <aside className='border-border bg-background/40 min-h-0 overflow-y-auto border-r p-3'>
                <p className='text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase'>Providers</p>
                <div className='space-y-2'>
                    {providers.map((provider) => (
                        <button
                            key={provider.id}
                            type='button'
                            className={`w-full rounded-md border px-2 py-2 text-left ${
                                provider.id === selectedProviderId
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border bg-card hover:bg-accent'
                            }`}
                            onClick={() => {
                                setStatusMessage(undefined);
                                setSelectedProviderId(provider.id);
                            }}>
                            <p className='text-sm font-medium'>
                                {provider.label} {provider.isDefault ? <span className='text-primary text-xs'>(default)</span> : null}
                            </p>
                            <p className='text-muted-foreground text-xs'>
                                auth: {provider.authState} ({provider.authMethod})
                            </p>
                        </button>
                    ))}
                </div>
            </aside>

            <div className='min-h-0 overflow-y-auto p-4'>
                {selectedProvider ? (
                    <div className='space-y-5'>
                        <div>
                            <h4 className='text-base font-semibold'>{selectedProvider.label}</h4>
                            <p className='text-muted-foreground text-xs'>
                                Local runtime works with any configured provider. Kilo login is only required for Kilo-specific extras.
                            </p>
                            {statusMessage ? <p className='text-primary mt-2 text-xs'>{statusMessage}</p> : null}
                        </div>

                        <section className='space-y-2'>
                            <p className='text-sm font-semibold'>Default Model</p>
                            <div className='grid grid-cols-[1fr_auto_auto] gap-2'>
                                <select
                                    value={selectedModelId}
                                    onChange={(event) => {
                                        setSelectedModelId(event.target.value);
                                    }}
                                    className='border-border bg-background h-9 rounded-md border px-2 text-sm'
                                    disabled={models.length === 0}>
                                    {models.map((model) => (
                                        <option key={model.id} value={model.id}>
                                            {model.label}
                                            {selectedProvider.id === 'kilo'
                                                ? ` · price ${formatMetric(model.price)} · latency ${formatMetric(model.latency)} · tps ${formatMetric(model.tps)}`
                                                : ''}
                                        </option>
                                    ))}
                                </select>
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='outline'
                                    disabled={!selectedModelId || setDefaultMutation.isPending || selectedIsDefaultModel}
                                    onClick={() => {
                                        if (!selectedProviderId || !selectedModelId) {
                                            return;
                                        }

                                        void setDefaultMutation.mutateAsync({
                                            profileId,
                                            providerId: selectedProviderId,
                                            modelId: selectedModelId,
                                        });
                                    }}>
                                    {selectedIsDefaultModel ? 'Default' : 'Set Default'}
                                </Button>
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='outline'
                                    disabled={syncCatalogMutation.isPending || !selectedProviderId}
                                    onClick={() => {
                                        if (!selectedProviderId) {
                                            return;
                                        }

                                        void syncCatalogMutation.mutateAsync({
                                            profileId,
                                            providerId: selectedProviderId,
                                            force: true,
                                        });
                                    }}>
                                    <RefreshCw className='h-3.5 w-3.5' />
                                    Sync
                                </Button>
                            </div>
                        </section>

                        <section className='space-y-2'>
                            <p className='text-sm font-semibold'>Authentication</p>
                            <p className='text-muted-foreground text-xs'>
                                State: {selectedAuthState?.authState ?? selectedProvider.authState} ({selectedAuthState?.authMethod ?? selectedProvider.authMethod})
                            </p>

                            {methods.includes('api_key') ? (
                                <div className='grid grid-cols-[1fr_auto] gap-2'>
                                    <input
                                        type='password'
                                        value={apiKeyInput}
                                        onChange={(event) => {
                                            setApiKeyInput(event.target.value);
                                        }}
                                        className='border-border bg-background h-9 rounded-md border px-2 text-sm'
                                        placeholder='Paste API key'
                                    />
                                    <Button
                                        type='button'
                                        size='sm'
                                        variant='outline'
                                        disabled={apiKeyInput.trim().length === 0 || setApiKeyMutation.isPending || !selectedProviderId}
                                        onClick={() => {
                                            if (!selectedProviderId) {
                                                return;
                                            }

                                            void setApiKeyMutation.mutateAsync({
                                                profileId,
                                                providerId: selectedProviderId,
                                                apiKey: apiKeyInput.trim(),
                                            });
                                        }}>
                                        Save Key
                                    </Button>
                                </div>
                            ) : null}

                            <div className='flex flex-wrap gap-2'>
                                {methods.includes('oauth_device') ? (
                                    <Button
                                        type='button'
                                        size='sm'
                                        variant='outline'
                                        disabled={startAuthMutation.isPending || selectedProviderId !== 'openai'}
                                        onClick={() => {
                                            if (!selectedProviderId) {
                                                return;
                                            }

                                            void startAuthMutation.mutateAsync({
                                                profileId,
                                                providerId: selectedProviderId,
                                                method: 'oauth_device',
                                            });
                                        }}>
                                        Start OAuth Device
                                    </Button>
                                ) : null}
                                {methods.includes('device_code') ? (
                                    <Button
                                        type='button'
                                        size='sm'
                                        variant='outline'
                                        disabled={startAuthMutation.isPending || selectedProviderId !== 'kilo'}
                                        onClick={() => {
                                            if (!selectedProviderId) {
                                                return;
                                            }

                                            void startAuthMutation.mutateAsync({
                                                profileId,
                                                providerId: selectedProviderId,
                                                method: 'device_code',
                                            });
                                        }}>
                                        Start Device Code
                                    </Button>
                                ) : null}
                            </div>

                            {activeAuthFlow && activeAuthFlow.providerId === selectedProvider.id ? (
                                <div className='border-border bg-background rounded-md border p-3'>
                                    <p className='text-xs font-semibold'>Auth flow in progress</p>
                                    <p className='text-muted-foreground mt-1 text-xs'>
                                        Enter code <span className='text-foreground font-semibold'>{activeAuthFlow.userCode ?? '-'}</span> and confirm in browser.
                                    </p>
                                    {activeAuthFlow.verificationUri ? (
                                        <a
                                            href={activeAuthFlow.verificationUri}
                                            target='_blank'
                                            rel='noreferrer'
                                            className='text-primary mt-1 inline-flex items-center gap-1 text-xs underline'>
                                            Open verification page
                                            <ExternalLink className='h-3 w-3' />
                                        </a>
                                    ) : null}
                                    <div className='mt-2 flex gap-2'>
                                        <Button
                                            type='button'
                                            size='sm'
                                            variant='outline'
                                            disabled={pollAuthMutation.isPending}
                                            onClick={() => {
                                                void pollAuthMutation.mutateAsync({
                                                    profileId,
                                                    providerId: activeAuthFlow.providerId,
                                                    flowId: activeAuthFlow.flowId,
                                                });
                                            }}>
                                            Poll Now
                                        </Button>
                                        <Button
                                            type='button'
                                            size='sm'
                                            variant='outline'
                                            disabled={cancelAuthMutation.isPending}
                                            onClick={() => {
                                                void cancelAuthMutation.mutateAsync({
                                                    profileId,
                                                    providerId: activeAuthFlow.providerId,
                                                    flowId: activeAuthFlow.flowId,
                                                });
                                            }}>
                                            Cancel
                                        </Button>
                                    </div>
                                </div>
                            ) : null}
                        </section>

                        {selectedProvider.id === 'kilo' ? (
                            <section className='space-y-1'>
                                <p className='text-sm font-semibold'>Kilo Extras</p>
                                <p className='text-muted-foreground text-xs'>
                                    Cloud sessions and marketplace remain Kilo-gated and unlock after Kilo login.
                                </p>
                                <p className='text-muted-foreground text-xs'>
                                    Account state: {accountContextQuery.data?.authState.authState ?? selectedProvider.authState}
                                </p>
                            </section>
                        ) : null}
                    </div>
                ) : (
                    <p className='text-muted-foreground text-sm'>No providers available.</p>
                )}
            </div>
        </section>
    );
}
