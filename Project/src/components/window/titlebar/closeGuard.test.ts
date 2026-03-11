import { describe, expect, it } from 'vitest';

import { getWindowCloseGuardState } from '@/web/components/window/titlebar/closeGuard';

describe('window close guard', () => {
    it('allows immediate close when no update work is active', () => {
        expect(getWindowCloseGuardState(undefined)).toEqual({
            canCloseImmediately: true,
        });
        expect(getWindowCloseGuardState({ phase: 'idle' })).toEqual({
            canCloseImmediately: true,
        });
    });

    it('requires confirmation while an update is checking or downloading', () => {
        expect(getWindowCloseGuardState({ phase: 'checking' })).toMatchObject({
            canCloseImmediately: false,
            closeWarningTitle: 'Update check in progress',
        });
        expect(getWindowCloseGuardState({ phase: 'downloading' })).toMatchObject({
            canCloseImmediately: false,
            closeWarningTitle: 'Update download in progress',
        });
    });

    it('uses install-specific copy when an update is ready to install', () => {
        expect(getWindowCloseGuardState({ phase: 'downloaded' })).toEqual({
            canCloseImmediately: false,
            closeWarningTitle: 'Update ready to install',
            closeWarningMessage:
                'A downloaded update is ready to install. Closing now will postpone installation until you reopen the app or install on quit.',
        });
    });
});
