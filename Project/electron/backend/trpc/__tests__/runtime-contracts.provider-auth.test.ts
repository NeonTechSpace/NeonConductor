import { describe, expect, it, vi } from 'vitest';

import { getPersistence } from '@/app/backend/persistence/db';
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

        const prerequisites = await caller.provider.getCloudSessionPrerequisites({
            profileId,
            providerId: 'kilo',
        });
        expect(prerequisites.prerequisites).toMatchObject({
            providerId: 'kilo',
            hasStoredCredential: true,
            blockers: [],
            canBrowseRemoteSessions: true,
            canContinueRemoteSessions: true,
            scope: {
                scopeKind: 'organization',
                remoteScopeKey: 'org_kilo',
                organizationId: 'org_kilo',
            },
        });

        const refreshed = await caller.provider.refreshAccountContext({
            profileId,
            providerId: 'kilo',
        });
        expect(refreshed.prerequisites.canBrowseRemoteSessions).toBe(true);
    });

    it('blocks kilo cloud-session prerequisites when authentication or selected organization state is incomplete', async () => {
        const caller = createCaller();

        const loggedOut = await caller.provider.getCloudSessionPrerequisites({
            profileId,
            providerId: 'kilo',
        });
        expect(loggedOut.prerequisites.blockers).toEqual(
            expect.arrayContaining(['auth_required', 'credential_required', 'account_context_required'])
        );

        vi.stubGlobal(
            'fetch',
            vi.fn((url: string, init?: RequestInit) => {
                const headers = (init?.headers ?? {}) as Record<string, string>;
                const organizationId = headers['X-KiloCode-OrganizationId'] ?? null;

                if (url.endsWith('/api/profile')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: {
                                id: 'acct_missing_org',
                                displayName: 'Neon User',
                                emailMasked: 'n***@example.com',
                                organizations: [
                                    {
                                        organization_id: 'org_available',
                                        name: 'Available Org',
                                        is_active: organizationId !== 'org_missing',
                                        entitlement: {},
                                    },
                                ],
                            },
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
                                balance: 2,
                                currency: 'USD',
                            },
                        }),
                    });
                }

                if (url.endsWith('/api/defaults') || url.endsWith('/api/organizations/org_missing/defaults')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: {},
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

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'kilo',
            apiKey: 'kilo-api-key',
        });
        expect(configured.success).toBe(true);

        const { sqlite } = getPersistence();
        sqlite
            .prepare(`UPDATE provider_auth_states SET auth_state = ?, account_id = ?, organization_id = ? WHERE profile_id = ? AND provider_id = ?`)
            .run('authenticated', 'acct_missing_org', 'org_missing', profileId, 'kilo');

        const refreshed = await caller.provider.refreshAccountContext({
            profileId,
            providerId: 'kilo',
        });
        expect(refreshed.prerequisites.blockers).toContain('organization_unavailable');
        expect(refreshed.prerequisites.canBrowseRemoteSessions).toBe(false);
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
