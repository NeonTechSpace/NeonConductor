import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { KiloCloudSessionReadinessSection } from '@/web/components/settings/kiloSettingsSections';
import {
    shouldAttemptKiloInitialCatalogBootstrap,
    shouldResetKiloInitialCatalogBootstrapAttempt,
} from '@/web/components/settings/providerSettings/hooks/useKiloInitialCatalogBootstrap';
import type { KiloSettingsControllerState } from '@/web/components/settings/providerSettings/hooks/useKiloSettingsController';
import { PrivacyContext } from '@/web/lib/privacy/privacyContext';

function renderWithPrivacy(element: Parameters<typeof renderToStaticMarkup>[0]) {
    return renderToStaticMarkup(
        <PrivacyContext.Provider
            value={{
                enabled: false,
                setEnabled: () => {},
                toggleEnabled: () => {},
                redactValue: (value) => value,
            }}>
            {element}
        </PrivacyContext.Provider>
    );
}

describe('Kilo initial catalog bootstrap contract', () => {
    it('attempts one automatic sync for an authenticated empty catalog and does not retry for the same mounted identity', () => {
        let hasAttemptedBootstrap = false;

        const shouldAttemptOnFirstEligibleRender = shouldAttemptKiloInitialCatalogBootstrap({
            selectedProviderId: 'kilo',
            effectiveAuthState: 'authenticated',
            modelOptionCount: 0,
            isSyncingCatalog: false,
            hasAttemptedBootstrap,
        });
        expect(shouldAttemptOnFirstEligibleRender).toBe(true);

        hasAttemptedBootstrap = true;

        const shouldAttemptAgainAfterFailure = shouldAttemptKiloInitialCatalogBootstrap({
            selectedProviderId: 'kilo',
            effectiveAuthState: 'authenticated',
            modelOptionCount: 0,
            isSyncingCatalog: false,
            hasAttemptedBootstrap,
        });
        expect(shouldAttemptAgainAfterFailure).toBe(false);
    });

    it('re-enables automatic bootstrap after auth leaves eligibility and becomes authenticated again', () => {
        expect(shouldResetKiloInitialCatalogBootstrapAttempt('logged_out')).toBe(true);

        const shouldAttemptAfterAuthReturns = shouldAttemptKiloInitialCatalogBootstrap({
            selectedProviderId: 'kilo',
            effectiveAuthState: 'authenticated',
            modelOptionCount: 0,
            isSyncingCatalog: false,
            hasAttemptedBootstrap: false,
        });
        expect(shouldAttemptAfterAuthReturns).toBe(true);
    });

    it('re-enables automatic bootstrap for a new profile mount', () => {
        const shouldAttemptForNewProfileMount = shouldAttemptKiloInitialCatalogBootstrap({
            selectedProviderId: 'kilo',
            effectiveAuthState: 'authenticated',
            modelOptionCount: 0,
            isSyncingCatalog: false,
            hasAttemptedBootstrap: false,
        });

        expect(shouldAttemptForNewProfileMount).toBe(true);
    });

    it('stays ineligible when sync is already running, models exist, or the provider is not kilo', () => {
        expect(
            shouldAttemptKiloInitialCatalogBootstrap({
                selectedProviderId: 'kilo',
                effectiveAuthState: 'authenticated',
                modelOptionCount: 0,
                isSyncingCatalog: true,
                hasAttemptedBootstrap: false,
            })
        ).toBe(false);

        expect(
            shouldAttemptKiloInitialCatalogBootstrap({
                selectedProviderId: 'kilo',
                effectiveAuthState: 'authenticated',
                modelOptionCount: 2,
                isSyncingCatalog: false,
                hasAttemptedBootstrap: false,
            })
        ).toBe(false);

        expect(
            shouldAttemptKiloInitialCatalogBootstrap({
                selectedProviderId: 'openai',
                effectiveAuthState: 'authenticated',
                modelOptionCount: 0,
                isSyncingCatalog: false,
                hasAttemptedBootstrap: false,
            })
        ).toBe(false);
    });

    it('renders Kilo cloud-session readiness and blocker states', () => {
        const controller = {
            effectiveAuthState: 'authenticated',
            kilo: {
                isRefreshingAccountContext: false,
                isLoadingCloudSessionPrerequisites: false,
                refreshAccountContext: async () => {},
                cloudSessionPrerequisites: {
                    profileId: 'profile_default',
                    providerId: 'kilo',
                    authState: 'authenticated',
                    hasStoredCredential: true,
                    accountContext: {
                        profileId: 'profile_default',
                        accountId: 'acct_123',
                        displayName: 'Neon User',
                        emailMasked: 'n***@example.com',
                        authState: 'authenticated',
                        organizations: [],
                        updatedAt: '2026-04-28T12:00:00.000Z',
                    },
                    scope: {
                        scopeKind: 'account',
                        remoteScopeKey: 'acct_123',
                        accountId: 'acct_123',
                    },
                    blockers: ['organization_unavailable'],
                    canBrowseRemoteSessions: false,
                    canContinueRemoteSessions: false,
                },
            },
        } as unknown as KiloSettingsControllerState;

        const html = renderWithPrivacy(<KiloCloudSessionReadinessSection controller={controller} />);

        expect(html).toContain('Cloud Sessions');
        expect(html).toContain('Blocked');
        expect(html).toContain('Available');
        expect(html).toContain('The selected organization is not present in the latest Kilo account snapshot.');
    });
});
