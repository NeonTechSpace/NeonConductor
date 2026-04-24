import { CheckSquare, Square, Trash2 } from 'lucide-react';

import {
    DESIGNER_STYLE_FIELDS,
    type DesignerDraftFormState,
} from '@/web/components/conversation/panels/devBrowserPanelModel';
import { Button } from '@/web/components/ui/button';

import type { BrowserDesignerDraft, BrowserSelectionRecord, EntityId } from '@/shared/contracts';

interface DevBrowserDesignerSectionProps {
    selection: BrowserSelectionRecord;
    designerDraft?: BrowserDesignerDraft;
    formState: DesignerDraftFormState;
    onFormChange: (selectionId: EntityId<'bsel'>, formState: DesignerDraftFormState) => void;
    onPreview: (selectionId: EntityId<'bsel'>) => void | Promise<void>;
    onDelete: (draftId: EntityId<'bdsn'>, selectionId: EntityId<'bsel'>) => void | Promise<void>;
    onToggleInclusion: (draft: BrowserDesignerDraft) => void | Promise<void>;
}

export function DevBrowserDesignerSection({
    selection,
    designerDraft,
    formState,
    onFormChange,
    onPreview,
    onDelete,
    onToggleInclusion,
}: DevBrowserDesignerSectionProps) {
    return (
        <div className='mt-4 rounded-2xl border px-3 py-3'>
            <div className='mb-3 flex flex-wrap items-start justify-between gap-2'>
                <div>
                    <p className='text-sm font-medium'>Live Designer</p>
                    <p className='text-muted-foreground text-[11px]'>
                        Preview safe style changes in-browser, then carry them through the normal run pipeline.
                    </p>
                </div>
                {designerDraft ? (
                    <div className='flex items-center gap-2 text-[11px]'>
                        <span className='rounded-full border px-2 py-0.5'>
                            {designerDraft.applyStatus.replaceAll('_', ' ')}
                        </span>
                        <Button
                            type='button'
                            size='icon'
                            variant='ghost'
                            className='h-7 w-7 rounded-full'
                            onClick={() => {
                                void onToggleInclusion(designerDraft);
                            }}>
                            {designerDraft.inclusionState === 'included' ? (
                                <CheckSquare className='h-4 w-4' />
                            ) : (
                                <Square className='h-4 w-4' />
                            )}
                        </Button>
                    </div>
                ) : null}
            </div>

            <div className='grid gap-2 md:grid-cols-2 xl:grid-cols-5'>
                {DESIGNER_STYLE_FIELDS.map((field) => (
                    <label key={`${selection.id}:${field.key}`} className='text-[11px]'>
                        <span className='text-muted-foreground mb-1 block'>{field.label}</span>
                        <input
                            className='border-border bg-background w-full rounded-xl border px-3 py-2 text-sm'
                            value={formState[field.key]}
                            onChange={(event) => {
                                onFormChange(selection.id, {
                                    ...formState,
                                    [field.key]: event.target.value,
                                });
                            }}
                            placeholder='Optional'
                        />
                    </label>
                ))}
            </div>

            <div className='mt-3 grid gap-3 xl:grid-cols-[200px_minmax(0,1fr)]'>
                <label className='text-[11px]'>
                    <span className='text-muted-foreground mb-1 block'>Apply Intent</span>
                    <select
                        className='border-border bg-background w-full rounded-xl border px-3 py-2 text-sm'
                        value={formState.applyMode}
                        onChange={(event) => {
                            onFormChange(selection.id, {
                                ...formState,
                                applyMode:
                                    event.target.value === 'apply_with_agent' ? 'apply_with_agent' : 'preview_only',
                            });
                        }}>
                        <option value='preview_only'>Preview Only</option>
                        <option value='apply_with_agent'>Apply With Agent</option>
                    </select>
                </label>
                <label className='text-[11px]'>
                    <span className='text-muted-foreground mb-1 block'>Text Override</span>
                    <input
                        className='border-border bg-background w-full rounded-xl border px-3 py-2 text-sm'
                        value={formState.textContentOverride}
                        onChange={(event) => {
                            onFormChange(selection.id, {
                                ...formState,
                                textContentOverride: event.target.value,
                            });
                        }}
                        placeholder='Optional safe text preview'
                    />
                </label>
            </div>

            {designerDraft?.blockedReasonMessage ? (
                <p className='text-muted-foreground mt-2 text-[11px]'>{designerDraft.blockedReasonMessage}</p>
            ) : null}

            <div className='mt-3 flex flex-wrap justify-end gap-2'>
                {designerDraft ? (
                    <Button
                        type='button'
                        size='sm'
                        variant='ghost'
                        onClick={() => {
                            void onDelete(designerDraft.id, selection.id);
                        }}>
                        <Trash2 className='mr-2 h-4 w-4' />
                        Clear Preview
                    </Button>
                ) : null}
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    onClick={() => {
                        void onPreview(selection.id);
                    }}>
                    Save Preview
                </Button>
            </div>
        </div>
    );
}
