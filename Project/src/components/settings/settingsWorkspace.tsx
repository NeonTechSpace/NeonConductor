import { startTransition } from 'react';

import {
    getDefaultSettingsSelection,
    type SettingsPrimarySectionId,
    type SettingsSelection,
} from '@/web/components/settings/settingsNavigation';
import { SettingsSectionContent } from '@/web/components/settings/settingsSectionContent';
import { SettingsWorkspaceRail } from '@/web/components/settings/shared/settingsWorkspaceRail';
import { WorkspaceIdentitySettings } from '@/web/components/settings/workspaceIdentitySettings';
import { usePrivacyMode } from '@/web/lib/privacy/privacyContext';

import type { WorkspaceRootRecord } from '@/shared/contracts';

interface SettingsWorkspaceProps {
    profileId: string;
    selection: SettingsSelection;
    onSelectionChange: (selection: SettingsSelection) => void;
    onProfileActivated: (profileId: string) => void;
    onReturnToSessions: () => void;
    onPreviewReturnToSessions?: () => void;
    currentWorkspaceFingerprint?: string;
    selectedWorkspaceLabel?: string;
    selectedWorkspaceRoot?: WorkspaceRootRecord;
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
    selectedWorkspaceRoot,
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
                <div className='flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4'>
                    {selectedWorkspaceRoot ? (
                        <WorkspaceIdentitySettings profileId={profileId} workspaceRoot={selectedWorkspaceRoot} />
                    ) : null}
                    <div className='min-h-0 flex-1'>
                        <SettingsSectionContent
                            profileId={profileId}
                            selection={selection}
                            onSelectionChange={onSelectionChange}
                            onProfileActivated={onProfileActivated}
                            {...(currentWorkspaceFingerprint ? { currentWorkspaceFingerprint } : {})}
                            {...(selectedWorkspaceLabel ? { selectedWorkspaceLabel } : {})}
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}
