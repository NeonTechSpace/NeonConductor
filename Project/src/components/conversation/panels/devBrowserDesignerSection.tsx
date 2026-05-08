import { CheckSquare, Sparkles, Square, Trash2 } from 'lucide-react';

import {
    DESIGNER_STYLE_FIELDS,
    type DesignerDraftFormState,
} from '@/web/components/conversation/panels/devBrowserPanelModel';
import { Button } from '@/web/components/ui/button';

import type {
    BrowserDesignerAnnotation,
    BrowserDesignerLiveSession,
    BrowserDesignerVariant,
    BrowserSelectionRecord,
    BrowserDesignerDraft,
    EntityId,
} from '@/shared/contracts';

type DesignerActionChip = 'bolder' | 'quieter' | 'polish' | 'colorize' | 'layout' | 'animate' | 'delight';

const DESIGNER_ACTION_CHIPS: DesignerActionChip[] = [
    'polish',
    'bolder',
    'quieter',
    'colorize',
    'layout',
    'animate',
    'delight',
];

interface DevBrowserDesignerSectionProps {
    selection: BrowserSelectionRecord;
    designerDraft?: BrowserDesignerDraft;
    designerLiveSession?: BrowserDesignerLiveSession;
    annotations: BrowserDesignerAnnotation[];
    variants: BrowserDesignerVariant[];
    formState: DesignerDraftFormState;
    intentForm: {
        actionChip?: DesignerActionChip;
        intentText: string;
        requestedVariantCount: number;
    };
    annotationText: string;
    generationBusy: boolean;
    onFormChange: (selectionId: EntityId<'bsel'>, formState: DesignerDraftFormState) => void;
    onIntentFormChange: (formState: {
        actionChip?: DesignerActionChip;
        intentText: string;
        requestedVariantCount: number;
    }) => void;
    onAnnotationTextChange: (designerSessionId: EntityId<'bdsess'>, value: string) => void;
    onCreateLiveSession: (selectionId: EntityId<'bsel'>) => void | Promise<void>;
    onCreateAnnotation: (
        designerSessionId: EntityId<'bdsess'>,
        selection: BrowserSelectionRecord
    ) => void | Promise<void>;
    onStartGeneration: (designerSessionId: EntityId<'bdsess'>) => void | Promise<void>;
    onActivateVariant: (designerSessionId: EntityId<'bdsess'>, variantId: EntityId<'bdvar'>) => void | Promise<void>;
    onTuneVariant: (variant: BrowserDesignerVariant) => void | Promise<void>;
    onAcceptVariant: (designerSessionId: EntityId<'bdsess'>, variantId: EntityId<'bdvar'>) => void | Promise<void>;
    onDiscardVariant: (designerSessionId: EntityId<'bdsess'>, variantId: EntityId<'bdvar'>) => void | Promise<void>;
    onPreview: (selectionId: EntityId<'bsel'>) => void | Promise<void>;
    onDelete: (draftId: EntityId<'bdsn'>, selectionId: EntityId<'bsel'>) => void | Promise<void>;
    onToggleInclusion: (draft: BrowserDesignerDraft) => void | Promise<void>;
}

