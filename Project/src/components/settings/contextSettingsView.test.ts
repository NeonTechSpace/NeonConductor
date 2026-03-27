import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/web/components/settings/contextSettings/useContextSettingsController', () => ({
    useContextSettingsController: () => ({
        selection: {
            profiles: [
                { id: 'profile_default', name: 'Default' },
                { id: 'profile_design', name: 'Design' },
            ],
            selectedProfileId: 'profile_default',
            setSelectedProfileId: vi.fn(),
        },
        feedback: {
            message: undefined,
            tone: 'info',
            clear: vi.fn(),
        },
        composerMedia: {
            draft: {
                maxImageAttachmentsPerMessage: '4',
                imageCompressionConcurrency: '2',
            },
            draftKey: '4:2',
            isSaving: false,
            save: vi.fn(),
        },
        globalDefaults: {
            draft: {
                enabled: true,
                percent: '80',
            },
            draftKey: 'true:80',
            isSaving: false,
            save: vi.fn(),
        },
        profileOverride: {
            draft: {
                profileId: 'profile_default',
                overrideMode: 'inherit',
                percent: '80',
                fixedInputTokens: '',
            },
            draftKey: 'profile_default:inherit:80:',
            isSaving: false,
            save: vi.fn(),
            modelLimitsKnown: true,
        },
        resolvedPreview: {
            defaultProvider: undefined,
            defaultModel: undefined,
            state: undefined,
        },
    }),
}));

vi.mock('@/web/components/settings/contextSettings/contextComposerMediaSection', () => ({
    ContextComposerMediaSection: () => createElement('section', undefined, 'media'),
}));

vi.mock('@/web/components/settings/contextSettings/contextGlobalDefaultsSection', () => ({
    ContextGlobalDefaultsSection: () => createElement('section', undefined, 'global'),
}));

vi.mock('@/web/components/settings/contextSettings/contextProfileOverrideSection', () => ({
    ContextProfileOverrideSection: () => createElement('section', undefined, 'profile'),
}));

vi.mock('@/web/components/settings/contextSettings/contextResolvedSummarySection', () => ({
    ContextResolvedSummarySection: () => createElement('section', undefined, 'summary'),
}));

vi.mock('@/web/components/settings/shared/settingsSelectionRail', () => ({
    SettingsSelectionRail: ({ title }: { title: string }) => createElement('aside', undefined, title),
}));

vi.mock('@/web/components/settings/shared/settingsFeedbackBanner', () => ({
    SettingsFeedbackBanner: () => null,
}));

import { ContextSettingsView } from '@/web/components/settings/contextSettingsView';

describe('context settings view layout', () => {
    it('keeps the split pane constrained and leaves scrolling to the detail column', () => {
        const html = renderToStaticMarkup(createElement(ContextSettingsView, { activeProfileId: 'profile_default' }));

        expect(html).toContain('grid h-full min-h-0 min-w-0 overflow-hidden xl:grid-cols-[280px_minmax(0,1fr)]');
        expect(html).toContain('min-h-0 min-w-0 overflow-y-auto p-5 md:p-6');
        expect(html).toContain('Profile Scope');
        expect(html).toContain('media');
        expect(html).toContain('global');
    });
});
