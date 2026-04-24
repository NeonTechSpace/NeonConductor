import { useEffect, useState } from 'react';

import { Button } from '@/web/components/ui/button';
import { DialogSurface } from '@/web/components/ui/dialogSurface';

import type {
    RegistryApplyPromotionResult,
    RegistryPromotionDraft,
    RegistryPromotionSourceSummary,
} from '@/shared/contracts';

export interface RegistryPromotionDialogProps {
    open: boolean;
    busy: boolean;
    source?: RegistryPromotionSourceSummary;
    draft?: RegistryPromotionDraft;
    errorMessage?: string;
    success?: RegistryApplyPromotionResult['promoted'];
    onDraftChange: (draft: RegistryPromotionDraft) => void;
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

function withTarget(draft: RegistryPromotionDraft, target: RegistryPromotionDraft['target']): RegistryPromotionDraft {
    if (target === 'skill_snippet') {
        const nextDraft = { ...draft, target };
        delete nextDraft.activationMode;
        return nextDraft;
    }

    return {
        ...draft,
        target,
        activationMode: draft.activationMode ?? 'manual',
    };
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

export function RegistryPromotionDialog({
    open,
    busy,
    source,
    draft,
    errorMessage,
    success,
    overwrite,
    onDraftChange,
    onOverwriteChange,
    onApply,
    onClose,
}: RegistryPromotionDialogProps) {
    const [tagDraft, setTagDraft] = useState('');

    useEffect(() => {
        setTagDraft(stringifyTags(draft?.tags));
    }, [draft]);

    return (
        <DialogSurface open={open} titleId='registry-promotion-title' descriptionId='registry-promotion-description' onClose={onClose}>
            <div className='border-border bg-background w-[min(94vw,48rem)] rounded-2xl border p-5 shadow-xl'>
                <div className='space-y-1'>
                    <h2 id='registry-promotion-title' className='text-lg font-semibold'>
                        Promote to Native Asset
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
                            <div className='grid gap-3 sm:grid-cols-2'>
                                <label className='space-y-1 text-sm font-medium'>
                                    <span>Target</span>
                                    <select
                                        className='border-border bg-background w-full rounded-md border px-2 py-2 text-sm'
                                        value={draft.target}
                                        onChange={(event) => {
                                            onDraftChange(withTarget(draft, event.target.value === 'skill_snippet' ? 'skill_snippet' : 'rule'));
                                        }}>
                                        <option value='rule'>Rule</option>
                                        <option value='skill_snippet'>Skill snippet</option>
                                    </select>
                                </label>
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
                            </div>

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
                    )}
                    {errorMessage ? <p className='text-destructive text-sm'>{errorMessage}</p> : null}
                    {success ? (
                        <p className='text-sm'>
                            Promoted <span className='font-medium'>{success.assetKey}</span> to{' '}
                            <span className='text-muted-foreground'>{success.relativeRootPath}</span>.
                        </p>
                    ) : null}
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
