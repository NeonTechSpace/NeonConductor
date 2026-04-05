
import type { FileBackedModeItemsByTab } from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';
import {
    formatDelimitedLabel,
    formatRuntimeProfileLabel,
} from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';
import type {
    BuiltInToolMetadataCardModel,
    PromptLayerSectionModel,
} from '@/web/components/settings/modesSettings/modesInstructionsViewModel';
import { Button } from '@/web/components/ui/button';
import { isOneOf } from '@/web/lib/typeGuards/isOneOf';

import {
    behaviorFlags,
    runtimeRequirementProfiles,
    toolCapabilities,
    topLevelTabs,
    workflowCapabilities,
    type BehaviorFlag,
    type RuntimeRequirementProfile,
    type ToolCapability,
    type TopLevelTab,
    type WorkflowCapability,
} from '@/shared/contracts';

import type { ReactNode } from 'react';

function isTopLevelTab(value: string): value is TopLevelTab {
    return isOneOf(value, topLevelTabs);
}

function isCustomModeScope(value: string): value is 'global' | 'workspace' {
    return value === 'global' || value === 'workspace';
}

export function TopLevelPromptSection(input: {
    title: string;
    description: string;
    children: ReactNode;
}) {
    return (
        <div className='space-y-3'>
            <div className='space-y-1'>
                <h5 className='text-sm font-semibold'>{input.title}</h5>
                <p className='text-muted-foreground text-sm leading-6'>{input.description}</p>
            </div>
            {input.children}
        </div>
    );
}

export function PromptLayerCard(input: PromptLayerSectionModel & {
    onChange: (value: string) => void;
    onSave: () => void;
    onReset: () => void;
}) {
    return (
        <section className='border-border/70 bg-card/50 space-y-4 rounded-[24px] border p-5'>
            <div className='space-y-1'>
                <h5 className='text-sm font-semibold'>{input.title}</h5>
                <p className='text-muted-foreground text-sm leading-6'>{input.description}</p>
            </div>

            {input.warning ? (
                <div className='rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100'>
                    {input.warning}
                </div>
            ) : null}

            <label className='space-y-2'>
                <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>
                    Instructions
                </span>
                <textarea
                    value={input.value}
                    onChange={(event) => {
                        input.onChange(event.target.value);
                    }}
                    className='border-border bg-background min-h-40 w-full rounded-2xl border px-4 py-3 text-sm leading-6'
                    spellCheck={false}
                />
            </label>

            <div className='flex flex-wrap gap-2'>
                <Button
                    type='button'
                    size='sm'
                    disabled={input.isSaving}
                    onClick={() => {
                        input.onSave();
                    }}>
                    {input.isSaving ? 'Saving…' : 'Save'}
                </Button>
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={input.isSaving}
                    onClick={() => {
                        input.onReset();
                    }}>
                    Reset
                </Button>
            </div>
        </section>
    );
}

