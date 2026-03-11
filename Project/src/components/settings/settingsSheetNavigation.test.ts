import { describe, expect, it } from 'vitest';

import { getNextSettingsSection } from '@/web/components/settings/settingsSheetNavigation';

describe('settingsSheetNavigation', () => {
    it('moves down through vertical settings tabs', () => {
        expect(
            getNextSettingsSection({
                currentSection: 'kilo',
                key: 'ArrowDown',
            })
        ).toBe('providers');
    });

    it('wraps upward and supports home/end keys', () => {
        expect(
            getNextSettingsSection({
                currentSection: 'kilo',
                key: 'ArrowUp',
            })
        ).toBe('agents');
        expect(
            getNextSettingsSection({
                currentSection: 'context',
                key: 'Home',
            })
        ).toBe('kilo');
        expect(
            getNextSettingsSection({
                currentSection: 'kilo',
                key: 'End',
            })
        ).toBe('agents');
    });

    it('ignores unrelated keys', () => {
        expect(
            getNextSettingsSection({
                currentSection: 'kilo',
                key: 'Enter',
            })
        ).toBeUndefined();
    });
});
