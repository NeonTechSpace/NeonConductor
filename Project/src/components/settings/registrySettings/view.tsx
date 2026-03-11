import { AssetCard, AssetSection, SummaryCard } from '@/web/components/settings/registrySettings/components';
import { useRegistrySettingsController } from '@/web/components/settings/registrySettings/controller';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';
import { Button } from '@/web/components/ui/button';

interface RegistrySettingsViewProps {
    profileId: string;
}

function readModeInstructionsMarkdown(prompt: Record<string, unknown>): string {
    const instructionsMarkdown = prompt['instructionsMarkdown'];
    return typeof instructionsMarkdown === 'string' ? instructionsMarkdown : '';
}

export function RegistrySettingsScreen({ profileId }: RegistrySettingsViewProps) {
    const controller = useRegistrySettingsController(profileId);

    return (
        <section className='flex h-full min-h-0 min-w-0 flex-col overflow-hidden'>
            <div className='min-h-0 flex-1 overflow-y-auto p-4'>
                <div className='space-y-5'>
                    <SettingsFeedbackBanner message={controller.feedbackMessage} tone={controller.feedbackTone} />
                    <div className='flex flex-wrap items-start justify-between gap-3'>
                        <div className='max-w-3xl space-y-1'>
                            <h4 className='text-base font-semibold'>Agent Registry</h4>
                            <p className='text-muted-foreground text-sm leading-6'>
                                Inspect the resolved rules, skills, and custom agent modes the runtime can actually use. Refresh
                                either the global asset root or the selected workspace when file-backed assets change.
                            </p>
                        </div>
                        <div className='flex flex-wrap gap-2'>
                            <Button
                                type='button'
                                size='sm'
                                variant='outline'
                                disabled={controller.refreshMutation.isPending}
                                onClick={() => {
                                    void controller.refreshMutation.mutateAsync({ profileId });
                                }}>
                                {controller.refreshMutation.isPending && !controller.selectedWorkspaceFingerprint
                                    ? 'Refreshing…'
                                    : 'Refresh Global'}
                            </Button>
                            <Button
                                type='button'
                                size='sm'
                                variant='outline'
                                disabled={controller.refreshMutation.isPending || !controller.selectedWorkspaceFingerprint}
                                onClick={() => {
                                    if (!controller.selectedWorkspaceFingerprint) {
                                        return;
                                    }

                                    void controller.refreshMutation.mutateAsync({
                                        profileId,
                                        workspaceFingerprint: controller.selectedWorkspaceFingerprint,
                                    });
                                }}>
                                {controller.refreshMutation.isPending && controller.selectedWorkspaceFingerprint
                                    ? 'Refreshing…'
                                    : 'Refresh Workspace'}
                            </Button>
                        </div>
                    </div>

                    <div className='grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]'>
                        <div className='border-border bg-card rounded-2xl border p-4 shadow-sm'>
                            <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>Registry Roots</p>
                            <div className='mt-3 space-y-3'>
                                <div>
                                    <p className='text-sm font-semibold'>Global asset root</p>
                                    <p className='text-muted-foreground mt-1 break-all text-xs'>
                                        {controller.registryQuery.data?.paths.globalAssetsRoot ?? 'Loading...'}
                                    </p>
                                </div>
                                <div>
                                    <label className='text-sm font-semibold' htmlFor='registry-workspace-select'>
                                        Workspace context
                                    </label>
                                    <select
                                        id='registry-workspace-select'
                                        className='border-border bg-background mt-2 h-10 w-full rounded-xl border px-3 text-sm'
                                        value={controller.selectedWorkspaceFingerprint ?? ''}
                                        onChange={(event) => {
                                            const nextValue = event.target.value.trim();
                                            controller.setSelectedWorkspaceFingerprint(nextValue.length > 0 ? nextValue : undefined);
                                        }}>
                                        <option value=''>No workspace selected</option>
                                        {controller.workspaceRoots.map((workspaceRoot) => (
                                            <option key={workspaceRoot.fingerprint} value={workspaceRoot.fingerprint}>
                                                {workspaceRoot.label}
                                            </option>
                                        ))}
                                    </select>
                                    <p className='text-muted-foreground mt-2 break-all text-xs'>
                                        {controller.selectedWorkspaceRoot
                                            ? controller.selectedWorkspaceRoot.absolutePath
                                            : 'Choose a workspace to inspect workspace-scoped assets and refresh the local registry view.'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className='grid gap-3 sm:grid-cols-3 lg:grid-cols-1'>
                            <SummaryCard
                                label='Resolved Modes'
                                value={String(controller.resolvedAgentModes.length)}
                                detail='Agent-capable modes after precedence resolution'
                            />
                            <SummaryCard
                                label='Resolved Rules'
                                value={String(controller.registryQuery.data?.resolved.rulesets.length ?? 0)}
                                detail='Rules the active runtime can load for agent flows'
                            />
                            <SummaryCard
                                label='Resolved Skills'
                                value={String(controller.registryQuery.data?.resolved.skillfiles.length ?? 0)}
                                detail='Searchable skills after scope and precedence filtering'
                            />
                        </div>
                    </div>

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
                                    <span className='text-muted-foreground text-xs'>{controller.skillMatches.length} skills</span>
                                </div>
                                {controller.skillMatches.length > 0 ? (
                                    <div className='grid gap-3 xl:grid-cols-2'>
                                        {controller.skillMatches.map((skillfile) => (
                                            <AssetCard
                                                key={skillfile.id}
                                                asset={skillfile}
                                                title={skillfile.name}
                                                subtitle={skillfile.assetKey}
                                                bodyMarkdown={skillfile.bodyMarkdown}
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
                        title='Resolved Agent Modes'
                        emptyLabel='No resolved agent modes are available yet.'
                        assets={controller.resolvedAgentModes}
                        renderTitle={(asset) => asset.label}
                        renderSubtitle={(asset) => `${asset.modeKey} · ${asset.assetKey}`}
                        renderBodyMarkdown={(asset) => readModeInstructionsMarkdown(asset.prompt)}
                    />

                    <AssetSection
                        title='Resolved Rulesets'
                        emptyLabel='No resolved rulesets are available yet.'
                        assets={controller.registryQuery.data?.resolved.rulesets ?? []}
                        renderTitle={(asset) => asset.name}
                        renderSubtitle={(asset) => asset.assetKey}
                        renderBodyMarkdown={(asset) => asset.bodyMarkdown}
                    />

                    <AssetSection
                        title='Resolved Skills'
                        emptyLabel='No resolved skills are available yet.'
                        assets={controller.registryQuery.data?.resolved.skillfiles ?? []}
                        renderTitle={(asset) => asset.name}
                        renderSubtitle={(asset) => asset.assetKey}
                        renderBodyMarkdown={(asset) => asset.bodyMarkdown}
                    />

                    <AssetSection
                        title='Discovered Global Assets'
                        emptyLabel='No global file-backed assets have been discovered yet.'
                        assets={[
                            ...(controller.registryQuery.data?.discovered.global.modes ?? []),
                            ...(controller.registryQuery.data?.discovered.global.rulesets ?? []),
                            ...(controller.registryQuery.data?.discovered.global.skillfiles ?? []),
                        ]}
                        renderTitle={(asset) => ('label' in asset ? asset.label : asset.name)}
                        renderSubtitle={(asset) => asset.assetKey}
                        renderBodyMarkdown={(asset) =>
                            'bodyMarkdown' in asset ? asset.bodyMarkdown : readModeInstructionsMarkdown(asset.prompt)
                        }
                    />

                    {controller.selectedWorkspaceFingerprint ? (
                        <AssetSection
                            title='Discovered Workspace Assets'
                            emptyLabel='No workspace file-backed assets have been discovered for this workspace yet.'
                            assets={[
                                ...(controller.registryQuery.data?.discovered.workspace?.modes ?? []),
                                ...(controller.registryQuery.data?.discovered.workspace?.rulesets ?? []),
                                ...(controller.registryQuery.data?.discovered.workspace?.skillfiles ?? []),
                            ]}
                            renderTitle={(asset) => ('label' in asset ? asset.label : asset.name)}
                            renderSubtitle={(asset) => asset.assetKey}
                            renderBodyMarkdown={(asset) =>
                                'bodyMarkdown' in asset ? asset.bodyMarkdown : readModeInstructionsMarkdown(asset.prompt)
                            }
                        />
                    ) : null}
                </div>
            </div>
        </section>
    );
}
