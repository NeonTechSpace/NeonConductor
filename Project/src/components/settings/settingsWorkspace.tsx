import { startTransition } from 'react';

import {
    getDefaultSettingsSelection,
    type SettingsPrimarySectionId,
    type SettingsSelection,
} from '@/web/components/settings/settingsNavigation';
import { SettingsSectionContent } from '@/web/components/settings/settingsSectionContent';
import { SettingsWorkspaceRail } from '@/web/components/settings/shared/settingsWorkspaceRail';
import { usePrivacyMode } from '@/web/lib/privacy/privacyContext';

interface SettingsWorkspaceProps {
    profileId: string;
    selection: SettingsSelection;
    onSelectionChange: (selection: SettingsSelection) => void;
    onProfileActivated: (profileId: string) => void;
    onReturnToSessions: () => void;
    onPreviewReturnToSessions?: () => void;
    currentWorkspaceFingerprint?: string;
    selectedWorkspaceLabel?: string;
}

export function SettingsWorkspace({
    profileId,
    selection,
    onSelectionChange,
    onProfileActivated,
    onReturnToSessions,
    onPreviewReturnToSessions,
    currentWorkspaceFingerprint,
    selectedWorkspaceLabel,
}: SettingsWorkspaceProps) {
    const privacyMode = usePrivacyMode();

    function selectPrimarySection(section: SettingsPrimarySectionId) {
        startTransition(() => {
            onSelectionChange(selection.section === section ? selection : getDefaultSettingsSelection(section));
        });
    }

    return (
        <section className='flex h-full min-h-0 min-w-0 flex-1 overflow-hidden'>
            <SettingsWorkspaceRail
                selection={selection}
                privacyModeEnabled={privacyMode.enabled}
                onReturnToSessions={onReturnToSessions}
                onPreviewReturnToSessions={onPreviewReturnToSessions}
                onSelectPrimarySection={selectPrimarySection}
                onSelectSubsection={(nextSelection) => {
                    startTransition(() => {
                        onSelectionChange(nextSelection);
                    });
                }}
            />
            <div className='bg-background/20 h-full min-h-0 min-w-0 flex-1 overflow-hidden'>
                <SettingsSectionContent
                    profileId={profileId}
                    selection={selection}
                    onSelectionChange={onSelectionChange}
                    onProfileActivated={onProfileActivated}
                    {...(currentWorkspaceFingerprint ? { currentWorkspaceFingerprint } : {})}
                    {...(selectedWorkspaceLabel ? { selectedWorkspaceLabel } : {})}
                />
            </div>
        </section>
    );
}
