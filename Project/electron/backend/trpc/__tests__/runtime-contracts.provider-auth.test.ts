import { describe, expect, it, vi } from 'vitest';

import {
    createCaller,
    registerRuntimeContractHooks,
    runtimeContractProfileId,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: provider auth flows', () => {
    const profileId = runtimeContractProfileId;

    it('supports provider auth control plane and static catalog sync remains explicit', async () => {
        const caller = createCaller();

        const before = await caller.provider.getAuthState({ profileId, providerId: 'openai' });
        expect(before.found).toBe(true);
        expect(before.state.authState).toBe('logged_out');

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'test-openai-key',
        });
        expect(configured.success).toBe(true);
        if (!configured.success) {
            throw new Error('Expected setApiKey to succeed.');
        }
        expect(configured.state.authState).toBe('configured');

        const snapshotAfterSet = await caller.runtime.getDiagnosticSnapshot({ profileId });
        expect(snapshotAfterSet.providerSecrets.some((providerSecret) => providerSecret.providerId === 'openai')).toBe(
            true
        );

        const syncResult = await caller.provider.syncCatalog({
            profileId,
            providerId: 'openai',
        });
        expect(syncResult.ok).toBe(true);
        expect(syncResult.status === 'synced' || syncResult.status === 'unchanged').toBe(true);
        expect(syncResult.modelCount).toBeGreaterThan(0);

        const cleared = await caller.provider.clearAuth({
            profileId,
            providerId: 'openai',
        });
        expect(cleared.success).toBe(true);
        if (!cleared.success) {
            throw new Error('Expected clearAuth to succeed.');
        }
        expect(cleared.authState.authState).toBe('logged_out');

        const snapshotAfterClear = await caller.runtime.getDiagnosticSnapshot({ profileId });
        expect(
            snapshotAfterClear.providerSecrets.some((providerSecret) => providerSecret.providerId === 'openai')
        ).toBe(false);
    });

    it('persists kilo browser auth and exposes the stored session token through provider credential queries', async () => {
        const caller = createCaller();
        vi.stubGlobal(
            'fetch',
            vi.fn((url: string) => {
                if (url.endsWith('/api/device-auth/codes')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            result: {
                                deviceAuth: {
                                    deviceCode: 'kilo-device-code-1',
                                    userCode: 'KILO-CODE',
                                    verificationUrl: 'https://kilo.example/verify',
                                    poll_interval_seconds: 5,
                                    expiresIn: 900,
                                },
                            },
                        }),
                    });
                }

                if (url.endsWith('/api/device-auth/codes/kilo-device-code-1')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: {
                                status: 'approved',
                                accessToken: 'kilo-session-token',
                                refreshToken: 'kilo-refresh-token',
                                expiresAt: '2026-03-11T16:00:00.000Z',
                                accountId: 'acct_kilo',
                                organizationId: 'org_kilo',
                            },
                        }),
                    });
                }

                if (url.endsWith('/api/profile')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: {
                                id: 'acct_kilo',
                                displayName: 'Neon User',
                                emailMasked: 'n***@example.com',
                                organizations: [
                                    {
                                        organization_id: 'org_kilo',
                                        name: 'Kilo Org',
                                        is_active: true,
                                        entitlement: {},
                                    },
                                ],
                            },
                        }),
                    });
                }

                if (url.endsWith('/api/defaults') || url.endsWith('/api/organizations/org_kilo/defaults')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: {},
                        }),
                    });
                }

                if (url.endsWith('/api/profile/balance')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: {
                                balance: 18.42,
                                currency: 'USD',
                            },
                        }),
                    });
                }

                return Promise.resolve({
                    ok: false,
                    status: 404,
                    statusText: 'Not Found',
                    json: () => ({}),
                });
            })
        );

        const started = await caller.provider.startAuth({
            profileId,
            providerId: 'kilo',
            method: 'device_code',
        });
        expect(started.flow.flowType).toBe('device_code');
        expect(started.userCode).toBe('KILO-CODE');

        const polled = await caller.provider.pollAuth({
            profileId,
            providerId: 'kilo',
            flowId: started.flow.id,
        });
        expect(polled.flow.status).toBe('completed');
        expect(polled.state.authState).toBe('authenticated');

        const credentialSummary = await caller.provider.getCredentialSummary({
            profileId,
            providerId: 'kilo',
        });
        expect(credentialSummary.credential).toMatchObject({
            providerId: 'kilo',
            hasStoredCredential: true,
            credentialSource: 'access_token',
        });
        expect(credentialSummary.credential.maskedValue).toContain('••••');

        const credentialValue = await caller.provider.getCredentialValue({
            profileId,
            providerId: 'kilo',
        });
        expect(credentialValue.credential?.value).toBe('kilo-session-token');

        const accountContext = await caller.provider.getAccountContext({
            profileId,
            providerId: 'kilo',
        });
        expect(accountContext.kiloAccountContext?.displayName).toBe('Neon User');
        expect(accountContext.kiloAccountContext?.organizations.some((organization) => organization.isActive)).toBe(
            true
        );
    });

    it('persists kilo identity from nested user payloads even when defaults sync fails', async () => {
        const caller = createCaller();
        vi.stubGlobal(
            'fetch',
            vi.fn((url: string) => {
                if (url.endsWith('/api/device-auth/codes')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            result: {
                                deviceAuth: {
                                    deviceCode: 'kilo-device-code-nested',
                                    userCode: 'KILO-NESTED',
                                    verificationUrl: 'https://kilo.example/verify',
                                    poll_interval_seconds: 5,
                                    expiresIn: 900,
                                },
                            },
                        }),
                    });
                }

                if (url.endsWith('/api/device-auth/codes/kilo-device-code-nested')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: {
                                status: 'approved',
                                accessToken: 'kilo-session-token-nested',
                                refreshToken: 'kilo-refresh-token-nested',
                                expiresAt: '2026-03-11T16:00:00.000Z',
                                accountId: 'acct_nested',
                                organizationId: 'org_nested',
                            },
                        }),
                    });
                }

                if (url.endsWith('/api/profile')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: {
                                user: {
                                    id: 'acct_nested',
                                    name: 'Nested User',
                                    email: 'nested@example.com',
                                },
                                organizations: [
                                    {
                                        organization_id: 'org_nested',
                                        name: 'Nested Org',
                                        is_active: true,
                                        entitlement: {},
                                    },
                                ],
                            },
                        }),
                    });
                }

                if (url.endsWith('/api/defaults') || url.endsWith('/api/organizations/org_nested/defaults')) {
                    return Promise.resolve({
                        ok: false,
                        status: 500,
                        statusText: 'Server Error',
                        json: () => ({
                            error: 'defaults unavailable',
                        }),
                    });
                }

                if (url.endsWith('/api/profile/balance')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: {
                                balance: 7.25,
                                currency: 'USD',
                            },
                        }),
                    });
                }

                return Promise.resolve({
                    ok: false,
                    status: 404,
                    statusText: 'Not Found',
                    json: () => ({}),
                });
            })
        );

        const started = await caller.provider.startAuth({
            profileId,
            providerId: 'kilo',
            method: 'device_code',
        });
        expect(started.flow.flowType).toBe('device_code');
        expect(started.userCode).toBe('KILO-NESTED');

        const polled = await caller.provider.pollAuth({
            profileId,
            providerId: 'kilo',
            flowId: started.flow.id,
        });
        expect(polled.flow.status).toBe('completed');
        expect(polled.state.authState).toBe('authenticated');

        const accountContext = await caller.provider.getAccountContext({
            profileId,
            providerId: 'kilo',
        });
        expect(accountContext.kiloAccountContext?.displayName).toBe('Nested User');
        expect(accountContext.kiloAccountContext?.emailMasked).toBe('nested@example.com');
        expect(accountContext.kiloAccountContext?.balance?.amount).toBe(7.25);
        expect(accountContext.kiloAccountContext?.organizations.some((organization) => organization.isActive)).toBe(
            true
        );
    });
});
