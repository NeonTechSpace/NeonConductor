import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

interface ProviderSettingsViewMockProps {
    profileId: string;
    selectedProviderId?: string;
    onOpenKiloSettings?: () => void;
}

const { providerSettingsViewMock } = vi.hoisted(() => ({
    providerSettingsViewMock: vi.fn((props: ProviderSettingsViewMockProps) => {
        void props;
        return <div>provider section</div>;
    }),
}));

vi.mock('@/web/components/settings/kiloSettingsView', () => ({
    KiloSettingsView: () => <div>kilo section</div>,
}));

vi.mock('@/web/components/settings/modesSettings/view', () => ({
    ModesSettingsView: () => <div>modes section</div>,
}));

vi.mock('@/web/components/settings/providerSettingsView', () => ({
    ProviderSettingsView: providerSettingsViewMock,
}));

vi.mock('@/web/components/settings/profileSettingsView', () => ({
    ProfileSettingsView: () => <div>profile section</div>,
}));

vi.mock('@/web/components/settings/contextSettingsView', () => ({
    ContextSettingsView: () => <div>context section</div>,
}));

vi.mock('@/web/components/settings/registrySettingsView', () => ({
    RegistrySettingsView: () => <div>registry section</div>,
}));

vi.mock('@/web/components/settings/appSettings/view', () => ({
    AppSettingsView: () => <div>app section</div>,
}));

import { SettingsSectionContent } from '@/web/components/settings/settingsSectionContent';
import { getGroupedSettingsPrimarySections } from '@/web/components/settings/shared/settingsWorkspaceNavigation';

describe('settings section content', () => {
    it('keeps Kilo-first grouping in one shared helper', () => {
        const groupedSections = getGroupedSettingsPrimarySections();

        expect(groupedSections.kiloSections.map((section) => section.id)).toEqual(['kilo']);
        expect(groupedSections.generalSections.map((section) => section.id)).toContain('providers');
    });

    it('renders the selected section from the shared mapping boundary', () => {
        const html = renderToStaticMarkup(
            <SettingsSectionContent
                profileId='profile_default'
                selection={{ section: 'providers', subsection: 'kilo' }}
                onSelectionChange={vi.fn()}
                onProfileActivated={vi.fn()}
            />
        );

        expect(html).toContain('provider section');
    });

    it('wires the Providers screen Kilo handoff back into the dedicated Kilo route', () => {
        const onSelectionChange = vi.fn();

        renderToStaticMarkup(
            <SettingsSectionContent
                profileId='profile_default'
                selection={{ section: 'providers', subsection: 'kilo' }}
                onSelectionChange={onSelectionChange}
                onProfileActivated={vi.fn()}
            />
        );

        const providerViewProps =
            providerSettingsViewMock.mock.calls[providerSettingsViewMock.mock.calls.length - 1]?.[0];
        expect(providerViewProps).toBeDefined();
        if (!providerViewProps) {
            throw new Error('Expected ProviderSettingsView to receive props.');
        }

        expect(providerViewProps).toMatchObject({
            profileId: 'profile_default',
            selectedProviderId: 'kilo',
        });

        expect(providerViewProps.onOpenKiloSettings).toBeDefined();
        if (!providerViewProps.onOpenKiloSettings) {
            throw new Error('Expected Kilo handoff callback.');
        }

        providerViewProps.onOpenKiloSettings();
        expect(onSelectionChange).toHaveBeenCalledWith({ section: 'kilo', subsection: 'account' });
    });
});
