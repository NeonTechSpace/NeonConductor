import { useEffect, useState } from 'react';

import { Button } from '@/web/components/ui/button';
import { DialogSurface } from '@/web/components/ui/dialogSurface';

import type {
    MemoryApplyPromotionResult,
    MemoryPromotionDraft,
    RegistryApplyPromotionResult,
    RegistryPromotionDraft,
    RegistryPromotionSourceSummary,
} from '@/shared/contracts';

type PromotionDraft = RegistryPromotionDraft | MemoryPromotionDraft;
type PromotionTarget = PromotionDraft['target'];
type PromotionSuccess = RegistryApplyPromotionResult['promoted'] | MemoryApplyPromotionResult['promoted'];

export interface RegistryPromotionDialogProps {
    open: boolean;
    busy: boolean;
    source?: RegistryPromotionSourceSummary;
    draft?: PromotionDraft;
    errorMessage?: string;
    success?: PromotionSuccess;
    onTargetChange: (target: PromotionTarget) => void;
    onDraftChange: (draft: PromotionDraft) => void;
    onOverwriteChange: (overwrite: boolean) => void;
    overwrite: boolean;
    onApply: () => void;
    onClose: () => void;
}

function splitTags(value: string): string[] | undefined {
    const tags = value
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
    return tags.length > 0 ? Array.from(new Set(tags)) : undefined;
}

function stringifyTags(tags: string[] | undefined): string {
    return tags?.join(', ') ?? '';
}

function withOptionalDescription(draft: RegistryPromotionDraft, description: string): RegistryPromotionDraft {
    const nextDraft = { ...draft };
    if (description) {
        nextDraft.description = description;
    } else {
        delete nextDraft.description;
    }
    return nextDraft;
}

function withOptionalTags(draft: RegistryPromotionDraft, tags: string[] | undefined): RegistryPromotionDraft {
    const nextDraft = { ...draft };
    if (tags) {
        nextDraft.tags = tags;
    } else {
        delete nextDraft.tags;
    }
    return nextDraft;
}

function withOptionalSummary(draft: MemoryPromotionDraft, summaryText: string): MemoryPromotionDraft {
    const nextDraft = { ...draft };
    if (summaryText.trim()) {
        nextDraft.summaryText = summaryText;
    } else {
        delete nextDraft.summaryText;
    }
    return nextDraft;
}

function withOptionalRetentionClass(
    draft: MemoryPromotionDraft,
    memoryRetentionClass: MemoryPromotionDraft['memoryRetentionClass']
): MemoryPromotionDraft {
    const nextDraft = { ...draft };
    if (memoryRetentionClass) {
        nextDraft.memoryRetentionClass = memoryRetentionClass;
    } else {
        delete nextDraft.memoryRetentionClass;
    }
    return nextDraft;
}

function renderSuccess(success: PromotionSuccess): string {
    if (success.target === 'memory') {
        return `Created memory ${success.memoryId} (${success.title}).`;
    }
    return `Promoted ${success.assetKey} to ${success.relativeRootPath}.`;
}

