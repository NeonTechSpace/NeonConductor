import { ModesInstructionsScreen } from '@/web/components/settings/modesSettings/modesInstructionsScreen';
import {
    MODES_SETTINGS_SUBSECTIONS,
    type ModesSettingsSubsectionId,
} from '@/web/components/settings/settingsNavigation';
import { SettingsSelectionRail } from '@/web/components/settings/shared/settingsSelectionRail';

interface ModesSettingsViewProps {
    profileId: string;
    subsection?: ModesSettingsSubsectionId;
    onSubsectionChange?: (subsection: ModesSettingsSubsectionId) => void;
    workspaceFingerprint?: string;
    selectedWorkspaceLabel?: string;
}

export function ModesSettingsView({
    profileId,
    subsection = 'instructions',
    onSubsectionChange,
    workspaceFingerprint,
    selectedWorkspaceLabel,
}: ModesSettingsViewProps) {
    return (
        <section className='grid h-full min-h-0 min-w-0 overflow-hidden xl:grid-cols-[280px_minmax(0,1fr)]'>
            <SettingsSelectionRail
                title='Modes & Instructions'
                ariaLabel='Modes and instructions settings sections'
                selectedId={subsection}
                onSelect={(itemId) => {
                    const nextSection = MODES_SETTINGS_SUBSECTIONS.find((candidate) => candidate.id === itemId);
                    if (!nextSection || nextSection.availability !== 'available') {
                        return;
                    }

                    onSubsectionChange?.(nextSection.id);
                }}
                items={MODES_SETTINGS_SUBSECTIONS.map((item) => ({
                    id: item.id,
                    title: item.label,
                    subtitle: item.description,
                }))}
            />

            <div className='min-h-0 min-w-0 overflow-y-auto p-5 md:p-6'>
                <ModesInstructionsScreen
                    profileId={profileId}
                    {...(workspaceFingerprint ? { workspaceFingerprint } : {})}
                    {...(selectedWorkspaceLabel ? { selectedWorkspaceLabel } : {})}
                />
            </div>
        </section>
    );
}
