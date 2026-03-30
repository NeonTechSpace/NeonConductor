import { describe, expect, it, vi } from 'vitest';

import { createProviderProfileNormalizationGate } from '@/app/backend/providers/service/providerProfileNormalizationGate';

describe('providerProfileNormalizationGate', () => {
    it('dedupes concurrent normalization for the same profile', async () => {
        let resolveNormalization!: () => void;
        const normalizationPromise = new Promise<void>((resolve) => {
            resolveNormalization = resolve;
        });
        const normalizeProfile = vi.fn(() => normalizationPromise);

        const gate = createProviderProfileNormalizationGate(normalizeProfile);
        const first = gate.ensureNormalized('profile_local_default');
        const second = gate.ensureNormalized('profile_local_default');

        expect(normalizeProfile).toHaveBeenCalledTimes(1);

        resolveNormalization();
        await Promise.all([first, second]);
    });

    it('allows a later normalization after the in-flight entry completes', async () => {
        const normalizeProfile = vi.fn().mockResolvedValue(undefined);
        const gate = createProviderProfileNormalizationGate(normalizeProfile);

        await gate.ensureNormalized('profile_local_default');
        await gate.ensureNormalized('profile_local_default');

        expect(normalizeProfile).toHaveBeenCalledTimes(2);
    });
});
