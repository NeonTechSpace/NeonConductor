import { AssetCard, AssetSection, SummaryCard } from '@/web/components/settings/registrySettings/components';
import { useRegistrySettingsController } from '@/web/components/settings/registrySettings/controller';
import type { RegistrySettingsSubsectionId } from '@/web/components/settings/settingsNavigation';
import { SettingsContentScaffold } from '@/web/components/settings/shared/settingsContentScaffold';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';
import { Button } from '@/web/components/ui/button';

import { formatModePromptMarkdown } from '@/shared/contracts';

interface RegistrySettingsViewProps {
    profileId: string;
    subsection?: RegistrySettingsSubsectionId;
    onSubsectionChange?: (subsection: RegistrySettingsSubsectionId) => void;
}

export function RegistrySettingsScreen({
    profileId,
    subsection = 'rules',
}: RegistrySettingsViewProps) {
    const controller = useRegistrySettingsController(profileId);
    const { readModel } = controller;

    async function handleRefreshGlobal() {
        try {
            await controller.refreshMutation.mutateAsync({ profileId });
        } catch {
            return;
        }
    }

    async function handleRefreshWorkspace() {
        if (!controller.selectedWorkspaceFingerprint) {
            return;
        }

        try {
            await controller.refreshMutation.mutateAsync({
                profileId,
                workspaceFingerprint: controller.selectedWorkspaceFingerprint,
            });
        } catch {
            return;
        }
    }

    const title =
        subsection === 'diagnostics'
            ? 'How Neon found these files'
            : subsection === 'skills'
              ? 'Skills'
              : subsection === 'modes'
                ? 'Modes'
                : 'Rules';
    const description =
        subsection === 'diagnostics'
            ? 'See which folders Neon checks, which workspace is selected, and refresh the files Neon reads from disk.'
            : subsection === 'skills'
              ? 'Search the resolved skill inventory and inspect discovered skill assets separately from rules and modes.'
              : subsection === 'modes'
                ? 'Inspect resolved agent-capable modes separately from rules and skills.'
                : 'Inspect resolved and discovered rulesets without mixing them into general diagnostics.';

    return (
        <SettingsContentScaffold
            eyebrow='Rules, Skills & Modes'
            title={title}
            description={description}
            toolbar={
                subsection === 'diagnostics' ? (
                    <div className='flex flex-wrap gap-2'>
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={controller.refreshMutation.isPending}
                            onClick={() => {
                                void handleRefreshGlobal();
                            }}>
                            {controller.refreshMutation.isPending && !controller.selectedWorkspaceFingerprint
                                ? 'Refreshing…'
                                : 'Refresh global files'}
                        </Button>
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={controller.refreshMutation.isPending || !controller.selectedWorkspaceFingerprint}
                            onClick={() => {
                                void handleRefreshWorkspace();
                            }}>
                            {controller.refreshMutation.isPending && controller.selectedWorkspaceFingerprint
                                ? 'Refreshing…'
                                : 'Refresh workspace files'}
                        </Button>
                    </div>
                ) : undefined
            }>
            <SettingsFeedbackBanner message={controller.feedbackMessage} tone={controller.feedbackTone} />

            {subsection === 'diagnostics' ? (
                <div className='grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]'>
                    <div className='border-border bg-card rounded-2xl border p-4 shadow-sm'>
                        <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                            Folders Neon checks
                        </p>
                        <div className='mt-3 space-y-3'>
                            <div>
                                <p className='text-sm font-semibold'>Global mode root</p>
                                <p className='text-muted-foreground mt-1 text-xs break-all'>
                                    {readModel.globalModeRoot ?? 'Loading...'}
                                </p>
                            </div>
                            <div>
                                <p className='text-sm font-semibold'>Global native rules and skills root</p>
                                <p className='text-muted-foreground mt-1 text-xs break-all'>
                                    {readModel.globalNativeRoot ?? 'Loading...'}
                                </p>
                            </div>
                            <div>
                                <label className='text-sm font-semibold' htmlFor='registry-workspace-select'>
                                    Workspace to inspect
                                </label>
                                <select
                                    id='registry-workspace-select'
                                    className='border-border bg-background mt-2 h-10 w-full rounded-xl border px-3 text-sm'
                                    value={controller.selectedWorkspaceFingerprint ?? ''}
                                    onChange={(event) => {
                                        const nextValue = event.target.value.trim();
                                        controller.setSelectedWorkspaceFingerprint(
                                            nextValue.length > 0 ? nextValue : undefined
                                        );
                                    }}>
                                    <option value=''>No workspace selected</option>
                                    {readModel.workspaceRoots.map((workspaceRoot) => (
                                        <option key={workspaceRoot.fingerprint} value={workspaceRoot.fingerprint}>
                                            {workspaceRoot.label}
                                        </option>
                                    ))}
                                </select>
                                <p className='text-muted-foreground mt-2 text-xs break-all'>
                                    {readModel.selectedWorkspaceRoot
                                        ? readModel.selectedWorkspaceRoot.absolutePath
                                        : 'Choose a workspace to inspect workspace-only files and refresh the local results.'}
                                </p>
                                {readModel.workspaceModeRoot || readModel.workspaceNativeRoot ? (
                                    <div className='mt-2 space-y-1 text-xs'>
                                        <p className='text-muted-foreground break-all'>
                                            Mode root: {readModel.workspaceModeRoot ?? 'Unavailable'}
                                        </p>
                                        <p className='text-muted-foreground break-all'>
                                            Native rules and skills root: {readModel.workspaceNativeRoot ?? 'Unavailable'}
                                        </p>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    <div className='grid gap-3 sm:grid-cols-3 lg:grid-cols-1'>
                        <SummaryCard
                            label='Available Modes'
                            value={String(readModel.resolvedAgentModes.length)}
                            detail='Modes Neon can use right now'
                        />
                        <SummaryCard
                            label='Available Rules'
                            value={String(readModel.resolvedRules.length)}
                            detail='Rules Neon can use right now'
                        />
                        <SummaryCard
                            label='Available Skills'
                            value={String(readModel.resolvedSkills.length)}
                            detail='Skills Neon can use right now'
                        />
                    </div>
                </div>
            ) : null}

            {subsection === 'diagnostics' ? (
                <div className='grid gap-3 lg:grid-cols-2'>
                    <div className='border-border bg-card rounded-2xl border p-4 shadow-sm'>
                        <div className='flex items-center justify-between gap-3'>
                            <p className='text-sm font-semibold'>Global discovery diagnostics</p>
                            <span className='text-muted-foreground text-xs'>{readModel.globalDiagnostics.length} items</span>
                        </div>
                        {readModel.globalDiagnostics.length > 0 ? (
                            <div className='mt-3 space-y-2'>
                                {readModel.globalDiagnostics.map((diagnostic) => (
                                    <div key={diagnostic.id} className='rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs'>
                                        <p className='font-semibold'>
                                            {diagnostic.assetKind} · {diagnostic.code}
                                        </p>
                                        <p className='text-muted-foreground mt-1 break-all'>{diagnostic.relativePath}</p>
                                        <p className='mt-1'>{diagnostic.message}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className='text-muted-foreground mt-3 text-sm'>No global discovery problems right now.</p>
                        )}
                    </div>
                    <div className='border-border bg-card rounded-2xl border p-4 shadow-sm'>
                        <div className='flex items-center justify-between gap-3'>
                            <p className='text-sm font-semibold'>Workspace discovery diagnostics</p>
                            <span className='text-muted-foreground text-xs'>{readModel.workspaceDiagnostics.length} items</span>
                        </div>
                        {readModel.workspaceDiagnostics.length > 0 ? (
                            <div className='mt-3 space-y-2'>
                                {readModel.workspaceDiagnostics.map((diagnostic) => (
                                    <div key={diagnostic.id} className='rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs'>
                                        <p className='font-semibold'>
                                            {diagnostic.assetKind} · {diagnostic.code}
                                        </p>
                                        <p className='text-muted-foreground mt-1 break-all'>{diagnostic.relativePath}</p>
                                        <p className='mt-1'>{diagnostic.message}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className='text-muted-foreground mt-3 text-sm'>
                                {controller.selectedWorkspaceFingerprint
                                    ? 'No workspace discovery problems right now.'
                                    : 'Choose a workspace to inspect workspace-local diagnostics.'}
                            </p>
                        )}
                    </div>
                </div>
            ) : null}

            {subsection === 'skills' ? (
                <>
                    <div className='border-border bg-card rounded-2xl border p-4 shadow-sm'>
                        <label className='text-sm font-semibold' htmlFor='registry-skill-search'>
                            Skill Search
                        </label>
                        <input
                            id='registry-skill-search'
                            type='text'
                            name='registrySkillSearch'
                            value={controller.skillQuery}
                            onChange={(event) => {
                                controller.setSkillQuery(event.target.value);
                            }}
                            className='border-border bg-background mt-2 h-10 w-full rounded-xl border px-3 text-sm'
                            autoComplete='off'
                            placeholder='Search by skill name, description, or tag…'
                        />
                        {controller.skillQuery.trim().length > 0 ? (
                            <div className='mt-4 space-y-3'>
                                <div className='flex items-center justify-between gap-3'>
                                    <p className='text-sm font-semibold'>Matches</p>
                                    <span className='text-muted-foreground text-xs'>
                                        {readModel.skillMatches.length} skills
                                    </span>
                                </div>
                                {readModel.skillMatches.length > 0 ? (
                                    <div className='grid gap-3 xl:grid-cols-2'>
                                        {readModel.skillMatches.map((skillfile) => (
                                            <AssetCard
                                                key={skillfile.id}
                                                asset={skillfile}
                                                title={skillfile.name}
                                                subtitle={skillfile.assetKey}
                                                profileId={profileId}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <p className='text-muted-foreground rounded-2xl border border-dashed px-4 py-5 text-sm'>
                                        No skills matched that search yet.
                                    </p>
                                )}
                            </div>
                        ) : null}
                    </div>

                    <AssetSection
                        title='Resolved Skills'
                        emptyLabel='No resolved skills are available yet.'
                        assets={readModel.resolvedSkills}
                        renderTitle={(asset) => asset.name}
                        renderSubtitle={(asset) => asset.assetKey}
                        profileId={profileId}
                    />
                    <AssetSection
                        title='Discovered Global Skills'
                        emptyLabel='No global skill assets have been discovered yet.'
                        assets={readModel.discoveredGlobalSkills}
                        renderTitle={(asset) => asset.name}
                        renderSubtitle={(asset) => asset.assetKey}
                        profileId={profileId}
                    />
                    {controller.selectedWorkspaceFingerprint ? (
                        <AssetSection
                            title='Discovered Workspace Skills'
                            emptyLabel='No workspace skill assets have been discovered for this workspace yet.'
                            assets={readModel.discoveredWorkspaceSkills}
                            renderTitle={(asset) => asset.name}
                            renderSubtitle={(asset) => asset.assetKey}
                            profileId={profileId}
                        />
                    ) : null}
                </>
            ) : null}

            {subsection === 'rules' ? (
                <>
                    <AssetSection
                        title='Resolved Rulesets'
                        emptyLabel='No resolved rulesets are available yet.'
                        assets={readModel.resolvedRules}
                        renderTitle={(asset) => asset.name}
                        renderSubtitle={(asset) => asset.assetKey}
                        renderBodyMarkdown={(asset) => asset.bodyMarkdown}
                        profileId={profileId}
                    />
                    <AssetSection
                        title='Discovered Global Rulesets'
                        emptyLabel='No global file-backed rulesets have been discovered yet.'
                        assets={readModel.discoveredGlobalRules}
                        renderTitle={(asset) => asset.name}
                        renderSubtitle={(asset) => asset.assetKey}
                        renderBodyMarkdown={(asset) => asset.bodyMarkdown}
                        profileId={profileId}
                    />
                    {controller.selectedWorkspaceFingerprint ? (
                        <AssetSection
                            title='Discovered Workspace Rulesets'
                            emptyLabel='No workspace rulesets have been discovered for this workspace yet.'
                            assets={readModel.discoveredWorkspaceRules}
                            renderTitle={(asset) => asset.name}
                            renderSubtitle={(asset) => asset.assetKey}
                            renderBodyMarkdown={(asset) => asset.bodyMarkdown}
                            profileId={profileId}
                        />
                    ) : null}
                </>
            ) : null}

            {subsection === 'modes' ? (
                <>
                    <AssetSection
                        title='Resolved Agent Modes'
                        emptyLabel='No resolved agent modes are available yet.'
                        assets={readModel.resolvedAgentModes}
                        renderTitle={(asset) => asset.label}
                        renderSubtitle={(asset) => `${asset.modeKey} · ${asset.assetKey}`}
                        renderBodyMarkdown={(asset) => formatModePromptMarkdown(asset.prompt)}
                        profileId={profileId}
                    />
                    <AssetSection
                        title='Discovered Global Modes'
                        emptyLabel='No global mode assets have been discovered yet.'
                        assets={readModel.discoveredGlobalModes}
                        renderTitle={(asset) => asset.label}
                        renderSubtitle={(asset) => asset.assetKey}
                        renderBodyMarkdown={(asset) => formatModePromptMarkdown(asset.prompt)}
                        profileId={profileId}
                    />
                    {controller.selectedWorkspaceFingerprint ? (
                        <AssetSection
                            title='Discovered Workspace Modes'
                            emptyLabel='No workspace mode assets have been discovered for this workspace yet.'
                            assets={readModel.discoveredWorkspaceModes}
                            renderTitle={(asset) => asset.label}
                            renderSubtitle={(asset) => asset.assetKey}
                            renderBodyMarkdown={(asset) => formatModePromptMarkdown(asset.prompt)}
                            profileId={profileId}
                        />
                    ) : null}
                </>
            ) : null}
        </SettingsContentScaffold>
    );
}
