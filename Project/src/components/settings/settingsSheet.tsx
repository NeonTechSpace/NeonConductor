import { X } from 'lucide-react';
import { startTransition, useRef, useState } from 'react';

import {
    getDefaultSettingsSelection,
    SETTINGS_PRIMARY_SECTIONS,
    type SettingsPrimarySectionId,
    type SettingsSelection,
} from '@/web/components/settings/settingsNavigation';
import { SettingsSectionContent } from '@/web/components/settings/settingsSectionContent';
import { getGroupedSettingsPrimarySections } from '@/web/components/settings/shared/settingsWorkspaceNavigation';
import { DialogSurface } from '@/web/components/ui/dialogSurface';
import { usePrivacyMode } from '@/web/lib/privacy/privacyContext';

interface SettingsSheetProps {
    open: boolean;
    profileId: string;
    onClose: () => void;
    onProfileActivated: (profileId: string) => void;
}

function SheetPrimaryRailButton({
    section,
    selected,
    onSelect,
}: {
    section: ReturnType<typeof getGroupedSettingsPrimarySections>['kiloSections'][number];
    selected: boolean;
    onSelect: (sectionId: SettingsPrimarySectionId) => void;
}) {
    return (
        <button
            type='button'
            className={`w-full rounded-[22px] border px-3 py-3 text-left transition-colors ${
                selected
                    ? 'border-primary bg-primary/10 text-primary shadow-sm'
                    : 'border-border bg-card/80 hover:bg-accent'
            }`}
            onClick={() => {
                onSelect(section.id);
            }}>
            <div className='space-y-1'>
                <p className='text-sm font-medium'>{section.label}</p>
                <p className='text-muted-foreground text-[11px] leading-4'>{section.description}</p>
            </div>
        </button>
    );
}

export function SettingsSheet({ open, profileId, onClose, onProfileActivated }: SettingsSheetProps) {
    const [selection, setSelection] = useState<SettingsSelection>(() => getDefaultSettingsSelection('kilo'));
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);
    const privacyMode = usePrivacyMode();
    const selectedSection =
        SETTINGS_PRIMARY_SECTIONS.find((section) => section.id === selection.section) ?? SETTINGS_PRIMARY_SECTIONS[0];
    if (!selectedSection) {
        return null;
    }
    const { kiloSections, generalSections } = getGroupedSettingsPrimarySections();

    function selectPrimarySection(section: SettingsPrimarySectionId) {
        startTransition(() => {
            setSelection((currentSelection) =>
                currentSelection.section === section ? currentSelection : getDefaultSettingsSelection(section)
            );
        });
    }

    return (
        <DialogSurface
            open={open}
            titleId='settings-sheet-title'
            descriptionId='settings-sheet-description'
            initialFocusRef={closeButtonRef}
            onClose={onClose}>
            <div className='border-border bg-card text-card-foreground flex h-[min(900px,calc(100vh-1rem))] w-[min(1500px,calc(100vw-1rem))] max-w-full flex-col overflow-hidden rounded-[30px] border shadow-[0_28px_90px_rgba(0,0,0,0.35)] lg:flex-row'>
                <aside className='border-border/80 bg-background/70 flex w-full shrink-0 flex-col gap-4 border-b p-4 lg:w-[292px] lg:border-r lg:border-b-0'>
                    <div className='space-y-1'>
                        <h2 id='settings-sheet-title' className='text-sm font-semibold tracking-[0.18em] uppercase'>
                            Settings
                        </h2>
                        <p id='settings-sheet-description' className='text-muted-foreground text-xs leading-5'>
                            Kilo is the default setup path. The other sections cover shared instructions, providers,
                            profiles, workspace limits, rules, skills, and app tools.
                        </p>
                    </div>

                    <nav aria-label='Settings sections' className='space-y-4'>
                        <div className='space-y-2'>
                            {kiloSections.map((section) => (
                                <SheetPrimaryRailButton
                                    key={section.id}
                                    section={section}
                                    selected={selection.section === section.id}
                                    onSelect={selectPrimarySection}
                                />
                            ))}
                        </div>

                        <div className='border-border/80 border-t pt-4'>
                            <div className='space-y-2'>
                                {generalSections.map((section) => (
                                    <SheetPrimaryRailButton
                                        key={section.id}
                                        section={section}
                                        selected={selection.section === section.id}
                                        onSelect={selectPrimarySection}
                                    />
                                ))}
                            </div>
                        </div>
                    </nav>
                </aside>

                <div className='flex min-w-0 flex-1 flex-col overflow-hidden'>
                    <header className='border-border/80 bg-background/40 flex items-start justify-between gap-4 border-b px-5 py-4 md:px-6'>
                        <div className='space-y-1'>
                            <h3 className='text-lg font-semibold text-balance'>{selectedSection.label}</h3>
                            <p className='text-muted-foreground text-sm'>{selectedSection.description}</p>
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

                    <div className='bg-background/20 h-full min-h-0 min-w-0 flex-1 overflow-hidden'>
                        <SettingsSectionContent
                            profileId={profileId}
                            selection={selection}
                            onSelectionChange={setSelection}
                            onProfileActivated={onProfileActivated}
                        />
                    </div>
                </div>
            </div>
        </DialogSurface>
    );
}
