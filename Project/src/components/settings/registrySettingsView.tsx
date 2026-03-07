import { RegistrySettingsScreen } from '@/web/components/settings/registrySettings/view';

interface RegistrySettingsViewProps {
    profileId: string;
}

export function RegistrySettingsView({ profileId }: RegistrySettingsViewProps) {
    return <RegistrySettingsScreen profileId={profileId} />;
}