function RegistryDraftFields({
    draft,
    overwrite,
    tagDraft,
    setTagDraft,
    onDraftChange,
    onOverwriteChange,
}: {
    draft: RegistryPromotionDraft;
    overwrite: boolean;
    tagDraft: string;
    setTagDraft: (value: string) => void;
    onDraftChange: (draft: PromotionDraft) => void;
    onOverwriteChange: (overwrite: boolean) => void;
}) {
    return (
        <>
            <label className='space-y-1 text-sm font-medium'>
                <span>Scope</span>
                <select
                    className='border-border bg-background w-full rounded-md border px-2 py-2 text-sm'
                    value={draft.scope}
                    onChange={(event) => {
                        onDraftChange({
                            ...draft,
                            scope: event.target.value === 'workspace' ? 'workspace' : 'global',
                        });
                    }}>
                    <option value='workspace'>Workspace</option>
                    <option value='global'>Global</option>
                </select>
            </label>

            <div className='grid gap-3 sm:grid-cols-2'>
                <label className='space-y-1 text-sm font-medium'>
                    <span>Key</span>
                    <input
                        className='border-border bg-background w-full rounded-md border px-2 py-2 text-sm'
                        value={draft.key}
                        onChange={(event) => {
                            onDraftChange({ ...draft, key: event.target.value });
                        }}
                    />
                </label>
                <label className='space-y-1 text-sm font-medium'>
                    <span>Name</span>
                    <input
                        className='border-border bg-background w-full rounded-md border px-2 py-2 text-sm'
                        value={draft.name}
                        onChange={(event) => {
                            onDraftChange({ ...draft, name: event.target.value });
                        }}
                    />
                </label>
            </div>

            {draft.target === 'rule' ? (
                <label className='space-y-1 text-sm font-medium'>
                    <span>Activation</span>
                    <select
                        className='border-border bg-background w-full rounded-md border px-2 py-2 text-sm'
                        value={draft.activationMode ?? 'manual'}
                        onChange={(event) => {
                            onDraftChange({
                                ...draft,
                                activationMode:
                                    event.target.value === 'always' || event.target.value === 'auto'
                                        ? event.target.value
                                        : 'manual',
                            });
                        }}>
                        <option value='manual'>Manual</option>
                        <option value='auto'>Auto</option>
                        <option value='always'>Always</option>
                    </select>
                </label>
            ) : null}

            <label className='space-y-1 text-sm font-medium'>
                <span>Description</span>
                <input
                    className='border-border bg-background w-full rounded-md border px-2 py-2 text-sm'
                    value={draft.description ?? ''}
                    onChange={(event) => {
                        const description = event.target.value.trim();
                        onDraftChange(withOptionalDescription(draft, description));
                    }}
                />
            </label>

            <label className='space-y-1 text-sm font-medium'>
                <span>Tags</span>
                <input
                    className='border-border bg-background w-full rounded-md border px-2 py-2 text-sm'
                    value={tagDraft}
                    onChange={(event) => {
                        setTagDraft(event.target.value);
                        onDraftChange(withOptionalTags(draft, splitTags(event.target.value)));
                    }}
                />
            </label>

            <label className='space-y-1 text-sm font-medium'>
                <span>Body</span>
                <textarea
                    className='border-border bg-background min-h-56 w-full rounded-md border p-2 font-mono text-sm'
                    value={draft.bodyMarkdown}
                    onChange={(event) => {
                        onDraftChange({ ...draft, bodyMarkdown: event.target.value });
                    }}
                />
            </label>

            <label className='text-muted-foreground flex items-center gap-2 text-xs'>
                <input
                    type='checkbox'
                    checked={overwrite}
                    onChange={(event) => {
                        onOverwriteChange(event.target.checked);
                    }}
                />
                Replace an existing native asset at the same target path
            </label>
        </>
    );
}

function MemoryDraftFields({
    draft,
    onDraftChange,
}: {
    draft: MemoryPromotionDraft;
    onDraftChange: (draft: PromotionDraft) => void;
}) {
    return (
        <>
            <div className='grid gap-3 sm:grid-cols-3'>
                <label className='space-y-1 text-sm font-medium'>
                    <span>Type</span>
                    <select
                        className='border-border bg-background w-full rounded-md border px-2 py-2 text-sm'
                        value={draft.memoryType}
                        onChange={(event) => {
                            const memoryType =
                                event.target.value === 'episodic' || event.target.value === 'procedural'
                                    ? event.target.value
                                    : 'semantic';
                            onDraftChange({ ...draft, memoryType });
                        }}>
                        <option value='semantic'>Semantic</option>
                        <option value='episodic'>Episodic</option>
                        <option value='procedural'>Procedural</option>
                    </select>
                </label>
                <label className='space-y-1 text-sm font-medium'>
                    <span>Scope</span>
                    <select
                        className='border-border bg-background w-full rounded-md border px-2 py-2 text-sm'
                        value={draft.scopeKind}
                        onChange={(event) => {
                            const scopeKind =
                                event.target.value === 'workspace' || event.target.value === 'thread'
                                    ? event.target.value
                                    : 'global';
                            const nextDraft: MemoryPromotionDraft = { ...draft, scopeKind };
                            if (scopeKind !== 'thread') {
                                delete nextDraft.threadId;
                            }
                            if (scopeKind === 'global') {
                                delete nextDraft.workspaceFingerprint;
                            }
                            onDraftChange(nextDraft);
                        }}>
                        <option value='thread'>Thread</option>
                        <option value='workspace'>Workspace</option>
                        <option value='global'>Global</option>
                    </select>
                </label>
                <label className='space-y-1 text-sm font-medium'>
                    <span>Retention</span>
                    <select
                        className='border-border bg-background w-full rounded-md border px-2 py-2 text-sm'
                        value={draft.memoryRetentionClass ?? ''}
                        onChange={(event) => {
                            const memoryRetentionClass =
                                event.target.value === 'ephemeral' ||
                                event.target.value === 'task' ||
                                event.target.value === 'workspace' ||
                                event.target.value === 'profile' ||
                                event.target.value === 'pinned'
                                    ? event.target.value
                                    : undefined;
                            onDraftChange(withOptionalRetentionClass(draft, memoryRetentionClass));
                        }}>
                        <option value=''>Default</option>
                        <option value='ephemeral'>Ephemeral</option>
                        <option value='task'>Task</option>
                        <option value='workspace'>Workspace</option>
                        <option value='profile'>Profile</option>
                        <option value='pinned'>Pinned</option>
                    </select>
                </label>
            </div>

            <label className='space-y-1 text-sm font-medium'>
                <span>Title</span>
                <input
                    className='border-border bg-background w-full rounded-md border px-2 py-2 text-sm'
                    value={draft.title}
                    onChange={(event) => {
                        onDraftChange({ ...draft, title: event.target.value });
                    }}
                />
            </label>

            <label className='space-y-1 text-sm font-medium'>
                <span>Summary</span>
                <input
                    className='border-border bg-background w-full rounded-md border px-2 py-2 text-sm'
                    value={draft.summaryText ?? ''}
                    onChange={(event) => {
                        onDraftChange(withOptionalSummary(draft, event.target.value));
                    }}
                />
            </label>

            <label className='space-y-1 text-sm font-medium'>
                <span>Body</span>
                <textarea
                    className='border-border bg-background min-h-56 w-full rounded-md border p-2 font-mono text-sm'
                    value={draft.bodyMarkdown}
                    onChange={(event) => {
                        onDraftChange({ ...draft, bodyMarkdown: event.target.value });
                    }}
                />
            </label>
        </>
    );
}

