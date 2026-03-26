import { describe, expect, it, vi } from 'vitest';

import {
    applyHydratedKiloStoredCredential,
    buildProviderAuthenticationDraftKey,
    resolveCopyStoredCredentialAction,
    resolveRevealStoredCredentialAction,
    shouldHydrateKiloStoredCredential,
} from '@/web/components/settings/providerSettings/authenticationSection';

describe('provider authentication draft helpers', () => {
    it('builds a fresh draft key from provider, connection profile, and base URL override identity', () => {
        expect(
            buildProviderAuthenticationDraftKey({
                selectedProviderId: 'openai',
                connectionProfileValue: 'default',
                baseUrlOverrideValue: 'https://api.openai.com/v1',
            })
        ).toBe('openai:default:https://api.openai.com/v1');
    });

    it('hydrates the stored Kilo credential only when the draft is still empty', () => {
        expect(
            shouldHydrateKiloStoredCredential({
                selectedProviderId: 'kilo',
                credentialSource: 'access_token',
                hasLoadedStoredCredential: false,
                apiKeyInput: '',
            })
        ).toBe(true);

        expect(
            shouldHydrateKiloStoredCredential({
                selectedProviderId: 'kilo',
                credentialSource: 'access_token',
                hasLoadedStoredCredential: false,
                apiKeyInput: 'manual-user-entry',
            })
        ).toBe(false);
    });

    it('does not overwrite a user draft when stored credential hydration resolves late', () => {
        expect(
            applyHydratedKiloStoredCredential({
                draftState: {
                    apiKeyInput: 'manual-user-entry',
                    baseUrlOverrideInput: '',
                    isCredentialVisible: false,
                    hasLoadedStoredCredential: false,
                },
                selectedProviderId: 'kilo',
                credentialSource: 'access_token',
                credentialValue: 'stored-kilo-token',
            })
        ).toEqual({
            apiKeyInput: 'manual-user-entry',
            baseUrlOverrideInput: '',
            isCredentialVisible: false,
            hasLoadedStoredCredential: false,
        });
    });

    it('applies the stored Kilo credential when the untouched draft is still eligible', () => {
        expect(
            applyHydratedKiloStoredCredential({
                draftState: {
                    apiKeyInput: '',
                    baseUrlOverrideInput: '',
                    isCredentialVisible: false,
                    hasLoadedStoredCredential: false,
                },
                selectedProviderId: 'kilo',
                credentialSource: 'access_token',
                credentialValue: 'stored-kilo-token',
            })
        ).toEqual({
            apiKeyInput: 'stored-kilo-token',
            baseUrlOverrideInput: '',
            isCredentialVisible: false,
            hasLoadedStoredCredential: true,
        });
    });

    it('reveals the stored credential when loading succeeds', async () => {
        await expect(
            resolveRevealStoredCredentialAction({
                draftState: {
                    apiKeyInput: '',
                    baseUrlOverrideInput: '',
                    isCredentialVisible: false,
                    hasLoadedStoredCredential: false,
                },
                hasStoredCredential: true,
                onLoadStoredCredential: () => Promise.resolve('stored-kilo-token'),
            })
        ).resolves.toEqual({
            draftState: {
                apiKeyInput: 'stored-kilo-token',
                baseUrlOverrideInput: '',
                isCredentialVisible: true,
                hasLoadedStoredCredential: true,
            },
        });
    });

    it('reports a local reveal error when credential loading rejects', async () => {
        await expect(
            resolveRevealStoredCredentialAction({
                draftState: {
                    apiKeyInput: '',
                    baseUrlOverrideInput: '',
                    isCredentialVisible: false,
                    hasLoadedStoredCredential: false,
                },
                hasStoredCredential: true,
                onLoadStoredCredential: () => Promise.reject(new Error('load failed')),
            })
        ).resolves.toEqual({
            status: {
                tone: 'error',
                message: 'Failed to reveal the stored credential.',
            },
        });
    });

    it('copies the loaded credential and reports success', async () => {
        const writeText = vi.fn(() => Promise.resolve(undefined));

        await expect(
            resolveCopyStoredCredentialAction({
                draftState: {
                    apiKeyInput: '',
                    baseUrlOverrideInput: '',
                    isCredentialVisible: false,
                    hasLoadedStoredCredential: false,
                },
                onLoadStoredCredential: () => Promise.resolve('stored-kilo-token'),
                writeText,
            })
        ).resolves.toEqual({
            draftState: {
                apiKeyInput: '',
                baseUrlOverrideInput: '',
                isCredentialVisible: false,
                hasLoadedStoredCredential: true,
            },
            status: {
                tone: 'success',
                message: 'Credential copied.',
            },
        });
        expect(writeText).toHaveBeenCalledWith('stored-kilo-token');
    });

    it('reports a local copy error when clipboard write rejects', async () => {
        await expect(
            resolveCopyStoredCredentialAction({
                draftState: {
                    apiKeyInput: 'stored-kilo-token',
                    baseUrlOverrideInput: '',
                    isCredentialVisible: true,
                    hasLoadedStoredCredential: true,
                },
                onLoadStoredCredential: () => Promise.resolve(undefined),
                writeText: () => Promise.reject(new Error('clipboard denied')),
            })
        ).resolves.toEqual({
            status: {
                tone: 'error',
                message: 'Failed to copy the stored credential.',
            },
        });
    });
});

