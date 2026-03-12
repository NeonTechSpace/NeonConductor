import { describe, expect, it } from 'vitest';

import { shouldSubmitComposerOnEnter } from '@/web/components/conversation/panels/composerActionPanel';

describe('composer enter handling', () => {
    it('submits only on plain enter', () => {
        expect(
            shouldSubmitComposerOnEnter({
                key: 'Enter',
                shiftKey: false,
                nativeEvent: {},
            })
        ).toBe(true);
        expect(
            shouldSubmitComposerOnEnter({
                key: 'Enter',
                shiftKey: true,
                nativeEvent: {},
            })
        ).toBe(false);
        expect(
            shouldSubmitComposerOnEnter({
                key: 'a',
                shiftKey: false,
                nativeEvent: {},
            })
        ).toBe(false);
    });

    it('suppresses submit while IME composition is active', () => {
        expect(
            shouldSubmitComposerOnEnter({
                key: 'Enter',
                shiftKey: false,
                nativeEvent: { isComposing: true },
            })
        ).toBe(false);
    });
});
