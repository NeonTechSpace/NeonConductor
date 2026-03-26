import { describe, expect, it } from 'vitest';

import { resolveContextGlobalDraft, resolveContextProfileDraft } from '@/web/components/settings/contextSettingsDrafts';

describe('context settings drafts', () => {
    it('keeps the local global draft instead of replacing it with refreshed query data', () => {
        expect(
            resolveContextGlobalDraft({
                settings: {
                    enabled: false,
                    percent: 75,
                },
                draft: {
                    enabled: true,
                    percent: '91',
                },
            })
        ).toEqual({
            enabled: true,
            percent: '91',
        });
    });

    it('uses keyed profile drafts and falls back to inherited percent for other profiles', () => {
        expect(
            resolveContextProfileDraft({
                profileId: 'profile_default',
                inheritedPercent: '91',
                settings: {
                    overrideMode: 'percent',
                    percent: 80,
                },
                draft: {
                    profileId: 'profile_default',
                    overrideMode: 'fixed_tokens',
                    percent: '88',
                    fixedInputTokens: '4000',
                },
            })
        ).toEqual({
            profileId: 'profile_default',
            overrideMode: 'fixed_tokens',
            percent: '88',
            fixedInputTokens: '4000',
        });

        expect(
            resolveContextProfileDraft({
                profileId: 'profile_other',
                inheritedPercent: '91',
                settings: undefined,
                draft: {
                    profileId: 'profile_default',
                    overrideMode: 'fixed_tokens',
                    percent: '88',
                    fixedInputTokens: '4000',
                },
            })
        ).toEqual({
            profileId: 'profile_other',
            overrideMode: 'inherit',
            percent: '91',
            fixedInputTokens: '',
        });
    });
});
