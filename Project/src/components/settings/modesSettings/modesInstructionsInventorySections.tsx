import type { FileBackedModeItemsByTab } from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';
import { formatDelimitedLabel } from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';
import {
    MetadataSummary,
    PreparedContextProfileDefaultsCard,
} from '@/web/components/settings/modesSettings/modesInstructionsPromptSections';
import { Button } from '@/web/components/ui/button';

import {
    topLevelTabs,
    type FileBackedCustomModeSettingsItem,
    type ModeDraftRecord,
    type TopLevelTab,
} from '@/shared/contracts';
import { getModeRoleTemplateDefinition } from '@/shared/modeRoleCatalog';

function formatTopLevelLabel(topLevelTab: TopLevelTab): string {
    return topLevelTab === 'chat' ? 'Chat' : topLevelTab === 'agent' ? 'Agent' : 'Orchestrator';
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
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    onClick={() => {
                        input.onEdit(input.scope, input.mode.topLevelTab, input.mode.modeKey);
                    }}>
                    Edit
                </Button>
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    onClick={() => {
                        input.onDelete(input.scope, input.mode.topLevelTab, input.mode.modeKey);
                    }}>
                    Delete
                </Button>
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={input.isExporting}
                    onClick={() => {
                        input.onExport(input.scope, input.mode.topLevelTab, input.mode.modeKey);
                    }}>
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
                                {input.scope === 'global' ? 'Global' : 'Workspace'} {formatTopLevelLabel(topLevelTab)}{' '}
                                Modes
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
                    These modes are persisted and editable, but they stay out of normal session selection because they
                    are delegated-only.
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
                                <h6 className='text-sm font-semibold'>
                                    {draft.mode.name ?? draft.mode.slug ?? draft.id}
                                </h6>
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
                            <Button
                                type='button'
                                size='sm'
                                variant='outline'
                                onClick={() => {
                                    input.onOpenDraft(draft);
                                }}>
                                Review
                            </Button>
                            <Button
                                type='button'
                                size='sm'
                                variant='outline'
                                disabled={input.isBusy}
                                onClick={() => {
                                    input.onValidateDraft(draft.id);
                                }}>
                                Validate
                            </Button>
                            <Button
                                type='button'
                                size='sm'
                                disabled={input.isBusy || draft.validationState !== 'valid'}
                                onClick={() => {
                                    input.onApplyDraft(draft.id);
                                }}>
                                Apply
                            </Button>
                            <Button
                                type='button'
                                size='sm'
                                variant='destructive'
                                disabled={input.isBusy}
                                onClick={() => {
                                    input.onDiscardDraft(draft.id);
                                }}>
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
