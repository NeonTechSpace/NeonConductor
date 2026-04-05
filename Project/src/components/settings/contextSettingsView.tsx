import { ContextComposerMediaSection } from '@/web/components/settings/contextSettings/contextComposerMediaSection';
import { ContextGlobalDefaultsSection } from '@/web/components/settings/contextSettings/contextGlobalDefaultsSection';
import { ContextProfileOverrideSection } from '@/web/components/settings/contextSettings/contextProfileOverrideSection';
import { ContextResolvedSummarySection } from '@/web/components/settings/contextSettings/contextResolvedSummarySection';
import { useContextSettingsController } from '@/web/components/settings/contextSettings/useContextSettingsController';
import type { ContextSettingsSubsectionId } from '@/web/components/settings/settingsNavigation';
import { SettingsContentScaffold } from '@/web/components/settings/shared/settingsContentScaffold';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';

interface ContextSettingsViewProps {
    activeProfileId: string;
    subsection?: ContextSettingsSubsectionId;
    onSubsectionChange?: (subsection: ContextSettingsSubsectionId) => void;
}

export function ContextSettingsView({
    activeProfileId,
    subsection = 'workspace',
}: ContextSettingsViewProps) {
    const controller = useContextSettingsController({ activeProfileId });

    const title = subsection === 'workspace' ? 'Workspace Defaults' : 'Context Budgeting';
    const description =
        subsection === 'workspace'
            ? 'Keep global composer media limits and baseline context defaults together.'
            : 'Manage profile-level overrides and inspect the resolved compact-window preview.';

    return (
        <SettingsContentScaffold
            eyebrow='Context & Limits'
            title={title}
            description={description}
            toolbar={
                <label className='space-y-1'>
                    <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase'>
                        Profile Scope
                    </span>
                    <select
                        aria-label='Context settings profile'
                        className='border-border bg-background h-10 min-w-[220px] rounded-xl border px-3 text-sm'
                        value={controller.selection.selectedProfileId}
                        onChange={(event) => {
                            const nextProfileId = event.target.value.trim();
                            if (nextProfileId.length > 0) {
                                controller.selection.setSelectedProfileId(nextProfileId);
                            }
                        }}>
                        {controller.selection.profiles.map((profile) => (
                            <option key={profile.id} value={profile.id}>
                                {profile.name}
                            </option>
                        ))}
                    </select>
                </label>
            }>
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
        </SettingsContentScaffold>
    );
}
