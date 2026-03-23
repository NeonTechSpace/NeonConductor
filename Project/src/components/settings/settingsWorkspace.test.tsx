import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/web/components/settings/kiloSettingsView', () => ({
    KiloSettingsView: () => <div>kilo view</div>,
}));

vi.mock('@/web/components/settings/providerSettingsView', () => ({
    ProviderSettingsView: () => <div>providers view</div>,
}));

vi.mock('@/web/components/settings/profileSettingsView', () => ({
    ProfileSettingsView: () => <div>profiles view</div>,
}));

vi.mock('@/web/components/settings/contextSettingsView', () => ({
    ContextSettingsView: () => <div>context view</div>,
}));

vi.mock('@/web/components/settings/registrySettingsView', () => ({
    RegistrySettingsView: () => <div>skills view</div>,
}));

vi.mock('@/web/components/settings/appSettings/view', () => ({
    AppSettingsView: () => <div>app view</div>,
}));

vi.mock('@/web/lib/privacy/privacyContext', () => ({
    usePrivacyMode: () => ({ enabled: false }),
}));

import { SettingsWorkspace } from '@/web/components/settings/settingsWorkspace';

describe('settings workspace', () => {
    it('keeps the return affordance inside the settings surface', () => {
        const html = renderToStaticMarkup(
            <SettingsWorkspace
                profileId='profile_default'
                onProfileActivated={vi.fn()}
                onReturnToSessions={vi.fn()}
            />
        );

        expect(html).toContain('Back to sessions');
        expect(html).toContain('Settings');
        expect(html).toContain('Kilo');
        expect(html).toContain('Providers &amp; Models');
        expect(html).toContain('Kilo is the primary path.');
    });

    it('keeps the settings body overflow-safe inside the workspace surface', () => {
        const html = renderToStaticMarkup(
            <SettingsWorkspace
                profileId='profile_default'
                onProfileActivated={vi.fn()}
                onReturnToSessions={vi.fn()}
            />
        );

        expect(html).toContain('min-w-0');
        expect(html).toContain('overflow-hidden');
        expect(html).toContain('kilo view');
    });

    it('keeps the settings rail scrollable and wrap-safe for dense labels at narrow sizes', () => {
        const html = renderToStaticMarkup(
            <SettingsWorkspace
                profileId='profile_default'
                onProfileActivated={vi.fn()}
                onReturnToSessions={vi.fn()}
            />
        );

        expect(html).toContain('overflow-y-auto');
        expect(html).toContain('break-words');
        expect(html).toContain('w-[272px]');
    });
});
