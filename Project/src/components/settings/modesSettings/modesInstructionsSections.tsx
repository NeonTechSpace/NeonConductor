import type { ReactNode } from 'react';

import type {
    CustomModeEditorDraft,
    FileBackedModeItemsByTab,
} from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';
import {
    formatPreparedContextCheckpointLabel,
    formatPreparedContextLayerGroupLabel,
    formatPreparedContextModeOverrideValueLabel,
    formatPreparedContextProfileDefaultValueLabel,
    formatDelimitedLabel,
    formatRuntimeProfileLabel,
    getModeRoleTemplateOptions,
    preparedContextEditablePromptLayerGroupOrder,
    preparedContextInjectionCheckpointOrder,
    resolveCustomModeEditorTopLevelTab,
} from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';
import type {
    BuiltInToolMetadataCardModel,
    PromptLayerSectionModel,
} from '@/web/components/settings/modesSettings/modesInstructionsViewModel';
import { Button } from '@/web/components/ui/button';
import { isOneOf } from '@/web/lib/typeGuards/isOneOf';

import {
    modeAuthoringRoles,
    topLevelTabs,
    type FileBackedCustomModeSettingsItem,
    type ModeAuthoringRole,
    type ModeDraftRecord,
    type ModeRoleTemplateKey,
    type PreparedContextEditablePromptLayerGroup,
    type PreparedContextInjectionCheckpoint,
    type PreparedContextModeOverrideValue,
    type PreparedContextModeOverrides,
    type PreparedContextProfileDefaultValue,
    type PreparedContextProfileDefaults,
    type TopLevelTab,
} from '@/shared/contracts';
import { getModeRoleTemplateDefinition } from '@/shared/modeRoleCatalog';

function isCustomModeScope(value: string): value is 'global' | 'workspace' {
    return value === 'global' || value === 'workspace';
}

function isModeAuthoringRole(value: string): value is ModeAuthoringRole {
    return isOneOf(value, modeAuthoringRoles);
}

function formatTopLevelLabel(topLevelTab: TopLevelTab): string {
    return topLevelTab === 'chat' ? 'Chat' : topLevelTab === 'agent' ? 'Agent' : 'Orchestrator';
}

function formatAuthoringRoleLabel(authoringRole: ModeAuthoringRole): string {
    switch (authoringRole) {
        case 'chat':
            return 'Chat';
        case 'single_task_agent':
            return 'Single-Task Agent';
        case 'orchestrator_primary':
            return 'Orchestrator Primary';
        case 'orchestrator_worker_agent':
            return 'Delegated Worker';
        default:
            return formatDelimitedLabel(authoringRole);
    }
}

function formatRoleTemplateLabel(roleTemplate: ModeRoleTemplateKey): string {
    return getModeRoleTemplateDefinition(roleTemplate).label;
}

function formatMetadataPill(label: string, value: string) {
    return (
        <span className='border-border/70 bg-background/80 rounded-full border px-3 py-1 text-[11px] font-medium'>
            {label}: {value}
        </span>
    );
}

type MetadataSummaryItem = {
    authoringRole: FileBackedCustomModeSettingsItem['authoringRole'];
    roleTemplate: FileBackedCustomModeSettingsItem['roleTemplate'];
    internalModelRole: FileBackedCustomModeSettingsItem['internalModelRole'];
    toolCapabilities?: FileBackedCustomModeSettingsItem['toolCapabilities'];
    workflowCapabilities?: FileBackedCustomModeSettingsItem['workflowCapabilities'];
    behaviorFlags?: FileBackedCustomModeSettingsItem['behaviorFlags'];
    runtimeProfile?: FileBackedCustomModeSettingsItem['runtimeProfile'];
    delegatedOnly?: FileBackedCustomModeSettingsItem['delegatedOnly'];
    sessionSelectable?: FileBackedCustomModeSettingsItem['sessionSelectable'];
};

