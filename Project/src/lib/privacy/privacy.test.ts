import { describe, expect, it, vi } from 'vitest';

import {
    applyPrivacyMode,
    persistPrivacyMode,
    readStoredPrivacyMode,
    redactSensitiveValue,
} from '@/web/lib/privacy/privacy';

describe('privacy helpers', () => {
    it('reads and persists privacy mode from local storage', () => {
        const storage = new Map<string, string>();
        const dataset: Record<string, string> = {};

        vi.stubGlobal('window', {
            localStorage: {
                getItem: (key: string) => storage.get(key) ?? null,
                setItem: (key: string, value: string) => {
                    storage.set(key, value);
                },
            },
        });
        vi.stubGlobal('document', {
            documentElement: {
                dataset,
            },
        });

        expect(readStoredPrivacyMode().enabled).toBe(false);

        persistPrivacyMode({ enabled: true });
        expect(readStoredPrivacyMode().enabled).toBe(true);

        applyPrivacyMode({ enabled: true });
        expect(dataset['privacyMode']).toBe('on');

        vi.unstubAllGlobals();
    });

    it('returns deterministic placeholders for the same sensitive value', () => {
        expect(redactSensitiveValue('alice@example.com', 'email')).toBe(
            redactSensitiveValue('alice@example.com', 'email')
        );
        expect(redactSensitiveValue('org_primary', 'account_id')).toBe(
            redactSensitiveValue('org_primary', 'account_id')
        );
        expect(redactSensitiveValue('Team Mercury', 'organization')).not.toBe('');
        expect(redactSensitiveValue('245.12 USD', 'balance')).toBe(redactSensitiveValue('245.12 USD', 'balance'));
    });
});