export function BuiltInModePromptCard(input: {
    title: string;
    description: string;
    roleDefinition: string;
    customInstructions: string;
    hasOverride: boolean;
    isSaving: boolean;
    warning: string;
    onRoleDefinitionChange: (value: string) => void;
    onCustomInstructionsChange: (value: string) => void;
    onSave: () => void;
    onReset: () => void;
}) {
    return (
        <section className='border-border/70 bg-card/50 space-y-4 rounded-[24px] border p-5'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='space-y-1'>
                    <h5 className='text-sm font-semibold'>{input.title}</h5>
                    <p className='text-muted-foreground text-sm leading-6'>{input.description}</p>
                </div>
                <div className='border-border/70 bg-background/80 rounded-full border px-3 py-1 text-[11px] font-medium'>
                    {input.hasOverride ? 'Override active' : 'Using shipped defaults'}
                </div>
            </div>

            <div className='rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100'>
                {input.warning}
            </div>

            <label className='space-y-2'>
                <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>
                    Role Definition
                </span>
                <textarea
                    value={input.roleDefinition}
                    onChange={(event) => {
                        input.onRoleDefinitionChange(event.target.value);
                    }}
                    className='border-border bg-background min-h-28 w-full rounded-2xl border px-4 py-3 text-sm leading-6'
                    spellCheck={false}
                />
            </label>

            <label className='space-y-2'>
                <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>
                    Custom Instructions
                </span>
                <textarea
                    value={input.customInstructions}
                    onChange={(event) => {
                        input.onCustomInstructionsChange(event.target.value);
                    }}
                    className='border-border bg-background min-h-36 w-full rounded-2xl border px-4 py-3 text-sm leading-6'
                    spellCheck={false}
                />
            </label>

            <div className='flex flex-wrap gap-2'>
                <Button
                    type='button'
                    size='sm'
                    disabled={input.isSaving}
                    onClick={() => {
                        input.onSave();
                    }}>
                    {input.isSaving ? 'Saving…' : 'Save'}
                </Button>
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={input.isSaving}
                    onClick={() => {
                        input.onReset();
                    }}>
                    Reset
                </Button>
            </div>
        </section>
    );
}

export function BuiltInToolMetadataCard(
    input: BuiltInToolMetadataCardModel & {
        isSaving: boolean;
        onChange: (value: string) => void;
        onSave: () => void;
        onReset: () => void;
    }
) {
    return (
        <section className='border-border/70 bg-card/50 space-y-4 rounded-[24px] border p-5'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='space-y-1'>
                    <h5 className='text-sm font-semibold'>{input.label}</h5>
                    <p className='text-muted-foreground text-sm leading-6'>
                        Adjust the base description the model sees for this built-in native tool. Runtime-only guidance
                        still appends after this text.
                    </p>
                </div>
                <div className='border-border/70 bg-background/80 rounded-full border px-3 py-1 text-[11px] font-medium'>
                    {input.isModified ? 'Modified' : 'Default'}
                </div>
            </div>

            <div className='border-border/70 bg-background/60 rounded-2xl border px-4 py-3 text-sm'>
                Tool ID: <code>{input.toolId}</code>
            </div>

            <label className='space-y-2'>
                <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>
                    Description
                </span>
                <textarea
                    value={input.description}
                    onChange={(event) => {
                        input.onChange(event.target.value);
                    }}
                    className='border-border bg-background min-h-28 w-full rounded-2xl border px-4 py-3 text-sm leading-6'
                    spellCheck={false}
                />
            </label>

            <div className='space-y-2'>
                <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>
                    Shipped Default
                </span>
                <div className='border-border/70 bg-background/60 rounded-2xl border px-4 py-3 text-sm leading-6'>
                    {input.defaultDescription}
                </div>
            </div>

            <div className='flex flex-wrap gap-2'>
                <Button
                    type='button'
                    size='sm'
                    disabled={input.isSaving}
                    onClick={() => {
                        input.onSave();
                    }}>
                    {input.isSaving ? 'Saving…' : 'Save'}
                </Button>
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={input.isSaving}
                    onClick={() => {
                        input.onReset();
                    }}>
                    Reset
                </Button>
            </div>
        </section>
    );
}

export function formatTopLevelLabel(topLevelTab: TopLevelTab): string {
    return topLevelTab === 'chat' ? 'Chat' : topLevelTab === 'agent' ? 'Agent' : 'Orchestrator';
}

export function formatBuiltInModeDescription(topLevelTab: TopLevelTab, label: string): string {
    return `This shipped ${label.toLowerCase()} prompt runs inside ${formatTopLevelLabel(topLevelTab).toLowerCase()} after top-level instructions and before rules or attached skills.`;
}

export function formatToolCapabilityLabel(toolCapability: ToolCapability): string {
    return formatDelimitedLabel(toolCapability);
}

function formatWorkflowCapabilityLabel(workflowCapability: WorkflowCapability): string {
    return formatDelimitedLabel(workflowCapability);
}

