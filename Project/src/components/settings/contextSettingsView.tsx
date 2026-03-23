import { ContextComposerMediaSection } from '@/web/components/settings/contextSettings/contextComposerMediaSection';
import { ContextGlobalDefaultsSection } from '@/web/components/settings/contextSettings/contextGlobalDefaultsSection';
import { ContextProfileOverrideSection } from '@/web/components/settings/contextSettings/contextProfileOverrideSection';
import { ContextResolvedSummarySection } from '@/web/components/settings/contextSettings/contextResolvedSummarySection';
import { useContextSettingsController } from '@/web/components/settings/contextSettings/useContextSettingsController';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';
import { SettingsSelectionRail } from '@/web/components/settings/shared/settingsSelectionRail';
import {
    CONTEXT_SETTINGS_SUBSECTIONS,
    type ContextSettingsSubsectionId,
} from '@/web/components/settings/settingsNavigation';

interface ContextSettingsViewProps {
    activeProfileId: string;
    subsection?: ContextSettingsSubsectionId;
    onSubsectionChange?: (subsection: ContextSettingsSubsectionId) => void;
}

function ContextSectionHeader({
    title,
    description,
    selectedProfileId,
    profiles,
    onSelectProfile,
}: {
    title: string;
    description: string;
    selectedProfileId: string;
    profiles: Array<{ id: string; name: string }>;
    onSelectProfile: (profileId: string) => void;
}) {
    return (
        <div className='flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between'>
            <div className='space-y-2'>
                <p className='text-primary text-[11px] font-semibold tracking-[0.16em] uppercase'>Context &amp; Limits</p>
                <div className='space-y-1'>
                    <h4 className='text-xl font-semibold text-balance'>{title}</h4>
                    <p className='text-muted-foreground max-w-3xl text-sm leading-6'>{description}</p>
                </div>
            </div>

            <label className='space-y-1'>
                <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase'>
                    Profile Scope
                </span>
                <select
                    aria-label='Context settings profile'
                    className='border-border bg-background h-10 min-w-[220px] rounded-xl border px-3 text-sm'
                    value={selectedProfileId}
                    onChange={(event) => {
                        const nextProfileId = event.target.value.trim();
                        if (nextProfileId.length > 0) {
                            onSelectProfile(nextProfileId);
                        }
                    }}>
                    {profiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                            {profile.name}
                        </option>
                    ))}
                </select>
            </label>
        </div>
    );
}

export function ContextSettingsView({
    activeProfileId,
    subsection = 'workspace',
    onSubsectionChange,
}: ContextSettingsViewProps) {
    const controller = useContextSettingsController({ activeProfileId });

    return (
        <section className='grid h-full min-h-0 min-w-0 overflow-hidden xl:grid-cols-[280px_minmax(0,1fr)]'>
            <SettingsSelectionRail
                title='Context & Limits'
                ariaLabel='Context settings sections'
                selectedId={subsection}
                onSelect={(itemId) => {
                    const nextSection = CONTEXT_SETTINGS_SUBSECTIONS.find((candidate) => candidate.id === itemId);
                    if (!nextSection) {
                        return;
                    }

                    onSubsectionChange?.(nextSection.id);
                }}
                items={CONTEXT_SETTINGS_SUBSECTIONS.map((item) => ({
                    id: item.id,
                    title: item.label,
                    subtitle: item.description,
                }))}
            />

            <div className='min-h-0 min-w-0 overflow-y-auto p-5 md:p-6'>
                <div className='space-y-5'>
                    <ContextSectionHeader
                        title={subsection === 'workspace' ? 'Workspace Defaults' : 'Context Budgeting'}
                        description={
                            subsection === 'workspace'
                                ? 'Keep global composer media limits and baseline context defaults together.'
                                : 'Manage profile-level overrides and inspect the resolved compact-window preview.'
                        }
                        selectedProfileId={controller.selection.selectedProfileId}
                        profiles={controller.selection.profiles}
                        onSelectProfile={controller.selection.setSelectedProfileId}
                    />

                    <SettingsFeedbackBanner message={controller.feedback.message} tone={controller.feedback.tone} />

                    {subsection === 'workspace' ? (
                        <>
                            <ContextComposerMediaSection
                                key={controller.composerMedia.draftKey}
                                initialDraft={controller.composerMedia.draft}
                                isSaving={controller.composerMedia.isSaving}
                                onClearFeedback={controller.feedback.clear}
                                onSave={controller.composerMedia.save}
                            />
                            <ContextGlobalDefaultsSection
                                key={controller.globalDefaults.draftKey}
                                initialDraft={controller.globalDefaults.draft}
                                isSaving={controller.globalDefaults.isSaving}
                                onClearFeedback={controller.feedback.clear}
                                onSave={controller.globalDefaults.save}
                            />
                        </>
                    ) : null}

                    {subsection === 'budgeting' ? (
                        <>
                            <ContextProfileOverrideSection
                                key={controller.profileOverride.draftKey}
                                initialDraft={controller.profileOverride.draft}
                                isSaving={controller.profileOverride.isSaving}
                                modelLimitsKnown={controller.profileOverride.modelLimitsKnown}
                                onClearFeedback={controller.feedback.clear}
                                onSave={controller.profileOverride.save}
                            />
                            <ContextResolvedSummarySection
                                defaultModel={controller.resolvedPreview.defaultModel}
                                defaultProvider={controller.resolvedPreview.defaultProvider}
                                state={controller.resolvedPreview.state}
                            />
                        </>
                    ) : null}
                </div>
            </div>
        </section>
    );
}
