import { X } from 'lucide-react';
import { startTransition, useRef, useState } from 'react';

import { ContextSettingsView } from '@/web/components/settings/contextSettingsView';
import { KiloSettingsView } from '@/web/components/settings/kiloSettingsView';
import { ProfileSettingsView } from '@/web/components/settings/profileSettingsView';
import { ProviderSettingsView } from '@/web/components/settings/providerSettingsView';
import { RegistrySettingsView } from '@/web/components/settings/registrySettingsView';
import {
    getNextSettingsSection,
    SETTINGS_SECTIONS,
    type SettingsSection,
} from '@/web/components/settings/settingsSheetNavigation';
import { DialogSurface } from '@/web/components/ui/dialogSurface';
import { usePrivacyMode } from '@/web/lib/privacy/privacyContext';

interface SettingsSheetProps {
    open: boolean;
    profileId: string;
    onClose: () => void;
    onProfileActivated: (profileId: string) => void;
}

const SECTION_LABELS: Record<SettingsSection, string> = {
    kilo: 'Kilo',
    providers: 'Providers',
    profiles: 'Profiles',
    context: 'Context',
    agents: 'Agents',
};

const SECTION_DESCRIPTIONS: Record<SettingsSection, string> = {
    kilo: 'Sign-in state, default Kilo model, account session, and organization snapshots.',
    providers: 'Direct provider credentials, endpoint profiles, and BYOK defaults.',
    profiles: 'Execution presets and profile selection.',
    context: 'Workspace and context budgeting settings.',
    agents: 'Registry-backed agents and skills.',
};

export function SettingsSheet({ open, profileId, onClose, onProfileActivated }: SettingsSheetProps) {
    const [activeSection, setActiveSection] = useState<SettingsSection>('kilo');
    const sectionButtonRefs = useRef<Record<SettingsSection, HTMLButtonElement | null>>({
        kilo: null,
        providers: null,
        profiles: null,
        context: null,
        agents: null,
    });
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);
    const privacyMode = usePrivacyMode();

    function moveToSection(section: SettingsSection) {
        startTransition(() => {
            setActiveSection(section);
        });
        sectionButtonRefs.current[section]?.focus();
    }

    return (
        <DialogSurface
            open={open}
            titleId='settings-sheet-title'
            descriptionId='settings-sheet-description'
            initialFocusRef={closeButtonRef}
            onClose={onClose}>
            <div className='border-border bg-card text-card-foreground flex h-[min(900px,calc(100vh-1rem))] w-[min(1400px,calc(100vw-1rem))] max-w-full flex-col overflow-hidden rounded-[30px] border shadow-[0_28px_90px_rgba(0,0,0,0.35)] lg:flex-row'>
                <aside className='border-border/80 bg-background/70 flex w-full shrink-0 flex-col gap-3 border-b p-4 lg:w-[272px] lg:border-r lg:border-b-0'>
                    <div className='space-y-1'>
                        <h2 id='settings-sheet-title' className='text-sm font-semibold tracking-[0.18em] uppercase'>
                            Settings
                        </h2>
                        <p id='settings-sheet-description' className='text-muted-foreground text-xs leading-5'>
                            Kilo is the default app path. Direct provider credentials live separately in Providers.
                        </p>
                    </div>

                    <nav
                        role='tablist'
                        aria-orientation='vertical'
                        aria-label='Settings sections'
                        className='space-y-2'>
                        {SETTINGS_SECTIONS.map((section) => (
                            <button
                                key={section}
                                ref={(element) => {
                                    sectionButtonRefs.current[section] = element;
                                }}
                                type='button'
                                id={`settings-tab-${section}`}
                                role='tab'
                                aria-selected={activeSection === section}
                                aria-controls={`settings-panel-${section}`}
                                tabIndex={activeSection === section ? 0 : -1}
                                className={`focus-visible:ring-ring w-full rounded-[22px] border px-3 py-3 text-left transition-colors focus-visible:ring-2 ${
                                    activeSection === section
                                        ? 'border-primary bg-primary/10 text-primary shadow-sm'
                                        : 'border-border bg-card/80 hover:bg-accent'
                                }`}
                                onKeyDown={(event) => {
                                    const nextSection = getNextSettingsSection({
                                        currentSection: section,
                                        key: event.key,
                                    });
                                    if (!nextSection) {
                                        return;
                                    }

                                    event.preventDefault();
                                    moveToSection(nextSection);
                                }}
                                onClick={() => {
                                    startTransition(() => {
                                        setActiveSection(section);
                                    });
                                }}>
                                <div className='space-y-1'>
                                    <p className='text-sm font-medium'>{SECTION_LABELS[section]}</p>
                                    <p className='text-muted-foreground text-[11px] leading-4'>
                                        {SECTION_DESCRIPTIONS[section]}
                                    </p>
                                </div>
                            </button>
                        ))}
                    </nav>
                </aside>

                <div className='flex min-w-0 flex-1 flex-col overflow-hidden'>
                    <header className='border-border/80 bg-background/40 flex items-start justify-between gap-4 border-b px-5 py-4 md:px-6'>
                        <div className='space-y-1'>
                            <h3 className='text-lg font-semibold text-balance'>{SECTION_LABELS[activeSection]}</h3>
                            <p className='text-muted-foreground text-sm'>{SECTION_DESCRIPTIONS[activeSection]}</p>
                            {privacyMode.enabled ? (
                                <p className='text-primary text-[11px] font-semibold tracking-[0.12em] uppercase'>
                                    Privacy mode active
                                </p>
                            ) : null}
                        </div>
                        <button
                            ref={closeButtonRef}
                            type='button'
                            className='hover:bg-accent focus-visible:ring-ring border-border/70 bg-background/70 inline-flex h-10 w-10 items-center justify-center rounded-xl border focus-visible:ring-2'
                            onClick={onClose}
                            aria-label='Close settings'>
                            <X className='h-4 w-4' />
                        </button>
                    </header>

                    <div
                        id={`settings-panel-${activeSection}`}
                        role='tabpanel'
                        aria-labelledby={`settings-tab-${activeSection}`}
                        className='bg-background/20 h-full min-h-0 min-w-0 flex-1 overflow-hidden'>
                        {activeSection === 'kilo' ? <KiloSettingsView profileId={profileId} /> : null}
                        {activeSection === 'providers' ? <ProviderSettingsView profileId={profileId} /> : null}
                        {activeSection === 'profiles' ? (
                            <ProfileSettingsView activeProfileId={profileId} onProfileActivated={onProfileActivated} />
                        ) : null}
                        {activeSection === 'context' ? <ContextSettingsView activeProfileId={profileId} /> : null}
                        {activeSection === 'agents' ? <RegistrySettingsView profileId={profileId} /> : null}
                    </div>
                </div>
            </div>
        </DialogSurface>
    );
}