export function RegistryPromotionDialog({
    open,
    busy,
    source,
    draft,
    errorMessage,
    success,
    overwrite,
    onTargetChange,
    onDraftChange,
    onOverwriteChange,
    onApply,
    onClose,
}: RegistryPromotionDialogProps) {
    const [tagDraft, setTagDraft] = useState('');

    useEffect(() => {
        setTagDraft(draft && draft.target !== 'memory' ? stringifyTags(draft.tags) : '');
    }, [draft]);

    return (
        <DialogSurface
            open={open}
            titleId='registry-promotion-title'
            descriptionId='registry-promotion-description'
            onClose={onClose}>
            <div className='border-border bg-background w-[min(94vw,48rem)] rounded-2xl border p-5 shadow-xl'>
                <div className='space-y-1'>
                    <h2 id='registry-promotion-title' className='text-lg font-semibold'>
                        Promote Source
                    </h2>
                    <p id='registry-promotion-description' className='text-muted-foreground text-sm'>
                        {source ? `${source.label} · ${String(source.lineCount)} lines` : 'Preparing source material'}
                    </p>
                </div>

                <div className='mt-4 space-y-4'>
                    {!draft ? (
                        <div className='border-border/70 bg-card/35 rounded-xl border px-4 py-5 text-sm'>
                            {busy ? 'Preparing promotion review...' : 'Promotion review is unavailable.'}
                        </div>
                    ) : (
                        <>
                            <label className='space-y-1 text-sm font-medium'>
                                <span>Target</span>
                                <select
                                    className='border-border bg-background w-full rounded-md border px-2 py-2 text-sm'
                                    value={draft.target}
                                    onChange={(event) => {
                                        const target =
                                            event.target.value === 'skill_snippet' || event.target.value === 'memory'
                                                ? event.target.value
                                                : 'rule';
                                        onTargetChange(target);
                                    }}>
                                    <option value='rule'>Rule</option>
                                    <option value='skill_snippet'>Skill snippet</option>
                                    <option value='memory'>Memory</option>
                                </select>
                            </label>

                            {draft.target === 'memory' ? (
                                <MemoryDraftFields draft={draft} onDraftChange={onDraftChange} />
                            ) : (
                                <RegistryDraftFields
                                    draft={draft}
                                    overwrite={overwrite}
                                    tagDraft={tagDraft}
                                    setTagDraft={setTagDraft}
                                    onDraftChange={onDraftChange}
                                    onOverwriteChange={onOverwriteChange}
                                />
                            )}
                        </>
                    )}
                    {errorMessage ? <p className='text-destructive text-sm'>{errorMessage}</p> : null}
                    {success ? <p className='text-sm'>{renderSuccess(success)}</p> : null}
                </div>

                <div className='mt-5 flex justify-end gap-2'>
                    <Button type='button' variant='outline' onClick={onClose} disabled={busy}>
                        Close
                    </Button>
                    <Button type='button' onClick={onApply} disabled={busy || !draft || draft.bodyMarkdown.trim().length === 0}>
                        {busy ? 'Applying...' : 'Apply'}
                    </Button>
                </div>
            </div>
        </DialogSurface>
    );
}
