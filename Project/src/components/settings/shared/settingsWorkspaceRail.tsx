import { ArrowLeft } from 'lucide-react';

import type { SettingsPrimarySectionId, SettingsSelection } from '@/web/components/settings/settingsNavigation';
import {
    buildSettingsWorkspaceNavigationModel,
    createSettingsSelection,
} from '@/web/components/settings/shared/settingsWorkspaceNavigation';
import { cn } from '@/web/lib/utils';

interface SettingsWorkspaceRailProps {
    selection: SettingsSelection;
    privacyModeEnabled: boolean;
    onReturnToSessions: () => void;
    onPreviewReturnToSessions?: (() => void) | undefined;
    onSelectPrimarySection: (sectionId: SettingsPrimarySectionId) => void;
    onSelectSubsection: (selection: SettingsSelection) => void;
}

function RailButton({
    title,
    description,
    selected,
    onClick,
}: {
    title: string;
    description: string;
    selected: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type='button'
            className={cn(
                'border-border/80 bg-card/70 hover:bg-accent focus-visible:ring-ring w-full rounded-2xl border px-3 py-3 text-left transition-colors focus-visible:ring-2',
                selected && 'border-primary bg-primary/10 text-primary shadow-sm'
            )}
            onClick={onClick}>
            <div className='space-y-1'>
                <p className='min-w-0 text-sm font-medium break-words'>{title}</p>
                <p className='text-muted-foreground text-[11px] leading-5'>{description}</p>
            </div>
        </button>
    );
}

function RailGroup({
    title,
    sections,
    selectedSectionId,
    onSelectSection,
}: {
    title: string;
    sections: ReturnType<typeof buildSettingsWorkspaceNavigationModel>['primaryGroups'][number]['sections'];
    selectedSectionId: SettingsPrimarySectionId;
    onSelectSection: (sectionId: SettingsPrimarySectionId) => void;
}) {
    if (sections.length === 0) {
        return null;
    }

    return (
        <div className='space-y-2'>
            <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase'>{title}</p>
            <div className='space-y-1.5'>
                {sections.map((section) => (
                    <RailButton
                        key={section.id}
                        title={section.label}
                        description={section.description}
                        selected={selectedSectionId === section.id}
                        onClick={() => {
                            onSelectSection(section.id);
                        }}
                    />
                ))}
            </div>
        </div>
    );
}

function RailSubsectionButton({
    title,
    description,
    selected,
    onClick,
}: {
    title: string;
    description: string;
    selected: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type='button'
            className={cn(
                'border-border/70 bg-background/75 hover:bg-accent focus-visible:ring-ring w-full rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:ring-2',
                selected && 'border-primary bg-primary/10 text-primary shadow-sm'
            )}
            onClick={onClick}>
            <div className='space-y-0.5'>
                <p className='text-sm font-medium'>{title}</p>
                <p className='text-muted-foreground text-[11px] leading-5'>{description}</p>
            </div>
        </button>
    );
}

export function SettingsWorkspaceRail({
    selection,
    privacyModeEnabled,
    onReturnToSessions,
    onPreviewReturnToSessions,
    onSelectPrimarySection,
    onSelectSubsection,
}: SettingsWorkspaceRailProps) {
    const navigationModel = buildSettingsWorkspaceNavigationModel(selection);

    return (
        <aside className='border-border/80 bg-background/75 flex min-h-0 w-[288px] shrink-0 flex-col overflow-y-auto border-r p-4'>
            <div className='space-y-4'>
                <div className='flex items-start justify-between gap-3'>
                    <button
                        type='button'
                        className='border-border bg-card hover:bg-accent inline-flex h-11 w-11 items-center justify-center rounded-full border transition-colors'
                        aria-label='Back to sessions'
                        title='Back to sessions'
                        onPointerEnter={onPreviewReturnToSessions}
                        onFocus={onPreviewReturnToSessions}
                        onClick={onReturnToSessions}>
                        <ArrowLeft className='h-4 w-4' />
                    </button>
                    {privacyModeEnabled ? (
                        <p className='text-primary rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold tracking-[0.12em] uppercase'>
                            Privacy mode active
                        </p>
                    ) : null}
                </div>

                <div className='space-y-1'>
                    <h2 className='text-sm font-semibold tracking-[0.18em] uppercase'>Settings</h2>
                    <p className='text-muted-foreground text-xs leading-6'>
                        One routed utility surface for Kilo, instructions, providers, profiles, limits, rules, skills,
                        and app tools.
                    </p>
                </div>
            </div>

            <nav aria-label='Settings sections' className='mt-5 flex min-h-0 flex-1 flex-col gap-4'>
                {navigationModel.primaryGroups.map((group) => (
                    <RailGroup
                        key={group.id}
                        title={group.title}
                        sections={group.sections}
                        selectedSectionId={selection.section}
                        onSelectSection={onSelectPrimarySection}
                    />
                ))}

                <div className='border-border/80 border-t pt-4'>
                    <div className='space-y-3'>
                        <div className='space-y-1'>
                            <p className='text-[11px] font-semibold tracking-[0.18em] uppercase'>
                                {navigationModel.selectedSection.label}
                            </p>
                            <p className='text-muted-foreground text-xs leading-5'>
                                {navigationModel.selectedSection.description}
                            </p>
                        </div>

                        {navigationModel.selectedSection.id === 'providers' ? (
                            <div className='border-border/70 bg-background/60 rounded-2xl border px-3 py-3 text-xs leading-6'>
                                Provider-specific navigation stays inside the content surface so the shared Settings
                                rail can stay compact.
                            </div>
                        ) : navigationModel.subsections.length > 0 ? (
                            <div className='space-y-2'>
                                {navigationModel.subsections.map((subsection) => (
                                    <RailSubsectionButton
                                        key={subsection.id}
                                        title={subsection.label}
                                        description={subsection.description}
                                        selected={
                                            selection.section === navigationModel.selectedSection.id &&
                                            selection.subsection === subsection.id
                                        }
                                        onClick={() => {
                                            onSelectSubsection(
                                                createSettingsSelection(navigationModel.selectedSection.id, subsection.id)
                                            );
                                        }}
                                    />
                                ))}
                            </div>
                        ) : null}
                    </div>
                </div>
            </nav>
        </aside>
    );
}