function MetadataSummary(input: {
    item: MetadataSummaryItem;
}) {
    return (
        <div className='space-y-3'>
            <div className='flex flex-wrap gap-2'>
                {formatMetadataPill('Role', formatAuthoringRoleLabel(input.item.authoringRole))}
                {formatMetadataPill('Template', formatRoleTemplateLabel(input.item.roleTemplate))}
                {formatMetadataPill('Model Role', formatDelimitedLabel(input.item.internalModelRole))}
                {formatMetadataPill('Runtime', formatRuntimeProfileLabel(input.item.runtimeProfile ?? 'general'))}
                {input.item.delegatedOnly ? formatMetadataPill('Visibility', 'Delegated Only') : null}
                {input.item.sessionSelectable ? formatMetadataPill('Selection', 'Session Selectable') : null}
            </div>
            {input.item.toolCapabilities && input.item.toolCapabilities.length > 0 ? (
                <div className='flex flex-wrap gap-2'>
                    {input.item.toolCapabilities.map((toolCapability) => (
                        <span
                            key={`tool:${toolCapability}`}
                            className='border-border/70 bg-background/80 rounded-full border px-3 py-1 text-[11px] font-medium'>
                            {formatDelimitedLabel(toolCapability)}
                        </span>
                    ))}
                </div>
            ) : null}
            {input.item.workflowCapabilities && input.item.workflowCapabilities.length > 0 ? (
                <div className='flex flex-wrap gap-2'>
                    {input.item.workflowCapabilities.map((workflowCapability) => (
                        <span
                            key={`workflow:${workflowCapability}`}
                            className='border-border/70 bg-background/80 rounded-full border px-3 py-1 text-[11px] font-medium'>
                            {formatDelimitedLabel(workflowCapability)}
                        </span>
                    ))}
                </div>
            ) : null}
            {input.item.behaviorFlags && input.item.behaviorFlags.length > 0 ? (
                <div className='flex flex-wrap gap-2'>
                    {input.item.behaviorFlags.map((behaviorFlag) => (
                        <span
                            key={`behavior:${behaviorFlag}`}
                            className='border-border/70 bg-background/80 rounded-full border px-3 py-1 text-[11px] font-medium'>
                            {formatDelimitedLabel(behaviorFlag)}
                        </span>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function PreparedContextMatrixScaffold(input: {
    title: string;
    description: string;
    children: ReactNode;
    footer?: ReactNode;
}) {
    return (
        <div className='space-y-3 rounded-2xl border border-dashed px-4 py-4'>
            <div className='space-y-1'>
                <h6 className='text-sm font-semibold'>{input.title}</h6>
                <p className='text-muted-foreground text-sm leading-6'>{input.description}</p>
            </div>
            {input.children}
            {input.footer ? <div className='text-muted-foreground text-xs leading-5'>{input.footer}</div> : null}
        </div>
    );
}

function PreparedContextProfileDefaultsCard(input: {
    values: PreparedContextProfileDefaults;
    isSaving: boolean;
    onChange: (
        group: PreparedContextEditablePromptLayerGroup,
        checkpoint: PreparedContextInjectionCheckpoint,
        value: PreparedContextProfileDefaultValue
    ) => void;
    onSave: () => void;
    onReset: () => void;
}) {
    return (
        <section className='border-border/70 bg-card/50 space-y-4 rounded-[24px] border p-5'>
            <PreparedContextMatrixScaffold
                title='Prepared Context Load Controls'
                description='Choose which shared prompt layers load by default at bootstrap and after compaction reseed. Runtime-owned contributors stay visible in previews but are not editable here.'
                footer='Profile defaults are the baseline. Active mode overrides can inherit, force include, or force exclude each shared layer per checkpoint.'>
                <div className='overflow-x-auto'>
                    <table className='min-w-full border-separate border-spacing-y-2 text-sm'>
                        <thead>
                            <tr className='text-left text-xs uppercase tracking-[0.12em] text-muted-foreground'>
                                <th className='pb-1 pr-4 font-semibold'>Layer</th>
                                {preparedContextInjectionCheckpointOrder.map((checkpoint) => (
                                    <th key={checkpoint} className='pb-1 pr-4 font-semibold'>
                                        {formatPreparedContextCheckpointLabel(checkpoint)}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {preparedContextEditablePromptLayerGroupOrder.map((group) => (
                                <tr key={group}>
                                    <td className='pr-4 font-medium'>{formatPreparedContextLayerGroupLabel(group)}</td>
                                    {preparedContextInjectionCheckpointOrder.map((checkpoint) => (
                                        <td key={`${group}:${checkpoint}`} className='pr-4'>
                                            <select
                                                className='border-border bg-background h-10 w-full min-w-[170px] rounded-xl border px-3 text-sm'
                                                value={input.values[group][checkpoint]}
                                                onChange={(event) => {
                                                    input.onChange(
                                                        group,
                                                        checkpoint,
                                                        event.target.value as PreparedContextProfileDefaultValue
                                                    );
                                                }}>
                                                <option value='include'>
                                                    {formatPreparedContextProfileDefaultValueLabel('include')}
                                                </option>
                                                <option value='exclude'>
                                                    {formatPreparedContextProfileDefaultValueLabel('exclude')}
                                                </option>
                                            </select>
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </PreparedContextMatrixScaffold>
            <div className='flex flex-wrap gap-2'>
                <Button type='button' size='sm' disabled={input.isSaving} onClick={input.onSave}>
                    {input.isSaving ? 'Saving…' : 'Save'}
                </Button>
                <Button type='button' size='sm' variant='outline' disabled={input.isSaving} onClick={input.onReset}>
                    Reset
                </Button>
            </div>
        </section>
    );
}

function PreparedContextModeOverridesEditor(input: {
    values: PreparedContextModeOverrides;
    onChange: (
        group: PreparedContextEditablePromptLayerGroup,
        checkpoint: PreparedContextInjectionCheckpoint,
        value: PreparedContextModeOverrideValue
    ) => void;
}) {
    return (
        <PreparedContextMatrixScaffold
            title='Shared Prompt-Layer Overrides'
            description='These overrides only affect app instructions, profile instructions, and built-in top-level instructions. Mode prompt text, rules, skills, project instructions, retrieved memory, and compaction summaries remain runtime-owned.'
            footer='Inherit uses the profile default. Include and exclude force the selected layer at the chosen injection checkpoint when prompt text exists.'>
            <div className='overflow-x-auto'>
                <table className='min-w-full border-separate border-spacing-y-2 text-sm'>
                    <thead>
                        <tr className='text-left text-xs uppercase tracking-[0.12em] text-muted-foreground'>
                            <th className='pb-1 pr-4 font-semibold'>Layer</th>
                            {preparedContextInjectionCheckpointOrder.map((checkpoint) => (
                                <th key={checkpoint} className='pb-1 pr-4 font-semibold'>
                                    {formatPreparedContextCheckpointLabel(checkpoint)}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {preparedContextEditablePromptLayerGroupOrder.map((group) => (
                            <tr key={group}>
                                <td className='pr-4 font-medium'>{formatPreparedContextLayerGroupLabel(group)}</td>
                                {preparedContextInjectionCheckpointOrder.map((checkpoint) => (
                                    <td key={`${group}:${checkpoint}`} className='pr-4'>
                                        <select
                                            className='border-border bg-background h-10 w-full min-w-[170px] rounded-xl border px-3 text-sm'
                                            value={input.values[group][checkpoint]}
                                            onChange={(event) => {
                                                input.onChange(
                                                    group,
                                                    checkpoint,
                                                    event.target.value as PreparedContextModeOverrideValue
                                                );
                                            }}>
                                            <option value='inherit'>
                                                {formatPreparedContextModeOverrideValueLabel('inherit')}
                                            </option>
                                            <option value='include'>
                                                {formatPreparedContextModeOverrideValueLabel('include')}
                                            </option>
                                            <option value='exclude'>
                                                {formatPreparedContextModeOverrideValueLabel('exclude')}
                                            </option>
                                        </select>
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </PreparedContextMatrixScaffold>
    );
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
                <Button type='button' size='sm' disabled={input.isSaving} onClick={input.onSave}>
                    {input.isSaving ? 'Saving…' : 'Save'}
                </Button>
                <Button type='button' size='sm' variant='outline' disabled={input.isSaving} onClick={input.onReset}>
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
    metadata: Pick<
        MetadataSummaryItem,
        | 'authoringRole'
        | 'roleTemplate'
        | 'internalModelRole'
        | 'toolCapabilities'
        | 'workflowCapabilities'
        | 'behaviorFlags'
        | 'runtimeProfile'
    >;
    promptLayerOverrides: PreparedContextModeOverrides;
    onRoleDefinitionChange: (value: string) => void;
    onCustomInstructionsChange: (value: string) => void;
    onPromptLayerOverrideChange: (
        group: PreparedContextEditablePromptLayerGroup,
        checkpoint: PreparedContextInjectionCheckpoint,
        value: PreparedContextModeOverrideValue
    ) => void;
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
            <MetadataSummary item={input.metadata} />
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
            <PreparedContextModeOverridesEditor
                values={input.promptLayerOverrides}
                onChange={input.onPromptLayerOverrideChange}
            />
            <div className='flex flex-wrap gap-2'>
                <Button type='button' size='sm' disabled={input.isSaving} onClick={input.onSave}>
                    {input.isSaving ? 'Saving…' : 'Save'}
                </Button>
                <Button type='button' size='sm' variant='outline' disabled={input.isSaving} onClick={input.onReset}>
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
                <Button type='button' size='sm' disabled={input.isSaving} onClick={input.onSave}>
                    {input.isSaving ? 'Saving…' : 'Save'}
                </Button>
                <Button type='button' size='sm' variant='outline' disabled={input.isSaving} onClick={input.onReset}>
                    Reset
                </Button>
            </div>
        </section>
    );
}

export function CustomModeEditorSection(input: {
    editor: {
        draft: CustomModeEditorDraft | undefined;
        isLoading: boolean;
        isSaving: boolean;
        hasWorkspaceScope: boolean;
        selectedWorkspaceLabel: string | undefined;
        openCreate: (scope: 'global' | 'workspace') => void;
        openEdit: (scope: 'global' | 'workspace', topLevelTab: TopLevelTab, modeKey: string) => Promise<void>;
        openDraft: (draft: ModeDraftRecord) => void;
        openDelete: (scope: 'global' | 'workspace', topLevelTab: TopLevelTab, modeKey: string) => Promise<void>;
        close: () => void;
        setScope: (scope: 'global' | 'workspace') => void;
        setAuthoringRole: (authoringRole: ModeAuthoringRole) => void;
        setRoleTemplate: (roleTemplate: ModeRoleTemplateKey) => void;
        setField: (
            field:
                | 'slug'
                | 'name'
                | 'description'
                | 'roleDefinition'
                | 'customInstructions'
                | 'whenToUse'
                | 'tagsText'
                | 'sourceText',
            value: string
        ) => void;
        setPromptLayerOverride: (
            group: PreparedContextEditablePromptLayerGroup,
            checkpoint: PreparedContextInjectionCheckpoint,
            value: PreparedContextModeOverrideValue
        ) => void;
        setDeleteConfirmed: (value: boolean) => void;
        save: () => Promise<void>;
        deleteMode: () => Promise<void>;
        validateDraft: () => Promise<void>;
        applyDraft: () => Promise<void>;
        draftOverwriteConfirmed: boolean;
        setDraftOverwriteConfirmed: (value: boolean) => void;
    };
}) {
    if (input.editor.isLoading && !input.editor.draft) {
        return (
            <section className='border-border/70 bg-card/50 rounded-[24px] border p-5'>
                <p className='text-sm font-semibold'>Loading mode editor…</p>
            </section>
        );
    }

    const draft = input.editor.draft;
    if (!draft) {
        return null;
    }

    const topLevelTab = resolveCustomModeEditorTopLevelTab(draft);
    const templateDefinition = getModeRoleTemplateDefinition(draft.roleTemplate);
    const roleTemplateOptions = getModeRoleTemplateOptions(draft.authoringRole);

    return (
        <section className='border-border/70 bg-card/50 space-y-4 rounded-[24px] border p-5'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='space-y-1'>
                    <h6 className='text-sm font-semibold'>
                        {draft.kind === 'edit'
                            ? 'Edit File-Backed Custom Mode'
                            : draft.kind === 'draft'
                              ? 'Review Mode Draft'
                              : 'Create Mode Draft'}
                    </h6>
                    <p className='text-muted-foreground text-sm leading-6'>
                        Author from scope to role to template, then fill in prompt metadata. Execution capabilities are
                        derived below so the mode contract stays consistent.
                    </p>
                </div>
                <div className='flex flex-wrap gap-2'>
                    <Button type='button' size='sm' variant='outline' disabled={input.editor.isSaving} onClick={input.editor.close}>
                        Cancel
                    </Button>
                    <Button type='button' size='sm' disabled={input.editor.isSaving} onClick={() => void input.editor.save()}>
                        {input.editor.isSaving ? 'Saving…' : draft.kind === 'edit' ? 'Save Mode' : 'Save Draft'}
                    </Button>
                    {draft.kind === 'draft' ? (
                        <>
                            <Button
                                type='button'
                                size='sm'
                                variant='outline'
                                disabled={input.editor.isSaving}
                                onClick={() => void input.editor.validateDraft()}>
                                Validate
                            </Button>
                            <Button
                                type='button'
                                size='sm'
                                disabled={input.editor.isSaving || draft.validationState === 'invalid'}
                                onClick={() => void input.editor.applyDraft()}>
                                Apply Draft
                            </Button>
                        </>
                    ) : null}
                </div>
            </div>

            <div className='grid gap-4 md:grid-cols-3'>
                <label className='space-y-2'>
                    <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>Scope</span>
                    {draft.kind === 'create' ? (
                        <select
                            className='border-border bg-background h-11 w-full rounded-2xl border px-3 text-sm'
                            value={draft.scope}
                            onChange={(event) => {
                                if (isCustomModeScope(event.target.value)) {
                                    input.editor.setScope(event.target.value);
                                }
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
                    <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>Authoring Role</span>
                    <select
                        className='border-border bg-background h-11 w-full rounded-2xl border px-3 text-sm'
                        value={draft.authoringRole}
                        onChange={(event) => {
                            if (isModeAuthoringRole(event.target.value)) {
                                input.editor.setAuthoringRole(event.target.value);
                            }
                        }}>
                        {modeAuthoringRoles.map((authoringRole) => (
                            <option key={authoringRole} value={authoringRole}>
                                {formatAuthoringRoleLabel(authoringRole)}
                            </option>
                        ))}
                    </select>
                </label>
                <label className='space-y-2'>
                    <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>Template</span>
                    <select
                        className='border-border bg-background h-11 w-full rounded-2xl border px-3 text-sm'
                        value={draft.roleTemplate}
                        onChange={(event) => {
                            input.editor.setRoleTemplate(event.target.value as ModeRoleTemplateKey);
                        }}>
                        {roleTemplateOptions.map((option) => (
                            <option key={option.roleTemplate} value={option.roleTemplate}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <div className='grid gap-4 md:grid-cols-3'>
                <label className='space-y-2'>
                    <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>Top-Level Tab</span>
                    <input
                        readOnly
                        className='border-border bg-background h-11 w-full rounded-2xl border px-3 text-sm'
                        value={formatTopLevelLabel(topLevelTab)}
                    />
                </label>
                <label className='space-y-2'>
                    <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>Slug</span>
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
                    <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>Name</span>
                    <input
                        className='border-border bg-background h-11 w-full rounded-2xl border px-3 text-sm'
                        value={draft.name}
                        onChange={(event) => {
                            input.editor.setField('name', event.target.value);
                        }}
                    />
                </label>
            </div>

            <div className='rounded-2xl border border-dashed px-4 py-4'>
                <div className='space-y-2'>
                    <h6 className='text-sm font-semibold'>Derived Mode Contract</h6>
                    <p className='text-muted-foreground text-sm leading-6'>
                        These capabilities come from the selected role template and stay read-only here.
                    </p>
                    <MetadataSummary
                        item={{
                            authoringRole: draft.authoringRole,
                            roleTemplate: draft.roleTemplate,
                            internalModelRole: templateDefinition.internalModelRole,
                            delegatedOnly: templateDefinition.delegatedOnly,
                            sessionSelectable: templateDefinition.sessionSelectable,
                            toolCapabilities: templateDefinition.toolCapabilities,
                            workflowCapabilities: templateDefinition.workflowCapabilities,
                            behaviorFlags: templateDefinition.behaviorFlags,
                            runtimeProfile: templateDefinition.runtimeProfile,
                        }}
                    />
                </div>
            </div>

            <PreparedContextModeOverridesEditor
                values={draft.promptLayerOverrides}
                onChange={input.editor.setPromptLayerOverride}
            />

            <div className='grid gap-4 md:grid-cols-2'>
                <label className='space-y-2'>
                    <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>Description</span>
                    <textarea
                        value={draft.description}
                        onChange={(event) => input.editor.setField('description', event.target.value)}
                        className='border-border bg-background min-h-24 w-full rounded-2xl border px-4 py-3 text-sm leading-6'
                        spellCheck={false}
                    />
                </label>
                <label className='space-y-2'>
                    <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>When To Use</span>
                    <textarea
                        value={draft.whenToUse}
                        onChange={(event) => input.editor.setField('whenToUse', event.target.value)}
                        className='border-border bg-background min-h-24 w-full rounded-2xl border px-4 py-3 text-sm leading-6'
                        spellCheck={false}
                    />
                </label>
            </div>

            <label className='space-y-2'>
                <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>Tags</span>
                <textarea
                    value={draft.tagsText}
                    onChange={(event) => input.editor.setField('tagsText', event.target.value)}
                    className='border-border bg-background min-h-20 w-full rounded-2xl border px-4 py-3 text-sm leading-6'
                    spellCheck={false}
                    placeholder='quality, review'
                />
                <p className='text-muted-foreground text-xs leading-5'>Separate tags with commas or new lines.</p>
            </label>

            <div className='grid gap-4 xl:grid-cols-2'>
                <label className='space-y-2'>
                    <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>Role Definition</span>
                    <textarea
                        value={draft.roleDefinition}
                        onChange={(event) => input.editor.setField('roleDefinition', event.target.value)}
                        className='border-border bg-background min-h-32 w-full rounded-2xl border px-4 py-3 text-sm leading-6'
                        spellCheck={false}
                    />
                </label>
                <label className='space-y-2'>
                    <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>Custom Instructions</span>
                    <textarea
                        value={draft.customInstructions}
                        onChange={(event) => input.editor.setField('customInstructions', event.target.value)}
                        className='border-border bg-background min-h-32 w-full rounded-2xl border px-4 py-3 text-sm leading-6'
                        spellCheck={false}
                    />
                </label>
            </div>

            {draft.kind !== 'edit' ? (
                <label className='space-y-2'>
                    <span className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>Source Material</span>
                    <textarea
                        value={draft.sourceText}
                        onChange={(event) => input.editor.setField('sourceText', event.target.value)}
                        className='border-border bg-background min-h-28 w-full rounded-2xl border px-4 py-3 text-sm leading-6'
                        spellCheck={false}
                        placeholder='Paste transcript excerpts, artifacts, or notes to keep with this draft review.'
                    />
                    <p className='text-muted-foreground text-xs leading-5'>
                        Optional provenance for a reviewed draft. Pasted content stays in the draft until you apply or discard it.
                    </p>
                </label>
            ) : null}

            <div className='border-border/70 bg-background/60 rounded-2xl border px-4 py-3 text-sm'>
                {draft.scope === 'workspace' ? (
                    <span>Workspace target: {input.editor.selectedWorkspaceLabel ?? 'Selected workspace'}</span>
                ) : (
                    <span>
                        Target root: global <code>modes/</code>
                    </span>
                )}
            </div>

            {draft.kind === 'draft' ? (
                <div className='border-border/70 bg-background/60 space-y-3 rounded-2xl border px-4 py-4'>
                    <p className='text-sm font-semibold'>Draft Validation</p>
                    <p className='text-muted-foreground text-sm leading-6'>
                        Status: <span className='text-foreground font-medium'>{draft.validationState}</span>
                    </p>
                    {draft.validationErrors.length > 0 ? (
                        <div className='space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-900 dark:text-amber-100'>
                            {draft.validationErrors.map((error) => (
                                <p key={error}>{error}</p>
                            ))}
                        </div>
                    ) : null}
                    <label className='flex items-start gap-3 text-sm'>
                        <input
                            type='checkbox'
                            className='mt-1'
                            checked={input.editor.draftOverwriteConfirmed}
                            onChange={(event) => input.editor.setDraftOverwriteConfirmed(event.target.checked)}
                        />
                        <span className='text-muted-foreground leading-6'>
                            Allow overwrite if applying this draft would replace an existing file-backed mode with the same tab and key.
                        </span>
                    </label>
                    <Button type='button' size='sm' variant='destructive' disabled={input.editor.isSaving} onClick={() => void input.editor.deleteMode()}>
                        Discard Draft
                    </Button>
                </div>
            ) : null}

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
                            onChange={(event) => input.editor.setDeleteConfirmed(event.target.checked)}
                        />
                        <span className='text-muted-foreground leading-6'>
                            I understand this will delete the file-backed custom mode and fall back to normal resolution afterward.
                        </span>
                    </label>
                    <Button
                        type='button'
                        size='sm'
                        variant='destructive'
                        disabled={input.editor.isSaving || !draft.deleteConfirmed}
                        onClick={() => void input.editor.deleteMode()}>
                        Delete Mode
                    </Button>
                </div>
            ) : null}
        </section>
    );
}

function ModeInventoryCard(input: {
    mode: FileBackedCustomModeSettingsItem;
    scope: 'global' | 'workspace';
    isExporting: boolean;
    onExport: (scope: 'global' | 'workspace', topLevelTab: TopLevelTab, modeKey: string) => void;
    onEdit: (scope: 'global' | 'workspace', topLevelTab: TopLevelTab, modeKey: string) => void;
    onDelete: (scope: 'global' | 'workspace', topLevelTab: TopLevelTab, modeKey: string) => void;
}) {
    return (
        <article className='border-border/70 bg-card/50 space-y-3 rounded-[24px] border p-5'>
            <div className='space-y-1'>
                <div className='flex flex-wrap items-center justify-between gap-3'>
                    <h6 className='text-sm font-semibold'>{input.mode.label}</h6>
                    <span className='border-border/70 bg-background/80 rounded-full border px-3 py-1 text-[11px] font-medium'>
                        {formatTopLevelLabel(input.mode.topLevelTab)} · {input.mode.modeKey}
                    </span>
                </div>
                <p className='text-muted-foreground text-sm leading-6'>
                    {input.mode.description ?? 'No description set for this file-backed mode yet.'}
                </p>
                {input.mode.whenToUse ? (
                    <p className='text-muted-foreground text-sm leading-6'>
                        <span className='text-foreground font-medium'>When to use:</span> {input.mode.whenToUse}
                    </p>
                ) : null}
                {input.mode.tags && input.mode.tags.length > 0 ? (
                    <div className='flex flex-wrap gap-2 pt-1'>
                        {input.mode.tags.map((tag) => (
                            <span
                                key={`${input.mode.modeKey}:tag:${tag}`}
                                className='border-border/70 bg-background/80 rounded-full border px-3 py-1 text-[11px] font-medium'>
                                {tag}
                            </span>
                        ))}
                    </div>
                ) : null}
            </div>
            <MetadataSummary item={input.mode} />
            <div className='flex flex-wrap gap-2'>
                <Button type='button' size='sm' variant='outline' onClick={() => input.onEdit(input.scope, input.mode.topLevelTab, input.mode.modeKey)}>
                    Edit
                </Button>
                <Button type='button' size='sm' variant='outline' onClick={() => input.onDelete(input.scope, input.mode.topLevelTab, input.mode.modeKey)}>
                    Delete
                </Button>
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={input.isExporting}
                    onClick={() => input.onExport(input.scope, input.mode.topLevelTab, input.mode.modeKey)}>
                    {input.isExporting ? 'Loading…' : 'Load Export JSON'}
                </Button>
            </div>
        </article>
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
                    Create a draft or import portable JSON to review new modes before applying them here.
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
                                {input.scope === 'global' ? 'Global' : 'Workspace'} {formatTopLevelLabel(topLevelTab)} Modes
                            </h6>
                            <p className='text-muted-foreground text-sm leading-6'>
                                These file-backed modes are active in the normal registry for this scope.
                            </p>
                        </div>
                        <div className='grid gap-4 xl:grid-cols-2'>
                            {items.map((mode) => (
                                <ModeInventoryCard
                                    key={`${input.scope}:${mode.topLevelTab}:${mode.modeKey}`}
                                    mode={mode}
                                    scope={input.scope}
                                    isExporting={input.isExporting}
                                    onExport={input.onExport}
                                    onEdit={input.onEdit}
                                    onDelete={input.onDelete}
                                />
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export function DelegatedWorkerModeInventorySection(input: {
    scope: 'global' | 'workspace';
    items: FileBackedCustomModeSettingsItem[];
    isExporting: boolean;
    onExport: (scope: 'global' | 'workspace', topLevelTab: TopLevelTab, modeKey: string) => void;
    onEdit: (scope: 'global' | 'workspace', topLevelTab: TopLevelTab, modeKey: string) => void;
    onDelete: (scope: 'global' | 'workspace', topLevelTab: TopLevelTab, modeKey: string) => void;
}) {
    if (input.items.length === 0) {
        return null;
    }

    return (
        <div className='space-y-3'>
            <div className='space-y-1'>
                <h6 className='text-sm font-semibold'>
                    {input.scope === 'global' ? 'Global' : 'Workspace'} Delegated Worker Modes
                </h6>
                <p className='text-muted-foreground text-sm leading-6'>
                    These modes are persisted and editable, but they stay out of normal session selection because they are delegated-only.
                </p>
            </div>
            <div className='grid gap-4 xl:grid-cols-2'>
                {input.items.map((mode) => (
                    <ModeInventoryCard
                        key={`${input.scope}:${mode.topLevelTab}:${mode.modeKey}`}
                        mode={mode}
                        scope={input.scope}
                        isExporting={input.isExporting}
                        onExport={input.onExport}
                        onEdit={input.onEdit}
                        onDelete={input.onDelete}
                    />
                ))}
            </div>
        </div>
    );
}

export function ModeDraftInventorySection(input: {
    drafts: ModeDraftRecord[];
    isBusy: boolean;
    onOpenDraft: (draft: ModeDraftRecord) => void;
    onValidateDraft: (draftId: string) => void;
    onApplyDraft: (draftId: string) => void;
    onDiscardDraft: (draftId: string) => void;
}) {
    if (input.drafts.length === 0) {
        return (
            <div className='border-border/70 bg-card/40 rounded-[24px] border p-5'>
                <p className='text-sm font-semibold'>No mode drafts in review</p>
                <p className='text-muted-foreground mt-2 text-sm leading-6'>
                    Create a draft or import JSON above to review modes before they touch the live registry.
                </p>
            </div>
        );
    }

    return (
        <div className='space-y-3'>
            <div className='space-y-1'>
                <h6 className='text-sm font-semibold'>Mode Draft Review</h6>
                <p className='text-muted-foreground text-sm leading-6'>
                    Invalid drafts stay here until you update or discard them. Only valid drafts can be applied.
                </p>
            </div>
            <div className='grid gap-4 xl:grid-cols-2'>
                {input.drafts.map((draft) => (
                    <article key={draft.id} className='border-border/70 bg-card/50 space-y-3 rounded-[24px] border p-5'>
                        <div className='space-y-1'>
                            <div className='flex flex-wrap items-center justify-between gap-3'>
                                <h6 className='text-sm font-semibold'>{draft.mode.name ?? draft.mode.slug ?? draft.id}</h6>
                                <span className='border-border/70 bg-background/80 rounded-full border px-3 py-1 text-[11px] font-medium'>
                                    {draft.validationState}
                                </span>
                            </div>
                            <p className='text-muted-foreground text-sm leading-6'>
                                Source: {formatDelimitedLabel(draft.sourceKind)} · Scope:{' '}
                                {draft.scope === 'global' ? 'Global' : 'Workspace'}
                            </p>
                            {draft.mode.authoringRole && draft.mode.roleTemplate ? (
                                <MetadataSummary
                                    item={{
                                        ...getModeRoleTemplateDefinition(draft.mode.roleTemplate),
                                    }}
                                />
                            ) : null}
                            {draft.validationErrors.length > 0 ? (
                                <div className='space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-900 dark:text-amber-100'>
                                    {draft.validationErrors.map((error) => (
                                        <p key={error}>{error}</p>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                        <div className='flex flex-wrap gap-2'>
                            <Button type='button' size='sm' variant='outline' onClick={() => input.onOpenDraft(draft)}>
                                Review
                            </Button>
                            <Button type='button' size='sm' variant='outline' disabled={input.isBusy} onClick={() => input.onValidateDraft(draft.id)}>
                                Validate
                            </Button>
                            <Button
                                type='button'
                                size='sm'
                                disabled={input.isBusy || draft.validationState !== 'valid'}
                                onClick={() => input.onApplyDraft(draft.id)}>
                                Apply
                            </Button>
                            <Button type='button' size='sm' variant='destructive' disabled={input.isBusy} onClick={() => input.onDiscardDraft(draft.id)}>
                                Discard
                            </Button>
                        </div>
                    </article>
                ))}
            </div>
        </div>
    );
}

export { formatTopLevelLabel };
export { PreparedContextProfileDefaultsCard };
