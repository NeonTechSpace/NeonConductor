import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/web/components/settings/kiloSettingsView', () => ({
    KiloSettingsView: () => <div>kilo view</div>,
}));

vi.mock('@/web/components/settings/modesSettings/view', () => ({
    ModesSettingsView: () => <div>modes view</div>,
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

import { getDefaultSettingsSelection } from '@/web/components/settings/settingsNavigation';
import { SettingsWorkspace } from '@/web/components/settings/settingsWorkspace';

describe('settings workspace', () => {
    it('keeps the return affordance inside the settings surface', () => {
        const html = renderToStaticMarkup(
            <SettingsWorkspace
                profileId='profile_default'
                selection={getDefaultSettingsSelection('kilo')}
                onSelectionChange={vi.fn()}
                onProfileActivated={vi.fn()}
                onReturnToSessions={vi.fn()}
            />
        );

        expect(html).toContain('Back to sessions');
        expect(html).toContain('Settings');
        expect(html).toContain('Kilo');
        expect(html).toContain('Modes &amp; Instructions');
        expect(html).toContain('Providers &amp; Models');
        expect(html).toContain('Account &amp; Access');
        expect(html).toContain('Gateway Models');
        expect(html).toContain('One routed utility surface for Kilo');
    });

    it('keeps the settings body overflow-safe inside the workspace surface', () => {
        const html = renderToStaticMarkup(
            <SettingsWorkspace
                profileId='profile_default'
                selection={getDefaultSettingsSelection('kilo')}
                onSelectionChange={vi.fn()}
                onProfileActivated={vi.fn()}
                onReturnToSessions={vi.fn()}
            />
        );

        expect(html).toContain('min-w-0');
        expect(html).toContain('overflow-hidden');
        expect(html).toContain('kilo view');
        expect(html).toContain('w-[288px]');
    });

    it('renders the shared modes surface when that primary section is selected', () => {
        const html = renderToStaticMarkup(
            <SettingsWorkspace
                profileId='profile_default'
                selection={{ section: 'modes', subsection: 'instructions' }}
                onSelectionChange={vi.fn()}
                onProfileActivated={vi.fn()}
                onReturnToSessions={vi.fn()}
                currentWorkspaceFingerprint='wsf_modes_surface'
                selectedWorkspaceLabel='Workspace Root'
            />
        );

        expect(html).toContain('modes view');
        expect(html).toContain('Shared Modes &amp; Instructions');
    });

    it('keeps provider-specific navigation inside the content surface hint when providers are selected', () => {
        const html = renderToStaticMarkup(
            <SettingsWorkspace
                profileId='profile_default'
                selection={{ section: 'providers', subsection: 'kilo' }}
                onSelectionChange={vi.fn()}
                onProfileActivated={vi.fn()}
                onReturnToSessions={vi.fn()}
            />
        );

        expect(html).toContain('providers view');
        expect(html).toContain('Provider-specific navigation stays inside the content surface');
    });

    it('keeps the settings rail scrollable and wrap-safe for dense labels at narrow sizes', () => {
        const html = renderToStaticMarkup(
            <SettingsWorkspace
                profileId='profile_default'
                selection={getDefaultSettingsSelection('kilo')}
                onSelectionChange={vi.fn()}
                onProfileActivated={vi.fn()}
                onReturnToSessions={vi.fn()}
            />
        );

        expect(html).toContain('overflow-y-auto');
        expect(html).toContain('break-words');
        expect(html).toContain('w-[288px]');
    });
});
