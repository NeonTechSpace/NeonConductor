import { describe, expect, it } from 'vitest';

import {
    shouldAttemptKiloInitialCatalogBootstrap,
    shouldResetKiloInitialCatalogBootstrapAttempt,
} from '@/web/components/settings/providerSettings/hooks/useKiloInitialCatalogBootstrap';

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
});
