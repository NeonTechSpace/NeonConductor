import {
    RegistrySettingsScreen,
} from '@/web/components/settings/registrySettings/view';

import type { RegistrySettingsSubsectionId } from '@/web/components/settings/settingsNavigation';

interface RegistrySettingsViewProps {
    profileId: string;
    subsection?: RegistrySettingsSubsectionId;
    onSubsectionChange?: (subsection: RegistrySettingsSubsectionId) => void;
}

export function RegistrySettingsView({ profileId, subsection, onSubsectionChange }: RegistrySettingsViewProps) {
    return (
        <RegistrySettingsScreen
            profileId={profileId}
            {...(subsection ? { subsection } : {})}
            {...(onSubsectionChange ? { onSubsectionChange } : {})}
        />
    );
}
