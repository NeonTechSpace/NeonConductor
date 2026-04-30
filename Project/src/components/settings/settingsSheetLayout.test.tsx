import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/web/components/settings/contextSettingsView', () => ({
    ContextSettingsView: () => <div>context view</div>,
}));

vi.mock('@/web/components/settings/kiloSettingsView', () => ({
    KiloSettingsView: () => <div>kilo view</div>,
}));

vi.mock('@/web/components/settings/modesSettings/view', () => ({
    ModesSettingsView: () => <div>modes view</div>,
}));

vi.mock('@/web/components/settings/profileSettingsView', () => ({
    ProfileSettingsView: () => <div>profile view</div>,
}));

vi.mock('@/web/components/settings/providerSettingsView', () => ({
    ProviderSettingsView: () => <div>provider view</div>,
}));

vi.mock('@/web/components/settings/registrySettingsView', () => ({
    RegistrySettingsView: () => <div>registry view</div>,
}));

vi.mock('@/web/components/ui/dialogSurface', () => ({
    DialogSurface: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/web/lib/privacy/privacyContext', () => ({
    usePrivacyMode: () => ({ enabled: false }),
}));

import { SettingsSheet } from '@/web/components/settings/settingsSheet';

describe('settings sheet layout', () => {
    it('keeps the active panel height-constrained so sections can own scrolling', () => {
        const html = renderToStaticMarkup(
            <SettingsSheet open profileId='profile_default' onClose={() => {}} onProfileActivated={() => {}} />
        );

        expect(html).toContain('Kilo');
        expect(html).toContain('aria-current="page"');
        expect(html).toContain('bg-background/20 h-full min-h-0 min-w-0 flex-1 overflow-hidden');
    });

    it('keeps modes controls available from the sheet rail', async () => {
        vi.resetModules();
        vi.doMock('@/web/components/settings/settingsNavigation', async () => {
            const actual = await vi.importActual<typeof import('@/web/components/settings/settingsNavigation')>(
                '@/web/components/settings/settingsNavigation'
            );
            return {
                ...actual,
                getDefaultSettingsSelection: () => ({ section: 'modes' as const, subsection: 'instructions' as const }),
            };
        });

        const { SettingsSheet: ModesSettingsSheet } = await import('@/web/components/settings/settingsSheet');
        const html = renderToStaticMarkup(
            <ModesSettingsSheet open profileId='profile_default' onClose={() => {}} onProfileActivated={() => {}} />
        );

        expect(html).toContain('modes view');
        vi.doUnmock('@/web/components/settings/settingsNavigation');
    });
});
