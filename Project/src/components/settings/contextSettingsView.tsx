import { ContextComposerMediaSection } from '@/web/components/settings/contextSettings/contextComposerMediaSection';
import { ContextGlobalDefaultsSection } from '@/web/components/settings/contextSettings/contextGlobalDefaultsSection';
import { ContextProfileOverrideSection } from '@/web/components/settings/contextSettings/contextProfileOverrideSection';
import { ContextResolvedSummarySection } from '@/web/components/settings/contextSettings/contextResolvedSummarySection';
import { useContextSettingsController } from '@/web/components/settings/contextSettings/useContextSettingsController';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';
import { SettingsSelectionRail } from '@/web/components/settings/shared/settingsSelectionRail';

interface ContextSettingsViewProps {
    activeProfileId: string;
}

export function ContextSettingsView({ activeProfileId }: ContextSettingsViewProps) {
    const controller = useContextSettingsController({ activeProfileId });

    return (
        <section className='grid h-full min-h-0 min-w-0 overflow-hidden grid-cols-[260px_1fr]'>
            <SettingsSelectionRail
                title='Profiles'
                ariaLabel='Context settings profiles'
                selectedId={controller.selection.selectedProfileId}
                onSelect={controller.selection.setSelectedProfileId}
                items={controller.selection.profiles.map((profile) => ({
                    id: profile.id,
                    title: profile.name,
                    subtitle: profile.id,
                }))}
            />

            <div className='min-h-0 min-w-0 overflow-y-auto p-4'>
                <div className='space-y-6'>
                    <SettingsFeedbackBanner message={controller.feedback.message} tone={controller.feedback.tone} />
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
                </div>
            </div>
        </section>
    );
}
