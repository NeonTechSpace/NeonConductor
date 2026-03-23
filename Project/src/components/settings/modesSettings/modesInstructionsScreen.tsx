import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';
import {
    BuiltInModePromptCard,
    CustomModeEditorSection,
    FileBackedModeInventorySection,
    PromptInstructionsHeader,
    PromptLayerCard,
    formatBuiltInModeDescription,
    formatTopLevelLabel,
} from '@/web/components/settings/modesSettings/modesInstructionsSections';
import { useModesInstructionsSettingsController } from '@/web/components/settings/modesSettings/useModesInstructionsSettingsController';
import { Button } from '@/web/components/ui/button';

import { topLevelTabs, type TopLevelTab } from '@/shared/contracts';

export function ModesInstructionsScreen(input: {
    profileId: string;
    workspaceFingerprint?: string;
    selectedWorkspaceLabel?: string;
}) {
    const controller = useModesInstructionsSettingsController(input);

    if (controller.query.isLoading && !controller.query.data) {
        return <p className='text-muted-foreground text-sm'>Loading mode settings…</p>;
    }

    return (
        <div className='space-y-5'>
            <PromptInstructionsHeader />

            <SettingsFeedbackBanner message={controller.feedback.message} tone={controller.feedback.tone} />

            <div className='grid gap-5 xl:grid-cols-2'>
                <PromptLayerCard
                    title='App-Scope Global Instructions'
                    description='These instructions apply across the app before any profile, tab, mode, rule, or skill content.'
                    value={controller.appGlobal.value}
                    isSaving={controller.appGlobal.isSaving}
                    onChange={controller.appGlobal.setValue}
                    onSave={controller.appGlobal.save}
                    onReset={controller.appGlobal.reset}
                />

                <PromptLayerCard
                    title='Profile-Scope Global Instructions'
                    description='These instructions apply only to the selected profile after app-scope instructions and before built-in tab instructions.'
                    value={controller.profileGlobal.value}
                    isSaving={controller.profileGlobal.isSaving}
                    onChange={controller.profileGlobal.setValue}
                    onSave={controller.profileGlobal.save}
                    onReset={controller.profileGlobal.reset}
                />
            </div>

            <div className='space-y-3'>
                <div className='space-y-1'>
                    <h5 className='text-sm font-semibold'>Built-In Top-Level Instructions</h5>
                    <p className='text-muted-foreground text-sm leading-6'>
                        These layers sit above mode-specific prompts and below app/profile global instructions.
                    </p>
                </div>

                <div className='grid gap-5 xl:grid-cols-3'>
                    {topLevelTabs.map((topLevelTab) => (
                        <PromptLayerCard
                            key={topLevelTab}
                            title={`${formatTopLevelLabel(topLevelTab)} Instructions`}
                            description={`Shipped ${formatTopLevelLabel(topLevelTab).toLowerCase()} behavior lives here before mode-specific instructions are applied.`}
                            value={controller.topLevel.getValue(topLevelTab)}
                            isSaving={controller.topLevel.isSaving}
                            warning={`Editing built-in ${formatTopLevelLabel(topLevelTab).toLowerCase()} instructions can make the app behave differently than the shipped defaults.`}
                            onChange={(value) => {
                                controller.topLevel.setValue(topLevelTab, value);
                            }}
                            onSave={() => controller.topLevel.save(topLevelTab)}
                            onReset={() => controller.topLevel.reset(topLevelTab)}
                        />
                    ))}
                </div>
            </div>

            <div className='space-y-4'>
                <div className='space-y-1'>
                    <h5 className='text-sm font-semibold'>Built-In Mode Prompts</h5>
                    <p className='text-muted-foreground text-sm leading-6'>
                        These prompts define shipped mode-specific behavior under each run family. Editing them can make
                        the app behave unexpectedly.
                    </p>
                </div>

                {topLevelTabs.map((topLevelTab) => {
                    const items = controller.builtInModes.getItems(topLevelTab);
                    if (items.length === 0) {
                        return null;
                    }

                    return (
                        <div key={topLevelTab} className='space-y-3'>
                            <div className='space-y-1'>
                                <h6 className='text-sm font-semibold'>{formatTopLevelLabel(topLevelTab)} Modes</h6>
                                <p className='text-muted-foreground text-sm leading-6'>
                                    Reset any edited built-in mode to restore the shipped default prompt for that mode.
                                </p>
                            </div>

                            <div className='grid gap-5 xl:grid-cols-2'>
                                {items.map((mode) => (
                                    <BuiltInModePromptCard
                                        key={`${mode.topLevelTab}:${mode.modeKey}`}
                                        title={mode.label}
                                        description={formatBuiltInModeDescription(topLevelTab, mode.label)}
                                        roleDefinition={mode.prompt.roleDefinition ?? ''}
                                        customInstructions={mode.prompt.customInstructions ?? ''}
                                        hasOverride={mode.hasOverride}
                                        isSaving={controller.builtInModes.isSaving}
                                        warning={`Editing the built-in ${mode.label.toLowerCase()} prompt can make the app behave unexpectedly. Reset restores the shipped behavior.`}
                                        onRoleDefinitionChange={(value) => {
                                            controller.builtInModes.setPromptField(
                                                topLevelTab,
                                                mode.modeKey,
                                                'roleDefinition',
                                                value
                                            );
                                        }}
                                        onCustomInstructionsChange={(value) => {
                                            controller.builtInModes.setPromptField(
                                                topLevelTab,
                                                mode.modeKey,
                                                'customInstructions',
                                                value
                                            );
                                        }}
                                        onSave={() => controller.builtInModes.save(topLevelTab, mode.modeKey)}
                                        onReset={() => controller.builtInModes.reset(topLevelTab, mode.modeKey)}
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className='space-y-4'>
                <div className='flex flex-wrap items-start justify-between gap-3'>
                    <div className='space-y-1'>
                        <h5 className='text-sm font-semibold'>File-Backed Custom Modes</h5>
                        <p className='text-muted-foreground text-sm leading-6'>
                            Manage app-level file-backed custom modes while keeping the registry roots as the only
                            source of truth.
                        </p>
                    </div>

                    <div className='flex flex-wrap gap-2'>
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            onClick={() => {
                                controller.customModes.editor.openCreate('global');
                            }}>
                            Create Global Mode
                        </Button>
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={!controller.customModes.editor.hasWorkspaceScope}
                            onClick={() => {
                                controller.customModes.editor.openCreate('workspace');
                            }}>
                            Create Workspace Mode
                        </Button>
                    </div>
                </div>

                <CustomModeEditorSection editor={controller.customModes.editor} />

                <div className='grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]'>
                    <section className='border-border/70 bg-card/50 space-y-4 rounded-[24px] border p-5'>
                        <div className='space-y-1'>
                            <h6 className='text-sm font-semibold'>Import Portable Mode JSON</h6>
                            <p className='text-muted-foreground text-sm leading-6'>
                                Supported fields: <code>slug</code>, <code>name</code>, <code>description</code>,{' '}
                                <code>roleDefinition</code>, <code>customInstructions</code>, <code>whenToUse</code>,
                                and <code>groups</code>. Portable <code>groups</code> map into Neon tool
                                capabilities during import.
                            </p>
                        </div>

                        <div className='grid gap-4 md:grid-cols-2'>
                            <label className='space-y-2'>
                                <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>
                                    Top-Level Tab
                                </span>
                                <select
                                    className='border-border bg-background h-11 w-full rounded-2xl border px-3 text-sm'
                                    value={controller.customModes.importDraft.topLevelTab}
                                    onChange={(event) => {
                                        controller.customModes.setImportTopLevelTab(event.target.value as TopLevelTab);
                                    }}>
                                    {topLevelTabs.map((topLevelTab) => (
                                        <option key={topLevelTab} value={topLevelTab}>
                                            {formatTopLevelLabel(topLevelTab)}
                                        </option>
                                    ))}
                                </select>
                            </label>

                            <label className='space-y-2'>
                                <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>
                                    Target Scope
                                </span>
                                <select
                                    className='border-border bg-background h-11 w-full rounded-2xl border px-3 text-sm'
                                    value={controller.customModes.importDraft.scope}
                                    onChange={(event) => {
                                        controller.customModes.setImportScope(event.target.value as 'global' | 'workspace');
                                    }}>
                                    <option value='global'>Global</option>
                                    <option
                                        value='workspace'
                                        disabled={!controller.customModes.importDraft.hasWorkspaceScope}>
                                        Workspace
                                    </option>
                                </select>
                            </label>
                        </div>

                        <div className='border-border/70 bg-background/60 rounded-2xl border px-4 py-3 text-sm'>
                            {controller.customModes.importDraft.hasWorkspaceScope ? (
                                controller.customModes.importDraft.scope === 'workspace' ? (
                                    <span>
                                        Workspace target: {controller.customModes.importDraft.selectedWorkspaceLabel ?? 'Selected workspace'}
                                    </span>
                                ) : (
                                    <span>Import will write into the global <code>modes/</code> registry root.</span>
                                )
                            ) : (
                                <span>Workspace import is unavailable until a workspace is selected in the app shell.</span>
                            )}
                        </div>

                        <label className='space-y-2'>
                            <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>
                                Portable JSON
                            </span>
                            <textarea
                                value={controller.customModes.importDraft.jsonText}
                                onChange={(event) => {
                                    controller.customModes.setImportJsonText(event.target.value);
                                }}
                                className='border-border bg-background min-h-64 w-full rounded-2xl border px-4 py-3 font-mono text-sm leading-6'
                                spellCheck={false}
                                placeholder='{\n  "slug": "review",\n  "name": "Review",\n  "description": "Workspace review mode",\n  "roleDefinition": "Act as a precise reviewer.",\n  "customInstructions": "Review the workspace carefully.",\n  "whenToUse": "Use when a change needs a strict review pass.",\n  "groups": ["read", "command"]\n}'
                            />
                        </label>

                        <label className='flex items-start gap-3 rounded-2xl border border-dashed px-4 py-3 text-sm'>
                            <input
                                type='checkbox'
                                className='mt-1'
                                checked={controller.customModes.importDraft.allowOverwrite}
                                onChange={(event) => {
                                    controller.customModes.setAllowOverwrite(event.target.checked);
                                }}
                            />
                            <span className='text-muted-foreground leading-6'>
                                Explicitly allow overwrite if a file-backed mode with the same tab and key already
                                exists in the selected scope.
                            </span>
                        </label>

                        <div className='flex flex-wrap gap-2'>
                            <Button
                                type='button'
                                size='sm'
                                disabled={
                                    controller.customModes.isImporting ||
                                    (controller.customModes.importDraft.scope === 'workspace' &&
                                        !controller.customModes.importDraft.hasWorkspaceScope)
                                }
                                onClick={() => {
                                    void controller.customModes.importMode();
                                }}>
                                {controller.customModes.isImporting ? 'Importing…' : 'Import Mode'}
                            </Button>
                        </div>
                    </section>

                    <section className='border-border/70 bg-card/50 space-y-4 rounded-[24px] border p-5'>
                        <div className='space-y-1'>
                            <h6 className='text-sm font-semibold'>Export Portable Mode JSON</h6>
                            <p className='text-muted-foreground text-sm leading-6'>
                                Export reads from file-backed custom modes only. Built-in modes stay outside this
                                portability slice.
                            </p>
                        </div>

                        <div className='border-border/70 bg-background/60 rounded-2xl border px-4 py-3 text-sm'>
                            {controller.customModes.exportState.selectedLabel
                                ? `Selected export: ${controller.customModes.exportState.selectedLabel}`
                                : 'Choose a file-backed custom mode below to load export JSON here.'}
                        </div>

                        <label className='space-y-2'>
                            <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>
                                Export JSON
                            </span>
                            <textarea
                                readOnly
                                value={controller.customModes.exportState.jsonText}
                                className='border-border bg-background min-h-64 w-full rounded-2xl border px-4 py-3 font-mono text-sm leading-6'
                                spellCheck={false}
                            />
                        </label>

                        <div className='flex flex-wrap gap-2'>
                            <Button
                                type='button'
                                size='sm'
                                variant='outline'
                                disabled={controller.customModes.exportState.jsonText.trim().length === 0}
                                onClick={() => {
                                    void controller.customModes.copyExportJson();
                                }}>
                                Copy JSON
                            </Button>
                        </div>
                    </section>
                </div>

                <FileBackedModeInventorySection
                    scope='global'
                    itemsByTab={controller.customModes.global}
                    isExporting={controller.customModes.isExporting}
                    onExport={controller.customModes.exportMode}
                    onEdit={controller.customModes.editor.openEdit}
                    onDelete={controller.customModes.editor.openDelete}
                />

                {controller.workspace.fingerprint ? (
                    <FileBackedModeInventorySection
                        scope='workspace'
                        itemsByTab={controller.customModes.workspace}
                        isExporting={controller.customModes.isExporting}
                        onExport={controller.customModes.exportMode}
                        onEdit={controller.customModes.editor.openEdit}
                        onDelete={controller.customModes.editor.openDelete}
                    />
                ) : null}
            </div>
        </div>
    );
}
