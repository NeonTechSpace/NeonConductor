import { describe, expect, it } from 'vitest';

import { resolveComposerMediaSettingsDraft } from '@/web/components/settings/composerMediaSettingsDrafts';

describe('composer media settings drafts', () => {
    it('falls back to shared defaults when no persisted settings exist', () => {
        expect(
            resolveComposerMediaSettingsDraft({
                settings: undefined,
                draft: undefined,
            })
        ).toEqual({
            maxImageAttachmentsPerMessage: '10',
            imageCompressionConcurrency: '2',
        });
    });

    it('prefers the in-progress draft over persisted settings', () => {
        expect(
            resolveComposerMediaSettingsDraft({
                settings: {
                    maxImageAttachmentsPerMessage: 8,
                    imageCompressionConcurrency: 3,
                },
                draft: {
                    maxImageAttachmentsPerMessage: '12',
                    imageCompressionConcurrency: '4',
                },
            })
        ).toEqual({
            maxImageAttachmentsPerMessage: '12',
            imageCompressionConcurrency: '4',
        });
    });
});