function formatBehaviorFlagLabel(behaviorFlag: BehaviorFlag): string {
    return formatDelimitedLabel(behaviorFlag);
}

export function CustomModeEditorSection(input: {
    editor: {
        draft: {
            kind: 'create' | 'edit';
            scope: 'global' | 'workspace';
            topLevelTab: TopLevelTab;
            modeKey?: string;
            slug: string;
            name: string;
            description: string;
            roleDefinition: string;
            customInstructions: string;
            whenToUse: string;
            tagsText: string;
            selectedToolCapabilities: ToolCapability[];
            selectedWorkflowCapabilities: WorkflowCapability[];
            selectedBehaviorFlags: BehaviorFlag[];
            selectedRuntimeProfile: RuntimeRequirementProfile;
            deleteConfirmed: boolean;
        } | undefined;
        isLoading: boolean;
        isSaving: boolean;
        hasWorkspaceScope: boolean;
        selectedWorkspaceLabel: string | undefined;
        openCreate: (scope: 'global' | 'workspace') => void;
        openEdit: (scope: 'global' | 'workspace', topLevelTab: TopLevelTab, modeKey: string) => Promise<void>;
        openDelete: (scope: 'global' | 'workspace', topLevelTab: TopLevelTab, modeKey: string) => Promise<void>;
        close: () => void;
        setScope: (scope: 'global' | 'workspace') => void;
        setTopLevelTab: (topLevelTab: TopLevelTab) => void;
        setField: (
            field:
                | 'slug'
                | 'name'
                | 'description'
                | 'roleDefinition'
                | 'customInstructions'
                | 'whenToUse'
                | 'tagsText',
            value: string
        ) => void;
        toggleToolCapability: (toolCapability: ToolCapability) => void;
        toggleWorkflowCapability: (workflowCapability: WorkflowCapability) => void;
        toggleBehaviorFlag: (behaviorFlag: BehaviorFlag) => void;
        setRuntimeProfile: (runtimeProfile: RuntimeRequirementProfile) => void;
        setDeleteConfirmed: (value: boolean) => void;
        save: () => Promise<void>;
        deleteMode: () => Promise<void>;
    };
}) {
    if (input.editor.isLoading && !input.editor.draft) {
        return (
            <section className='border-border/70 bg-card/50 rounded-[24px] border p-5'>
                <p className='text-sm font-semibold'>Loading custom mode…</p>
            </section>
        );
    }

    const draft = input.editor.draft;
    if (!draft) {
        return null;
    }

    return (
        <section className='border-border/70 bg-card/50 space-y-4 rounded-[24px] border p-5'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='space-y-1'>
                    <h6 className='text-sm font-semibold'>
                        {draft.kind === 'create' ? 'Create File-Backed Custom Mode' : 'Edit File-Backed Custom Mode'}
                    </h6>
                    <p className='text-muted-foreground text-sm leading-6'>
                        {draft.kind === 'create'
                            ? 'Create a file-backed custom mode in the selected registry root.'
                            : 'Edit the existing file-backed mode in place. Scope, tab, and slug stay immutable after creation.'}
                    </p>
                </div>

                <div className='flex flex-wrap gap-2'>
                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        disabled={input.editor.isSaving}
                        onClick={input.editor.close}>
                        Cancel
                    </Button>
                    <Button
                        type='button'
                        size='sm'
                        disabled={
                            input.editor.isSaving || (draft.scope === 'workspace' && !input.editor.hasWorkspaceScope)
                        }
                        onClick={() => {
                            void input.editor.save();
                        }}>
                        {input.editor.isSaving
                            ? draft.kind === 'create'
                                ? 'Creating…'
                                : 'Saving…'
                            : draft.kind === 'create'
                              ? 'Create Mode'
                              : 'Save Mode'}
                    </Button>
                </div>
            </div>

            <div className='grid gap-4 md:grid-cols-2'>
                <label className='space-y-2'>
                    <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>
                        Scope
                    </span>
                    {draft.kind === 'create' ? (
                        <select
                            className='border-border bg-background h-11 w-full rounded-2xl border px-3 text-sm'
                            value={draft.scope}
                            onChange={(event) => {
                                if (!isCustomModeScope(event.target.value)) {
                                    return;
                                }
                                input.editor.setScope(event.target.value);
                            }}>
                            <option value='global'>Global</option>
                            <option value='workspace' disabled={!input.editor.hasWorkspaceScope}>
                                Workspace
                            </option>
                        </select>
                    ) : (
                        <input
                            readOnly
                            className='border-border bg-background h-11 w-full rounded-2xl border px-3 text-sm'
                            value={draft.scope === 'global' ? 'Global' : 'Workspace'}
                        />
                    )}
                </label>

                <label className='space-y-2'>
                    <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>
                        Top-Level Tab
                    </span>
                    {draft.kind === 'create' ? (
                        <select
                            className='border-border bg-background h-11 w-full rounded-2xl border px-3 text-sm'
                            value={draft.topLevelTab}
                            onChange={(event) => {
                                if (!isTopLevelTab(event.target.value)) {
                                    return;
                                }
                                input.editor.setTopLevelTab(event.target.value);
                            }}>
                            {topLevelTabs.map((topLevelTab) => (
                                <option key={topLevelTab} value={topLevelTab}>
                                    {formatTopLevelLabel(topLevelTab)}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <input
                            readOnly
                            className='border-border bg-background h-11 w-full rounded-2xl border px-3 text-sm'
                            value={formatTopLevelLabel(draft.topLevelTab)}
                        />
                    )}
                </label>
            </div>

            <div className='grid gap-4 md:grid-cols-2'>
                <label className='space-y-2'>
                    <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>
                        Slug
                    </span>
                    <input
                        readOnly={draft.kind === 'edit'}
                        className='border-border bg-background h-11 w-full rounded-2xl border px-3 text-sm'
                        value={draft.slug}
                        onChange={(event) => {
                            input.editor.setField('slug', event.target.value);
                        }}
                    />
                </label>

                <label className='space-y-2'>
                    <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>
                        Name
                    </span>
                    <input
                        className='border-border bg-background h-11 w-full rounded-2xl border px-3 text-sm'
                        value={draft.name}
                        onChange={(event) => {
                            input.editor.setField('name', event.target.value);
                        }}
                    />
                </label>
            </div>

            <label className='space-y-2'>
                <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>
                    Description
                </span>
                <textarea
                    value={draft.description}
                    onChange={(event) => {
                        input.editor.setField('description', event.target.value);
                    }}
                    className='border-border bg-background min-h-24 w-full rounded-2xl border px-4 py-3 text-sm leading-6'
                    spellCheck={false}
                />
            </label>

            <label className='space-y-2'>
                <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>
                    When To Use
                </span>
                <textarea
                    value={draft.whenToUse}
                    onChange={(event) => {
                        input.editor.setField('whenToUse', event.target.value);
                    }}
                    className='border-border bg-background min-h-24 w-full rounded-2xl border px-4 py-3 text-sm leading-6'
                    spellCheck={false}
                />
            </label>

            <label className='space-y-2'>
                <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>Tags</span>
                <textarea
                    value={draft.tagsText}
                    onChange={(event) => {
                        input.editor.setField('tagsText', event.target.value);
                    }}
                    className='border-border bg-background min-h-20 w-full rounded-2xl border px-4 py-3 text-sm leading-6'
                    spellCheck={false}
                    placeholder='quality, review'
                />
                <p className='text-muted-foreground text-xs leading-5'>Separate tags with commas or new lines.</p>
            </label>

            <div className='space-y-2'>
                <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>
                    Tool Capabilities
                </span>
                <p className='text-muted-foreground text-xs leading-5'>
                    Low-level tool authority for this mode, such as filesystem access or shell execution.
                </p>
                <div className='grid gap-3 md:grid-cols-2'>
                    {toolCapabilities.map((toolCapability) => (
                        <label
                            key={toolCapability}
                            className='border-border bg-background flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm'>
                            <input
                                type='checkbox'
                                className='mt-1'
                                checked={draft.selectedToolCapabilities.includes(toolCapability)}
                                onChange={() => {
                                    input.editor.toggleToolCapability(toolCapability);
                                }}
                            />
                            <span className='leading-6'>{formatToolCapabilityLabel(toolCapability)}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className='space-y-2'>
                <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>
                    Workflow Capabilities
                </span>
                <p className='text-muted-foreground text-xs leading-5'>
                    Higher-level product behaviors this mode is intended to participate in.
                </p>
                <div className='grid gap-3 md:grid-cols-2'>
                    {workflowCapabilities.map((workflowCapability) => (
                        <label
                            key={workflowCapability}
                            className='border-border bg-background flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm'>
                            <input
                                type='checkbox'
                                className='mt-1'
                                checked={draft.selectedWorkflowCapabilities.includes(workflowCapability)}
                                onChange={() => {
                                    input.editor.toggleWorkflowCapability(workflowCapability);
                                }}
                            />
                            <span className='leading-6'>{formatWorkflowCapabilityLabel(workflowCapability)}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className='space-y-2'>
                <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>
                    Behavior Flags
                </span>
                <p className='text-muted-foreground text-xs leading-5'>
                    Operational traits such as approval gating, artifact production, or worker delegation intent.
                </p>
                <div className='grid gap-3 md:grid-cols-2'>
                    {behaviorFlags.map((behaviorFlag) => (
                        <label
                            key={behaviorFlag}
                            className='border-border bg-background flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm'>
                            <input
                                type='checkbox'
                                className='mt-1'
                                checked={draft.selectedBehaviorFlags.includes(behaviorFlag)}
                                onChange={() => {
                                    input.editor.toggleBehaviorFlag(behaviorFlag);
                                }}
                            />
                            <span className='leading-6'>{formatBehaviorFlagLabel(behaviorFlag)}</span>
                        </label>
                    ))}
                </div>
            </div>

            <label className='space-y-2'>
                <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>
                    Runtime Profile
                </span>
                <select
                    className='border-border bg-background h-11 w-full rounded-2xl border px-3 text-sm'
                    value={draft.selectedRuntimeProfile}
                    onChange={(event) => {
                        if (!runtimeRequirementProfiles.includes(event.target.value as RuntimeRequirementProfile)) {
                            return;
                        }
                        input.editor.setRuntimeProfile(event.target.value as RuntimeRequirementProfile);
                    }}>
                    {runtimeRequirementProfiles.map((runtimeProfile) => (
                        <option key={runtimeProfile} value={runtimeProfile}>
                            {formatRuntimeProfileLabel(runtimeProfile)}
                        </option>
                    ))}
                </select>
                <p className='text-muted-foreground text-xs leading-5'>
                    Routing and compatibility intent for this mode. Slice A records the profile now; runtime behavior
                    still migrates in later slices.
                </p>
            </label>

            <div className='grid gap-4 xl:grid-cols-2'>
                <label className='space-y-2'>
                    <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>
                        Role Definition
                    </span>
                    <textarea
                        value={draft.roleDefinition}
                        onChange={(event) => {
                            input.editor.setField('roleDefinition', event.target.value);
                        }}
                        className='border-border bg-background min-h-32 w-full rounded-2xl border px-4 py-3 text-sm leading-6'
                        spellCheck={false}
                    />
                </label>

                <label className='space-y-2'>
                    <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>
                        Custom Instructions
                    </span>
                    <textarea
                        value={draft.customInstructions}
                        onChange={(event) => {
                            input.editor.setField('customInstructions', event.target.value);
                        }}
                        className='border-border bg-background min-h-32 w-full rounded-2xl border px-4 py-3 text-sm leading-6'
                        spellCheck={false}
                    />
                </label>
            </div>

            <div className='border-border/70 bg-background/60 rounded-2xl border px-4 py-3 text-sm'>
                {draft.scope === 'workspace' ? (
                    <span>Workspace target: {input.editor.selectedWorkspaceLabel ?? 'Selected workspace'}</span>
                ) : (
                    <span>
                        Target root: global <code>modes/</code>
                    </span>
                )}
            </div>

            {draft.kind === 'edit' ? (
                <div className='border-destructive/25 bg-destructive/5 space-y-3 rounded-2xl border px-4 py-4'>
                    <p className='text-sm font-semibold'>Delete This Mode</p>
                    <p className='text-muted-foreground text-sm leading-6'>
                        This deletes the file-backed mode for {draft.scope} {formatTopLevelLabel(draft.topLevelTab)}:{' '}
                        {draft.modeKey}.
                    </p>
                    <label className='flex items-start gap-3 text-sm'>
                        <input
                            type='checkbox'
                            className='mt-1'
                            checked={draft.deleteConfirmed}
                            onChange={(event) => {
                                input.editor.setDeleteConfirmed(event.target.checked);
                            }}
                        />
                        <span className='text-muted-foreground leading-6'>
                            I understand this will delete the file-backed custom mode and rely on normal fallback
                            resolution afterward.
                        </span>
                    </label>
                    <Button
                        type='button'
                        size='sm'
                        variant='destructive'
                        disabled={input.editor.isSaving || !draft.deleteConfirmed}
                        onClick={() => {
                            void input.editor.deleteMode();
                        }}>
                        {input.editor.isSaving ? 'Deleting…' : 'Delete Mode'}
                    </Button>
                </div>
            ) : null}
        </section>
    );
}

export function FileBackedModeInventorySection(input: {
    scope: 'global' | 'workspace';
    itemsByTab: FileBackedModeItemsByTab;
    isExporting: boolean;
    onExport: (scope: 'global' | 'workspace', topLevelTab: TopLevelTab, modeKey: string) => void;
    onEdit: (scope: 'global' | 'workspace', topLevelTab: TopLevelTab, modeKey: string) => void;
    onDelete: (scope: 'global' | 'workspace', topLevelTab: TopLevelTab, modeKey: string) => void;
}) {
    const hasItems = topLevelTabs.some((topLevelTab) => input.itemsByTab[topLevelTab].length > 0);
    if (!hasItems) {
        return (
            <div className='border-border/70 bg-card/40 rounded-[24px] border p-5'>
                <p className='text-sm font-semibold'>
                    No {input.scope === 'global' ? 'global' : 'workspace'} file-backed custom modes
                </p>
                <p className='text-muted-foreground mt-2 text-sm leading-6'>
                    Import a portable mode JSON object here to create one through the existing registry root.
                </p>
            </div>
        );
    }

    return (
        <div className='space-y-4'>
            {topLevelTabs.map((topLevelTab) => {
                const items = input.itemsByTab[topLevelTab];
                if (items.length === 0) {
                    return null;
                }

                return (
                    <div key={`${input.scope}:${topLevelTab}`} className='space-y-3'>
                        <div className='space-y-1'>
                            <h6 className='text-sm font-semibold'>
                                {input.scope === 'global' ? 'Global' : 'Workspace'} {formatTopLevelLabel(topLevelTab)}{' '}
                                Modes
                            </h6>
                            <p className='text-muted-foreground text-sm leading-6'>
                                These are file-backed custom modes discovered through the existing registry root.
                            </p>
                        </div>

                        <div className='grid gap-4 xl:grid-cols-2'>
                            {items.map((mode) => (
                                <article
                                    key={`${input.scope}:${mode.topLevelTab}:${mode.modeKey}`}
                                    className='border-border/70 bg-card/50 space-y-3 rounded-[24px] border p-5'>
                                    <div className='space-y-1'>
                                        <div className='flex flex-wrap items-center justify-between gap-3'>
                                            <h6 className='text-sm font-semibold'>{mode.label}</h6>
                                            <span className='border-border/70 bg-background/80 rounded-full border px-3 py-1 text-[11px] font-medium'>
                                                {formatTopLevelLabel(mode.topLevelTab)} · {mode.modeKey}
                                            </span>
                                        </div>
                                        <p className='text-muted-foreground text-sm leading-6'>
                                            {mode.description ?? 'No description set for this file-backed mode yet.'}
                                        </p>
                                        {mode.whenToUse ? (
                                            <p className='text-muted-foreground text-sm leading-6'>
                                                <span className='text-foreground font-medium'>When to use:</span>{' '}
                                                {mode.whenToUse}
                                            </p>
                                        ) : null}
                                        {mode.tags && mode.tags.length > 0 ? (
                                            <div className='flex flex-wrap gap-2 pt-1'>
                                                {mode.tags.map((tag) => (
                                                    <span
                                                        key={`${mode.modeKey}:tag:${tag}`}
                                                        className='border-border/70 bg-background/80 rounded-full border px-3 py-1 text-[11px] font-medium'>
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : null}
                                        {mode.toolCapabilities && mode.toolCapabilities.length > 0 ? (
                                            <div className='flex flex-wrap gap-2 pt-1'>
                                                {mode.toolCapabilities.map((toolCapability) => (
                                                    <span
                                                        key={`${mode.modeKey}:tool:${toolCapability}`}
                                                        className='border-border/70 bg-background/80 rounded-full border px-3 py-1 text-[11px] font-medium'>
                                                            {formatToolCapabilityLabel(toolCapability)}
                                                        </span>
                                                ))}
                                            </div>
                                        ) : null}
                                        {mode.workflowCapabilities && mode.workflowCapabilities.length > 0 ? (
                                            <div className='flex flex-wrap gap-2 pt-1'>
                                                {mode.workflowCapabilities.map((workflowCapability) => (
                                                    <span
                                                        key={`${mode.modeKey}:workflow:${workflowCapability}`}
                                                        className='border-border/70 bg-background/80 rounded-full border px-3 py-1 text-[11px] font-medium'>
                                                        {formatWorkflowCapabilityLabel(workflowCapability)}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : null}
                                        {mode.behaviorFlags && mode.behaviorFlags.length > 0 ? (
                                            <div className='flex flex-wrap gap-2 pt-1'>
                                                {mode.behaviorFlags.map((behaviorFlag) => (
                                                    <span
                                                        key={`${mode.modeKey}:behavior:${behaviorFlag}`}
                                                        className='border-border/70 bg-background/80 rounded-full border px-3 py-1 text-[11px] font-medium'>
                                                        {formatBehaviorFlagLabel(behaviorFlag)}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : null}
                                        <div className='flex flex-wrap gap-2 pt-1'>
                                            <span className='border-border/70 bg-background/80 rounded-full border px-3 py-1 text-[11px] font-medium'>
                                                Runtime Profile: {formatRuntimeProfileLabel(mode.runtimeProfile ?? 'general')}
                                            </span>
                                        </div>
                                    </div>

                                    <div className='flex flex-wrap gap-2'>
                                        <Button
                                            type='button'
                                            size='sm'
                                            variant='outline'
                                            onClick={() => {
                                                input.onEdit(input.scope, mode.topLevelTab, mode.modeKey);
                                            }}>
                                            Edit
                                        </Button>
                                        <Button
                                            type='button'
                                            size='sm'
                                            variant='outline'
                                            onClick={() => {
                                                input.onDelete(input.scope, mode.topLevelTab, mode.modeKey);
                                            }}>
                                            Delete
                                        </Button>
                                        <Button
                                            type='button'
                                            size='sm'
                                            variant='outline'
                                            disabled={input.isExporting}
                                            onClick={() => {
                                                input.onExport(input.scope, mode.topLevelTab, mode.modeKey);
                                            }}>
                                            {input.isExporting ? 'Loading…' : 'Load Export JSON'}
                                        </Button>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
