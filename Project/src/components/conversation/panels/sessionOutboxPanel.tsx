import { skipToken } from '@tanstack/react-query';
import {
    ArrowDown,
    ArrowUp,
    Edit3,
    FileUp,
    PauseCircle,
    Play,
    Save,
    X,
    XCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { prepareComposerImageAttachment } from '@/web/components/conversation/hooks/composerImageAttachments';
import { prepareComposerTextFileAttachment } from '@/web/components/conversation/hooks/composerTextFileAttachments';
import { Button } from '@/web/components/ui/button';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type {
    ComposerAttachmentInput,
    EntityId,
    SessionAttachmentPayload,
    SessionOutboxEntry,
} from '@/shared/contracts';

interface SessionOutboxPanelProps {
    entries: SessionOutboxEntry[];
    selectedEntryId?: EntityId<'outbox'>;
    onSelectEntry?: (entryId: EntityId<'outbox'>) => void;
    onMoveEntry?: (entryId: EntityId<'outbox'>, direction: 'up' | 'down') => void;
    onResumeEntry?: (entryId: EntityId<'outbox'>) => void;
    onCancelEntry?: (entryId: EntityId<'outbox'>) => void;
    onUpdateEntry?: (input: {
        entryId: EntityId<'outbox'>;
        prompt: string;
        attachments: ComposerAttachmentInput[];
    }) => Promise<void>;
}

function formatAttachmentSummary(entry: SessionOutboxEntry): string {
    if (entry.attachmentIds.length === 0) {
        return 'No attachments';
    }
    return `${String(entry.attachmentIds.length)} attachment${entry.attachmentIds.length === 1 ? '' : 's'}`;
}

function summarizeDraftAttachment(attachment: ComposerAttachmentInput): string {
    if (attachment.kind === 'text_file_attachment') {
        return `${attachment.fileName} · ${(attachment.byteSize / 1024).toFixed(1)} KB · text`;
    }
    return `${attachment.fileName ?? 'image'} · ${((attachment.byteSize ?? 0) / 1024).toFixed(1)} KB · ${attachment.width}×${attachment.height}`;
}

function toDraftAttachment(payload: SessionAttachmentPayload): ComposerAttachmentInput {
    if (payload.kind === 'text_file_attachment') {
        return {
            clientId: payload.id,
            kind: 'text_file_attachment',
            fileName: payload.fileName ?? 'attachment.txt',
            mimeType: payload.mimeType,
            text: payload.text,
            sha256: payload.sha256,
            byteSize: payload.byteSize,
            encoding: payload.encoding ?? 'utf-8',
        };
    }

    return {
        clientId: payload.id,
        kind: 'image_attachment',
        mimeType: payload.mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
        bytesBase64: payload.bytesBase64,
        width: payload.width ?? 1,
        height: payload.height ?? 1,
        sha256: payload.sha256,
        byteSize: payload.byteSize,
        ...(payload.fileName ? { fileName: payload.fileName } : {}),
    };
}

function selectEntry(
    entryId: EntityId<'outbox'>,
    setLocalSelectedEntryId: (entryId: EntityId<'outbox'>) => void,
    onSelectEntry?: (entryId: EntityId<'outbox'>) => void
) {
    setLocalSelectedEntryId(entryId);
    onSelectEntry?.(entryId);
}

export function SessionOutboxPanel({
    entries,
    selectedEntryId,
    onSelectEntry,
    onMoveEntry,
    onResumeEntry,
    onCancelEntry,
    onUpdateEntry,
}: SessionOutboxPanelProps) {
    const [localSelectedEntryId, setLocalSelectedEntryId] = useState<EntityId<'outbox'> | undefined>(
        selectedEntryId ?? entries[0]?.id
    );
    const [isEditing, setIsEditing] = useState(false);
    const [draftPrompt, setDraftPrompt] = useState('');
    const [draftAttachments, setDraftAttachments] = useState<ComposerAttachmentInput[]>([]);
    const [editorMessage, setEditorMessage] = useState<string | undefined>(undefined);
    const [isSaving, setIsSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (selectedEntryId) {
            setLocalSelectedEntryId(selectedEntryId);
        }
    }, [selectedEntryId]);

    useEffect(() => {
        if (entries.length === 0) {
            setLocalSelectedEntryId(undefined);
            return;
        }
        const firstEntry = entries[0];
        if (!firstEntry) {
            return;
        }
        if (localSelectedEntryId && entries.some((entry) => entry.id === localSelectedEntryId)) {
            return;
        }
        selectEntry(firstEntry.id, setLocalSelectedEntryId, onSelectEntry);
    }, [entries, localSelectedEntryId, onSelectEntry]);

    const selectedEntry = entries.find((entry) => entry.id === localSelectedEntryId) ?? entries[0];
    const selectedEntryQuery = trpc.session.getOutboxEntry.useQuery(
        selectedEntry
            ? {
                  profileId: selectedEntry.profileId,
                  sessionId: selectedEntry.sessionId,
                  entryId: selectedEntry.id,
              }
            : skipToken,
        PROGRESSIVE_QUERY_OPTIONS
    );

    useEffect(() => {
        setIsEditing(false);
        setEditorMessage(undefined);
    }, [selectedEntry?.id]);

    useEffect(() => {
        if (!isEditing || !selectedEntryQuery.data?.found) {
            return;
        }
        setDraftPrompt(selectedEntryQuery.data.entry.prompt);
        setDraftAttachments(selectedEntryQuery.data.attachments.map(toDraftAttachment));
    }, [isEditing, selectedEntryQuery.data]);

    function hydrateEditorFromQuery() {
        if (!selectedEntryQuery.data?.found) {
            return;
        }
        setDraftPrompt(selectedEntryQuery.data.entry.prompt);
        setDraftAttachments(selectedEntryQuery.data.attachments.map(toDraftAttachment));
    }

    async function handleAddFiles(fileList: FileList | File[]) {
        const files = Array.from(fileList);
        if (files.length === 0) {
            return;
        }

        const nextAttachments: ComposerAttachmentInput[] = [];
        const errors: string[] = [];
        for (const file of files) {
            const clientId = crypto.randomUUID();
            if (file.type.startsWith('image/')) {
                const prepared = await prepareComposerImageAttachment(file, clientId);
                if (prepared.isErr()) {
                    errors.push(prepared.error.message);
                    continue;
                }
                nextAttachments.push(prepared.value.attachment);
                continue;
            }

            const prepared = await prepareComposerTextFileAttachment(file, clientId);
            if (prepared.isErr()) {
                errors.push(prepared.error.message);
                continue;
            }
            nextAttachments.push(prepared.value.attachment);
        }

        if (nextAttachments.length > 0) {
            setDraftAttachments((current) => [...current, ...nextAttachments]);
        }
        setEditorMessage(errors.length > 0 ? errors[0] : undefined);
    }

    async function handleSave() {
        if (!selectedEntry || !onUpdateEntry) {
            return;
        }
        setIsSaving(true);
        setEditorMessage(undefined);
        try {
            await onUpdateEntry({
                entryId: selectedEntry.id,
                prompt: draftPrompt.trim(),
                attachments: draftAttachments,
            });
            await selectedEntryQuery.refetch();
            setIsEditing(false);
            setEditorMessage('Queued entry updated.');
        } catch (error) {
            setEditorMessage(error instanceof Error ? error.message : 'Queued entry update failed.');
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <section className='border-border/70 bg-card/20 rounded-[26px] border px-4 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)]'>
            <div className='mb-3 flex items-center justify-between gap-3'>
                <div>
                    <h3 className='text-sm font-semibold'>Session Outbox</h3>
                    <p className='text-muted-foreground text-xs'>Queued runs stay local to this session and re-check their run contract before execution.</p>
                </div>
                <span className='text-muted-foreground rounded-full border px-2 py-1 text-[11px]'>
                    {String(entries.length)} queued
                </span>
            </div>
            <div className='space-y-2'>
                {entries.map((entry, index) => {
                    const isSelected = entry.id === selectedEntry?.id;
                    return (
                        <article
                            key={entry.id}
                            className={`rounded-2xl border p-3 transition-colors ${isSelected ? 'border-foreground/20 bg-background' : 'border-border/60 bg-background/70'}`}
                            onClick={() => {
                                selectEntry(entry.id, setLocalSelectedEntryId, onSelectEntry);
                            }}>
                            <div className='flex items-start justify-between gap-3'>
                                <div className='min-w-0 flex-1'>
                                    <div className='mb-1 flex flex-wrap items-center gap-2'>
                                        <span className='text-xs font-medium'>#{entry.sequence + 1}</span>
                                        <span className='text-muted-foreground rounded-full border px-2 py-0.5 text-[11px]'>
                                            {entry.state.replaceAll('_', ' ')}
                                        </span>
                                        <span className='text-muted-foreground rounded-full border px-2 py-0.5 text-[11px]'>
                                            {formatAttachmentSummary(entry)}
                                        </span>
                                    </div>
                                    <p className='line-clamp-2 text-sm'>{entry.prompt}</p>
                                    {entry.pausedReason ? (
                                        <p className='text-muted-foreground mt-2 text-xs'>{entry.pausedReason}</p>
                                    ) : null}
                                </div>
                                <div className='flex shrink-0 items-center gap-1'>
                                    <Button
                                        type='button'
                                        size='icon'
                                        variant='ghost'
                                        className='h-8 w-8 rounded-full'
                                        disabled={!onMoveEntry || index === 0}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onMoveEntry?.(entry.id, 'up');
                                        }}>
                                        <ArrowUp className='h-4 w-4' />
                                    </Button>
                                    <Button
                                        type='button'
                                        size='icon'
                                        variant='ghost'
                                        className='h-8 w-8 rounded-full'
                                        disabled={!onMoveEntry || index === entries.length - 1}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onMoveEntry?.(entry.id, 'down');
                                        }}>
                                        <ArrowDown className='h-4 w-4' />
                                    </Button>
                                    {entry.state === 'paused_for_permission' || entry.state === 'paused_for_review' ? (
                                        <Button
                                            type='button'
                                            size='icon'
                                            variant='ghost'
                                            className='h-8 w-8 rounded-full'
                                            disabled={!onResumeEntry}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onResumeEntry?.(entry.id);
                                            }}>
                                            {entry.state === 'paused_for_permission' ? (
                                                <PauseCircle className='h-4 w-4' />
                                            ) : (
                                                <Play className='h-4 w-4' />
                                            )}
                                        </Button>
                                    ) : null}
                                    {entry.state !== 'completed' && entry.state !== 'cancelled' ? (
                                        <Button
                                            type='button'
                                            size='icon'
                                            variant='ghost'
                                            className='h-8 w-8 rounded-full'
                                            disabled={!onCancelEntry}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                onCancelEntry?.(entry.id);
                                            }}>
                                            <XCircle className='h-4 w-4' />
                                        </Button>
                                    ) : null}
                                </div>
                            </div>
                        </article>
                    );
                })}
            </div>
            {selectedEntry ? (
                <div className='border-border/60 bg-background/80 mt-3 space-y-3 rounded-2xl border p-3'>
                    <div className='flex items-start justify-between gap-3'>
                        <div>
                            <h4 className='text-sm font-semibold'>Queued Entry Review</h4>
                            <p className='text-muted-foreground text-xs'>
                                {selectedEntry.steeringSnapshot.providerId} / {selectedEntry.steeringSnapshot.modelId}
                            </p>
                        </div>
                        <div className='flex items-center gap-2'>
                            {!isEditing ? (
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='outline'
                                    disabled={!onUpdateEntry || selectedEntry.state === 'running'}
                                    onClick={() => {
                                        hydrateEditorFromQuery();
                                        setIsEditing(true);
                                    }}>
                                    <Edit3 className='mr-2 h-4 w-4' />
                                    Edit
                                </Button>
                            ) : (
                                <>
                                    <Button
                                        type='button'
                                        size='sm'
                                        variant='outline'
                                        onClick={() => {
                                            hydrateEditorFromQuery();
                                            void fileInputRef.current?.click();
                                        }}>
                                        <FileUp className='mr-2 h-4 w-4' />
                                        Add Files
                                    </Button>
                                    <Button
                                        type='button'
                                        size='sm'
                                        variant='outline'
                                        disabled={isSaving}
                                        onClick={() => {
                                            setIsEditing(false);
                                            hydrateEditorFromQuery();
                                            setEditorMessage(undefined);
                                        }}>
                                        <X className='mr-2 h-4 w-4' />
                                        Cancel
                                    </Button>
                                    <Button type='button' size='sm' disabled={isSaving} onClick={() => void handleSave()}>
                                        <Save className='mr-2 h-4 w-4' />
                                        {isSaving ? 'Saving…' : 'Save'}
                                    </Button>
                                </>
                            )}
                        </div>
                    </div>
                    <input
                        ref={fileInputRef}
                        type='file'
                        className='hidden'
                        multiple
                        accept='image/*,.txt,.md,.markdown,.json,.yml,.yaml,.toml,.ini,.conf,.env,.xml,.html,.htm,.css,.scss,.less,.js,.jsx,.ts,.tsx,.mjs,.cjs,.py,.rb,.go,.rs,.java,.kt,.c,.cc,.cpp,.h,.hpp,.cs,.php,.sql,.sh,.ps1,.bat,.cmd,.graphql,.gql,.dockerfile'
                        onChange={(event) => {
                            if (!event.target.files) {
                                return;
                            }
                            void handleAddFiles(event.target.files);
                            event.target.value = '';
                        }}
                    />
                    {isEditing ? (
                        <div className='space-y-3'>
                            <label className='space-y-1 text-xs'>
                                <span className='text-muted-foreground'>Prompt</span>
                                <textarea
                                    className='border-border bg-background min-h-28 w-full rounded-xl border px-3 py-2 text-sm outline-none'
                                    value={draftPrompt}
                                    onChange={(event) => {
                                        setDraftPrompt(event.target.value);
                                    }}
                                />
                            </label>
                            <div className='space-y-2'>
                                <div className='flex items-center justify-between gap-2'>
                                    <p className='text-muted-foreground text-xs'>Attachment snapshot</p>
                                    <span className='text-muted-foreground text-xs'>{String(draftAttachments.length)} items</span>
                                </div>
                                {draftAttachments.length === 0 ? (
                                    <p className='text-muted-foreground rounded-xl border border-dashed px-3 py-3 text-xs'>
                                        No queued attachments.
                                    </p>
                                ) : (
                                    draftAttachments.map((attachment, index) => (
                                        <div key={attachment.clientId} className='flex items-center justify-between gap-3 rounded-xl border px-3 py-2'>
                                            <div className='min-w-0 flex-1'>
                                                <p className='truncate text-xs font-medium'>{summarizeDraftAttachment(attachment)}</p>
                                                <p className='text-muted-foreground text-[11px]'>{attachment.mimeType}</p>
                                            </div>
                                            <div className='flex items-center gap-1'>
                                                <Button
                                                    type='button'
                                                    size='icon'
                                                    variant='ghost'
                                                    className='h-7 w-7 rounded-full'
                                                    disabled={index === 0}
                                                    onClick={() => {
                                                        setDraftAttachments((current) => {
                                                            const currentAttachment = current[index];
                                                            const previousAttachment = current[index - 1];
                                                            if (index === 0 || !currentAttachment || !previousAttachment) {
                                                                return current;
                                                            }
                                                            const next = [...current];
                                                            next[index - 1] = currentAttachment;
                                                            next[index] = previousAttachment;
                                                            return next;
                                                        });
                                                    }}>
                                                    <ArrowUp className='h-3.5 w-3.5' />
                                                </Button>
                                                <Button
                                                    type='button'
                                                    size='icon'
                                                    variant='ghost'
                                                    className='h-7 w-7 rounded-full'
                                                    disabled={index === draftAttachments.length - 1}
                                                    onClick={() => {
                                                        setDraftAttachments((current) => {
                                                            const currentAttachment = current[index];
                                                            const followingAttachment = current[index + 1];
                                                            if (
                                                                index >= current.length - 1 ||
                                                                !currentAttachment ||
                                                                !followingAttachment
                                                            ) {
                                                                return current;
                                                            }
                                                            const next = [...current];
                                                            next[index + 1] = currentAttachment;
                                                            next[index] = followingAttachment;
                                                            return next;
                                                        });
                                                    }}>
                                                    <ArrowDown className='h-3.5 w-3.5' />
                                                </Button>
                                                <Button
                                                    type='button'
                                                    size='icon'
                                                    variant='ghost'
                                                    className='h-7 w-7 rounded-full'
                                                    onClick={() => {
                                                        setDraftAttachments((current) =>
                                                            current.filter((candidate) => candidate.clientId !== attachment.clientId)
                                                        );
                                                    }}>
                                                    <X className='h-3.5 w-3.5' />
                                                </Button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className='space-y-2 text-xs'>
                            <p className='text-muted-foreground'>{selectedEntry.prompt}</p>
                            <p className='text-muted-foreground'>
                                Attachments: {String(selectedEntry.attachmentIds.length)} · Context contributors:{' '}
                                {String(selectedEntry.latestRunContract?.preparedContext.activeContributorCount ?? 0)}
                            </p>
                            <p className='text-muted-foreground'>
                                Trust mix: trusted{' '}
                                {String(
                                    selectedEntry.latestRunContract?.trustSummary.contributorCountByTrustLevel
                                        .trusted_instruction ?? 0
                                )}{' '}
                                · user{' '}
                                {String(
                                    selectedEntry.latestRunContract?.trustSummary.contributorCountByTrustLevel.user_input ?? 0
                                )}
                            </p>
                            {selectedEntry.latestRunContract?.diffFromLastCompatible?.items.length ? (
                                <div className='rounded-xl border px-3 py-2'>
                                    <p className='font-medium'>Latest compatibility diff</p>
                                    {selectedEntry.latestRunContract.diffFromLastCompatible.items.slice(0, 3).map((item) => (
                                        <p key={`${item.field}:${item.reason}`} className='text-muted-foreground mt-1'>
                                            {item.field}: {item.reason}
                                        </p>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    )}
                    {selectedEntryQuery.isFetching ? (
                        <p className='text-muted-foreground text-xs'>Refreshing queued entry snapshot…</p>
                    ) : null}
                    {editorMessage ? <p className='text-muted-foreground text-xs'>{editorMessage}</p> : null}
                </div>
            ) : null}
        </section>
    );
}
