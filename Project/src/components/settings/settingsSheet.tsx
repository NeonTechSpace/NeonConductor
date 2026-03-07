import { X } from 'lucide-react';
import { useState } from 'react';

import { ProfileSettingsView } from '@/web/components/settings/profileSettingsView';
import { ProviderSettingsView } from '@/web/components/settings/providerSettingsView';
import { RegistrySettingsView } from '@/web/components/settings/registrySettingsView';
import { usePrivacyMode } from '@/web/lib/privacy/privacyContext';

interface SettingsSheetProps {
    open: boolean;
    profileId: string;
    onClose: () => void;
    onProfileActivated: (profileId: string) => void;
}

type SettingsSection = 'providers' | 'profiles' | 'agents';

const SECTION_LABELS: Record<SettingsSection, string> = {
    providers: 'Providers',
    profiles: 'Profiles',
    agents: 'Agents',
};

export function SettingsSheet({ open, profileId, onClose, onProfileActivated }: SettingsSheetProps) {
    const [activeSection, setActiveSection] = useState<SettingsSection>('providers');
    const privacyMode = usePrivacyMode();

    if (!open) {
        return null;
    }

    return (
        <>
            <div className='bg-background/70 fixed inset-0 z-40 backdrop-blur-sm' onClick={onClose} />
            <section className='border-border bg-card text-card-foreground fixed inset-y-0 right-0 z-50 flex w-[min(1040px,95vw)] border-l shadow-2xl'>
                <aside className='border-border bg-background/50 flex w-52 flex-col gap-2 border-r p-3'>
                    <h2 className='text-sm font-semibold tracking-wide uppercase'>Settings</h2>
                    {(Object.keys(SECTION_LABELS) as SettingsSection[]).map((section) => (
                        <button
                            key={section}
                            type='button'
                            className={`rounded-md border px-2 py-1.5 text-left text-sm ${
                                activeSection === section
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border bg-background hover:bg-accent'
                            }`}
                            onClick={() => {
                                setActiveSection(section);
                            }}>
                            {SECTION_LABELS[section]}
                        </button>
                    ))}
                </aside>

                <div className='flex min-w-0 flex-1 flex-col'>
                    <header className='border-border flex items-center justify-between border-b px-4 py-3'>
                        <div>
                            <h3 className='text-sm font-semibold'>{SECTION_LABELS[activeSection]}</h3>
                            <p className='text-muted-foreground text-xs'>
                                Core runtime is provider-neutral. Kilo-only features stay gated until Kilo login.
                            </p>
                            {privacyMode.enabled ? (
                                <p className='text-primary mt-1 text-[11px] font-semibold tracking-[0.12em] uppercase'>
                                    Privacy mode active
                                </p>
                            ) : null}
                        </div>
                        <button
                            type='button'
                            className='hover:bg-accent inline-flex h-8 w-8 items-center justify-center rounded-md'
                            onClick={onClose}
                            aria-label='Close settings'>
                            <X className='h-4 w-4' />
                        </button>
                    </header>

                    <div className='min-h-0 flex-1 overflow-auto'>
                        {activeSection === 'providers' ? <ProviderSettingsView profileId={profileId} /> : null}
                        {activeSection === 'profiles' ? (
                            <ProfileSettingsView activeProfileId={profileId} onProfileActivated={onProfileActivated} />
                        ) : null}
                        {activeSection === 'agents' ? <RegistrySettingsView profileId={profileId} /> : null}
                    </div>
                </div>
            </section>
        </>
    );
}