export function DevBrowserDesignerSection({
    selection,
    designerDraft,
    designerLiveSession,
    annotations,
    variants,
    formState,
    intentForm,
    annotationText,
    generationBusy,
    onFormChange,
    onIntentFormChange,
    onAnnotationTextChange,
    onCreateLiveSession,
    onCreateAnnotation,
    onStartGeneration,
    onActivateVariant,
    onTuneVariant,
    onAcceptVariant,
    onDiscardVariant,
    onPreview,
    onDelete,
    onToggleInclusion,
}: DevBrowserDesignerSectionProps) {
    const activeVariant = variants.find((variant) => variant.status === 'active');

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

            <div className='mb-4 rounded-xl border px-3 py-3'>
                <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
                    <div>
                        <p className='text-xs font-medium'>Designer Session</p>
                        {designerLiveSession ? (
                            <p className='text-muted-foreground text-[11px]'>
                                {designerLiveSession.generationStatus.replaceAll('_', ' ')}
                                {designerLiveSession.stale ? ' · stale' : ''}
                            </p>
                        ) : (
                            <p className='text-muted-foreground text-[11px]'>Capture intent before generating variants.</p>
                        )}
                    </div>
                    {designerLiveSession ? (
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={
                                generationBusy ||
                                designerLiveSession.generationStatus === 'generating' ||
                                designerLiveSession.stale
                            }
                            onClick={() => {
                                void onStartGeneration(designerLiveSession.id);
                            }}>
                            <Sparkles className='mr-2 h-4 w-4' />
                            Generate
                        </Button>
                    ) : (
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            onClick={() => {
                                void onCreateLiveSession(selection.id);
                            }}>
                            Start Session
                        </Button>
                    )}
                </div>

                <div className='mb-2 flex flex-wrap gap-2'>
                    {DESIGNER_ACTION_CHIPS.map((chip) => (
                        <Button
                            key={`${selection.id}:${chip}`}
                            type='button'
                            size='sm'
                            variant={intentForm.actionChip === chip ? 'default' : 'outline'}
                            className='h-7 rounded-full px-2 text-[11px]'
                            onClick={() => {
                                onIntentFormChange({
                                    ...intentForm,
                                    actionChip: chip,
                                    intentText: intentForm.intentText.trim().length > 0 ? intentForm.intentText : chip,
                                });
                            }}>
                            {chip}
                        </Button>
                    ))}
                </div>
                <div className='grid gap-2 xl:grid-cols-[minmax(0,1fr)_110px]'>
                    <input
                        className='border-border bg-background rounded-xl border px-3 py-2 text-sm'
                        value={intentForm.intentText}
                        onChange={(event) => {
                            onIntentFormChange({ ...intentForm, intentText: event.target.value });
                        }}
                        placeholder='Design intent for generated variants'
                    />
                    <input
                        className='border-border bg-background rounded-xl border px-3 py-2 text-sm'
                        type='number'
                        min={1}
                        max={6}
                        value={intentForm.requestedVariantCount}
                        onChange={(event) => {
                            onIntentFormChange({
                                ...intentForm,
                                requestedVariantCount: Number.parseInt(event.target.value, 10) || 3,
                            });
                        }}
                    />
                </div>

                {designerLiveSession?.errorMessage ? (
                    <p className='text-muted-foreground mt-2 text-[11px]'>{designerLiveSession.errorMessage}</p>
                ) : null}

                {designerLiveSession ? (
                    <div className='mt-3 space-y-2'>
                        <div className='flex gap-2'>
                            <input
                                className='border-border bg-background min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm'
                                value={annotationText}
                                onChange={(event) => {
                                    onAnnotationTextChange(designerLiveSession.id, event.target.value);
                                }}
                                placeholder='Add annotation context for this element'
                            />
                            <Button
                                type='button'
                                size='sm'
                                variant='outline'
                                onClick={() => {
                                    void onCreateAnnotation(designerLiveSession.id, selection);
                                }}>
                                Add
                            </Button>
                        </div>
                        {annotations.length > 0 ? (
                            <div className='flex flex-wrap gap-2 text-[11px]'>
                                {annotations.map((annotation) => (
                                    <span key={annotation.id} className='rounded-full border px-2 py-1'>
                                        {annotation.kind}: {annotation.text ?? 'marked area'}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {variants.length > 0 ? (
                    <div className='mt-3 space-y-2'>
                        {variants.map((variant) => (
                            <div key={variant.id} className='rounded-xl border px-3 py-3'>
                                <div className='flex flex-wrap items-start justify-between gap-2'>
                                    <div className='min-w-0'>
                                        <p className='text-xs font-medium'>{variant.name}</p>
                                        <p className='text-muted-foreground text-[11px]'>{variant.summaryMarkdown}</p>
                                        <p className='text-muted-foreground mt-1 text-[11px]'>
                                            {variant.status}
                                            {activeVariant?.id === variant.id ? ' · previewing' : ''}
                                        </p>
                                    </div>
                                    <div className='flex flex-wrap gap-1'>
                                        <Button
                                            type='button'
                                            size='sm'
                                            variant='ghost'
                                            disabled={variant.status === 'discarded'}
                                            onClick={() => {
                                                void onActivateVariant(variant.designerSessionId, variant.id);
                                            }}>
                                            Preview
                                        </Button>
                                        <Button
                                            type='button'
                                            size='sm'
                                            variant='ghost'
                                            disabled={variant.status === 'discarded'}
                                            onClick={() => {
                                                void onTuneVariant(variant);
                                            }}>
                                            Tune
                                        </Button>
                                        <Button
                                            type='button'
                                            size='sm'
                                            variant='ghost'
                                            disabled={variant.status === 'discarded'}
                                            onClick={() => {
                                                void onAcceptVariant(variant.designerSessionId, variant.id);
                                            }}>
                                            Accept
                                        </Button>
                                        <Button
                                            type='button'
                                            size='sm'
                                            variant='ghost'
                                            disabled={variant.status === 'discarded'}
                                            onClick={() => {
                                                void onDiscardVariant(variant.designerSessionId, variant.id);
                                            }}>
                                            Discard
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
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
