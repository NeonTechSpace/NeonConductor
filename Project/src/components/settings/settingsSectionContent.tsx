import { AppSettingsView } from '@/web/components/settings/appSettings/view';
import { ContextSettingsView } from '@/web/components/settings/contextSettingsView';
import { KiloSettingsView } from '@/web/components/settings/kiloSettingsView';
import { ModesSettingsView } from '@/web/components/settings/modesSettings/view';
import { ProfileSettingsView } from '@/web/components/settings/profileSettingsView';
import { ProviderSettingsView } from '@/web/components/settings/providerSettingsView';
import { RegistrySettingsView } from '@/web/components/settings/registrySettingsView';
import {
    SETTINGS_PRIMARY_SECTIONS,
    type SettingsSelection,
} from '@/web/components/settings/settingsNavigation';

export interface SettingsSectionContentProps {
    profileId: string;
    selection: SettingsSelection;
    onSelectionChange: (selection: SettingsSelection) => void;
    onProfileActivated: (profileId: string) => void;
    currentWorkspaceFingerprint?: string;
    selectedWorkspaceLabel?: string;
}

export function getGroupedSettingsPrimarySections() {
    return {
        kiloSections: SETTINGS_PRIMARY_SECTIONS.filter((section) => section.group === 'kilo'),
        generalSections: SETTINGS_PRIMARY_SECTIONS.filter((section) => section.group === 'general'),
    };
}

export function SettingsSectionContent({
    profileId,
    selection,
    onSelectionChange,
    onProfileActivated,
    currentWorkspaceFingerprint,
    selectedWorkspaceLabel,
}: SettingsSectionContentProps) {
    switch (selection.section) {
        case 'kilo':
            return (
                <KiloSettingsView
                    key={profileId}
                    profileId={profileId}
                    subsection={selection.subsection}
                    onSubsectionChange={(subsection) => {
                        onSelectionChange({ section: 'kilo', subsection });
                    }}
                />
            );
        case 'modes':
            return (
                <ModesSettingsView
                    profileId={profileId}
                    subsection={selection.subsection}
                    {...(currentWorkspaceFingerprint ? { workspaceFingerprint: currentWorkspaceFingerprint } : {})}
                    {...(selectedWorkspaceLabel ? { selectedWorkspaceLabel } : {})}
                    onSubsectionChange={(subsection) => {
                        onSelectionChange({ section: 'modes', subsection });
                    }}
                />
            );
        case 'providers':
            return (
                <ProviderSettingsView
                    profileId={profileId}
                    selectedProviderId={selection.subsection}
                    onProviderChange={(providerId) => {
                        onSelectionChange({ section: 'providers', subsection: providerId });
                    }}
                    onOpenKiloSettings={() => {
                        onSelectionChange({ section: 'kilo', subsection: 'account' });
                    }}
                />
            );
        case 'profiles':
            return (
                <ProfileSettingsView
                    activeProfileId={profileId}
                    onProfileActivated={onProfileActivated}
                    subsection={selection.subsection}
                    onSubsectionChange={(subsection) => {
                        onSelectionChange({ section: 'profiles', subsection });
                    }}
                />
            );
        case 'context':
            return (
                <ContextSettingsView
                    activeProfileId={profileId}
                    subsection={selection.subsection}
                    onSubsectionChange={(subsection) => {
                        onSelectionChange({ section: 'context', subsection });
                    }}
                />
            );
        case 'registry':
            return (
                <RegistrySettingsView
                    profileId={profileId}
                    subsection={selection.subsection}
                    onSubsectionChange={(subsection) => {
                        onSelectionChange({ section: 'registry', subsection });
                    }}
                />
            );
        case 'app':
            return (
                <AppSettingsView
                    profileId={profileId}
                    subsection={selection.subsection}
                    {...(currentWorkspaceFingerprint ? { currentWorkspaceFingerprint } : {})}
                    onSubsectionChange={(subsection) => {
                        onSelectionChange({ section: 'app', subsection });
                    }}
                />
            );
    }
}
