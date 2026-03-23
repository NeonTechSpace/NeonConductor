import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/web/components/settings/contextSettingsView', () => ({
    ContextSettingsView: () => <div>context view</div>,
}));

vi.mock('@/web/components/settings/kiloSettingsView', () => ({
    KiloSettingsView: () => <div>kilo view</div>,
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
        expect(html).toContain('bg-background/20 h-full min-h-0 min-w-0 flex-1 overflow-hidden');
    });
});
