import { skipToken } from '@tanstack/react-query';
import {
    ArrowLeft,
    ArrowRight,
    CheckSquare,
    MousePointerClick,
    Plus,
    RefreshCcw,
    Send,
    Square,
    Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/web/components/ui/button';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type {
    BrowserCommentDraft,
    BrowserContextPacket,
    BrowserDesignerDraft,
    BrowserSelectionRecord,
    EntityId,
} from '@/shared/contracts';

type DesignerDraftFormState = {
    applyMode: 'preview_only' | 'apply_with_agent';
    width: string;
    height: string;
    gap: string;
    padding: string;
    fontSize: string;
    color: string;
    backgroundColor: string;
    borderRadius: string;
    boxShadow: string;
    opacity: string;
    textContentOverride: string;
};

const DESIGNER_STYLE_FIELDS: Array<{ key: keyof Omit<DesignerDraftFormState, 'applyMode' | 'textContentOverride'>; label: string }> = [
    { key: 'width', label: 'Width' },
    { key: 'height', label: 'Height' },
    { key: 'gap', label: 'Gap' },
    { key: 'padding', label: 'Padding' },
    { key: 'fontSize', label: 'Font Size' },
    { key: 'color', label: 'Text Color' },
    { key: 'backgroundColor', label: 'Background' },
    { key: 'borderRadius', label: 'Radius' },
    { key: 'boxShadow', label: 'Shadow' },
    { key: 'opacity', label: 'Opacity' },
];

function buildDesignerDraftFormState(draft?: BrowserDesignerDraft): DesignerDraftFormState {
    return {
        applyMode: draft?.applyMode ?? 'preview_only',
        width: draft?.stylePatches.width ?? '',
        height: draft?.stylePatches.height ?? '',
        gap: draft?.stylePatches.gap ?? '',
        padding: draft?.stylePatches.padding ?? '',
        fontSize: draft?.stylePatches.fontSize ?? '',
        color: draft?.stylePatches.color ?? '',
        backgroundColor: draft?.stylePatches.backgroundColor ?? '',
        borderRadius: draft?.stylePatches.borderRadius ?? '',
        boxShadow: draft?.stylePatches.boxShadow ?? '',
        opacity: draft?.stylePatches.opacity ?? '',
        textContentOverride: draft?.textContentOverride ?? '',
    };
}

function toDesignerStylePatchPayload(formState: DesignerDraftFormState): { stylePatches: Record<string, string>; textContentOverride?: string } {
    const stylePatches: Record<string, string> = {};
    for (const field of DESIGNER_STYLE_FIELDS) {
        const value = formState[field.key].trim();
        if (value.length > 0) {
            stylePatches[field.key] = value;
        }
    }

    return {
        stylePatches,
        ...(formState.textContentOverride.trim().length > 0 ? { textContentOverride: formState.textContentOverride.trim() } : {}),
    };
}

interface DevBrowserPanelProps {
    profileId: string;
    sessionId?: EntityId<'sess'>;
    visible: boolean;
    currentDraftPrompt: string;
    onSubmitPrompt: (prompt: string, browserContext?: BrowserContextPacket) => void;
    onQueuePrompt?: (prompt: string, browserContext?: BrowserContextPacket) => void;
}

function buildSessionScopedInput(profileId: string, sessionId: EntityId<'sess'> | undefined) {
    return sessionId
        ? {
              profileId,
              sessionId,
          }
        : skipToken;
}

function summarizeSelection(selection: BrowserSelectionRecord): string {
    if (selection.accessibleLabel) {
        return selection.accessibleLabel;
    }
    if (selection.textExcerpt) {
        return selection.textExcerpt;
    }
    return selection.selector.primary;
}

function describeValidationStatus(input: {
    status?: 'allowed' | 'blocked' | 'invalid';
    browserAvailability?: 'available' | 'unavailable';
}): string {
    if (input.browserAvailability === 'unavailable') {
        return 'Hidden';
    }
    if (input.status === 'allowed') {
        return 'Allowed';
    }
    if (input.status === 'blocked') {
        return 'Blocked';
    }
    if (input.status === 'invalid') {
        return 'Invalid';
    }
    return 'Idle';
}

export function DevBrowserPanel({
    profileId,
    sessionId,
    visible,
    currentDraftPrompt,
    onSubmitPrompt,
    onQueuePrompt,
}: DevBrowserPanelProps) {
    const utils = trpc.useUtils();
    const scopedInput = buildSessionScopedInput(profileId, sessionId);
    const browserStateQuery = trpc.session.getDevBrowserState.useQuery(scopedInput, PROGRESSIVE_QUERY_OPTIONS);
    const includedPacketQuery = trpc.session.buildBrowserContextPacket.useQuery(scopedInput, PROGRESSIVE_QUERY_OPTIONS);

    const setTargetMutation = trpc.session.setDevBrowserTarget.useMutation();
    const controlMutation = trpc.session.controlDevBrowser.useMutation();
    const setPickerMutation = trpc.session.setDevBrowserPicker.useMutation();
    const createCommentMutation = trpc.session.createBrowserCommentDraft.useMutation();
    const updateCommentMutation = trpc.session.updateBrowserCommentDraft.useMutation();
    const deleteCommentMutation = trpc.session.deleteBrowserCommentDraft.useMutation();
    const moveCommentMutation = trpc.session.moveBrowserCommentDraft.useMutation();
    const setInclusionMutation = trpc.session.setBrowserCommentDraftInclusion.useMutation();
    const clearStaleMutation = trpc.session.clearStaleBrowserContext.useMutation();
    const persistSelectionMutation = trpc.session.persistBrowserSelection.useMutation();
    const upsertDesignerMutation = trpc.session.upsertBrowserDesignerDraft.useMutation();
    const deleteDesignerMutation = trpc.session.deleteBrowserDesignerDraft.useMutation();
    const setDesignerInclusionMutation = trpc.session.setBrowserDesignerDraftInclusion.useMutation();

    const browserState = browserStateQuery.data;
    const mountRef = useRef<HTMLDivElement | null>(null);
    const [scheme, setScheme] = useState<'http' | 'https'>('http');
    const [host, setHost] = useState('localhost');
    const [port, setPort] = useState('3000');
    const [path, setPath] = useState('/');
    const [selectionDrafts, setSelectionDrafts] = useState<Record<string, string>>({});
    const [commentEdits, setCommentEdits] = useState<Record<string, string>>({});
    const [designerDraftForms, setDesignerDraftForms] = useState<Record<string, DesignerDraftFormState>>({});
    const [feedback, setFeedback] = useState<string | undefined>(undefined);

    useEffect(() => {
        const target = browserState?.target;
        if (!target) {
            return;
        }
        setScheme(target.scheme);
        setHost(target.host);
        setPort(target.port !== undefined ? String(target.port) : '');
        setPath(target.path);
    }, [browserState?.target?.scheme, browserState?.target?.host, browserState?.target?.port, browserState?.target?.path]);

    useEffect(() => {
        if (!sessionId) {
            return;
        }

        const desktopBridge = typeof window !== 'undefined' ? window.neonDesktop : undefined;
        if (!desktopBridge) {
            return;
        }

        let animationFrameId = 0;
        const syncMount = () => {
            const element = mountRef.current;
            if (!element) {
                return;
            }
            const rect = element.getBoundingClientRect();
            void desktopBridge.devBrowser.syncMount({
                profileId,
                sessionId,
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                visible: visible && rect.width > 0 && rect.height > 0,
            });
        };
        const scheduleSync = () => {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = window.requestAnimationFrame(syncMount);
        };

        scheduleSync();
        const element = mountRef.current;
        const resizeObserver =
            element && typeof ResizeObserver !== 'undefined'
                ? new ResizeObserver(() => {
                      scheduleSync();
                  })
                : null;
        if (resizeObserver && element) {
            resizeObserver.observe(element);
        }
        window.addEventListener('resize', scheduleSync);
        window.addEventListener('scroll', scheduleSync, true);

        return () => {
            cancelAnimationFrame(animationFrameId);
            resizeObserver?.disconnect();
            window.removeEventListener('resize', scheduleSync);
            window.removeEventListener('scroll', scheduleSync, true);
            void desktopBridge.devBrowser.syncMount({
                profileId,
                sessionId,
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                visible: false,
            });
        };
    }, [profileId, sessionId, visible]);

    const commentDraftsBySelectionId = useMemo(() => {
        const drafts = new Map<EntityId<'bsel'>, BrowserCommentDraft[]>();
        for (const draft of browserState?.commentDrafts ?? []) {
            const selectionDraftsForSelection = drafts.get(draft.selectionId) ?? [];
            selectionDraftsForSelection.push(draft);
            drafts.set(draft.selectionId, selectionDraftsForSelection);
        }
        return drafts;
    }, [browserState?.commentDrafts]);

    const designerDraftsBySelectionId = useMemo(() => {
        const drafts = new Map<EntityId<'bsel'>, BrowserDesignerDraft>();
        for (const draft of browserState?.designerDrafts ?? []) {
            drafts.set(draft.selectionId, draft);
        }
        return drafts;
    }, [browserState?.designerDrafts]);

    async function invalidateBrowserQueries() {
        if (!sessionId) {
            return;
        }
        await Promise.all([
            utils.session.getDevBrowserState.invalidate({ profileId, sessionId }),
            utils.session.buildBrowserContextPacket.invalidate(),
        ]);
    }

    async function handleApplyTarget() {
        if (!sessionId) {
            return;
        }

        setFeedback(undefined);
        try {
            await setTargetMutation.mutateAsync({
                profileId,
                sessionId,
                target: {
                    scheme,
                    host,
                    ...(port.trim().length > 0 ? { port: Number.parseInt(port, 10) } : {}),
                    path,
                    sourceKind: 'manual',
                },
            });
            await invalidateBrowserQueries();
        } catch (error) {
            setFeedback(error instanceof Error ? error.message : 'Dev browser target update failed.');
        }
    }

    async function handleControl(action: 'back' | 'forward' | 'reload') {
        if (!sessionId) {
            return;
        }
        await controlMutation.mutateAsync({
            profileId,
            sessionId,
            action,
        });
    }

    async function handleTogglePicker() {
        if (!sessionId) {
            return;
        }
        await setPickerMutation.mutateAsync({
            profileId,
            sessionId,
            active: !(browserState?.pickerActive ?? false),
        });
    }

    async function handleCreateComment(selectionId: EntityId<'bsel'>) {
        if (!sessionId) {
            return;
        }
        const commentText = selectionDrafts[selectionId]?.trim();
        if (!commentText) {
            setFeedback('Write a comment before staging it.');
            return;
        }
        await createCommentMutation.mutateAsync({
            profileId,
            sessionId,
            selectionId,
            commentText,
            inclusionState: 'included',
        });
        setSelectionDrafts((current) => ({
            ...current,
            [selectionId]: '',
        }));
        setFeedback(undefined);
    }

    async function handleSaveComment(draftId: EntityId<'bcmt'>) {
        if (!sessionId) {
            return;
        }
        const commentText = commentEdits[draftId]?.trim();
        if (!commentText) {
            setFeedback('Comment text cannot be empty.');
            return;
        }
        await updateCommentMutation.mutateAsync({
            profileId,
            sessionId,
            draftId,
            commentText,
        });
        setFeedback(undefined);
    }

    async function handleBuildPacketAndSend(input: {
        scope: 'included' | 'all';
        action: 'submit' | 'queue';
    }) {
        if (!sessionId) {
            return;
        }
        const allDraftIds =
            input.scope === 'all'
                ? (browserState?.commentDrafts ?? []).map((draft) => draft.id)
                : undefined;
        const packetResult = await utils.session.buildBrowserContextPacket.fetch({
            profileId,
            sessionId,
            ...(allDraftIds && allDraftIds.length > 0 ? { commentDraftIds: allDraftIds } : {}),
        });
        if (!packetResult.available) {
            setFeedback(packetResult.message);
            return;
        }

        if (input.action === 'submit') {
            onSubmitPrompt(currentDraftPrompt, packetResult.packet);
            return;
        }

        onQueuePrompt?.(currentDraftPrompt, packetResult.packet);
    }

    async function handleSelectAncestor(selection: BrowserSelectionRecord, ancestorIndex: number) {
        if (!sessionId) {
            return;
        }
        const ancestor = selection.ancestryTrail[ancestorIndex];
        if (!ancestor) {
            return;
        }
        await persistSelectionMutation.mutateAsync({
            profileId,
            sessionId,
            selection: {
                pageIdentity: selection.pageIdentity,
                pageUrl: selection.pageUrl,
                ...(selection.pageTitle ? { pageTitle: selection.pageTitle } : {}),
                selector: {
                    primary: ancestor.selector,
                    path: selection.selector.path.slice(0, Math.max(ancestorIndex + 1, 1)),
                },
                ancestryTrail: selection.ancestryTrail,
                ...(ancestor.accessibleLabel ? { accessibleLabel: ancestor.accessibleLabel } : {}),
                ...(ancestor.accessibleRole ? { accessibleRole: ancestor.accessibleRole } : {}),
                ...(selection.textExcerpt ? { textExcerpt: selection.textExcerpt } : {}),
                bounds: selection.bounds,
                enrichmentMode: selection.enrichmentMode,
                ...(selection.reactEnrichment ? { reactEnrichment: selection.reactEnrichment } : {}),
            },
        });
        setFeedback(undefined);
    }

    async function handlePreviewDesigner(selectionId: EntityId<'bsel'>) {
        if (!sessionId) {
            return;
        }
        const formState = designerDraftForms[selectionId] ?? buildDesignerDraftFormState(designerDraftsBySelectionId.get(selectionId));
        const payload = toDesignerStylePatchPayload(formState);
        if (Object.keys(payload.stylePatches).length === 0 && !payload.textContentOverride) {
            setFeedback('Add at least one preview change before saving a designer draft.');
            return;
        }
        await upsertDesignerMutation.mutateAsync({
            profileId,
            sessionId,
            selectionId,
            applyMode: formState.applyMode,
            stylePatches: payload.stylePatches,
            ...(payload.textContentOverride ? { textContentOverride: payload.textContentOverride } : {}),
            inclusionState: 'included',
        });
        await invalidateBrowserQueries();
        setFeedback(undefined);
    }

    async function handleDeleteDesignerDraft(draftId: EntityId<'bdsn'>, selectionId: EntityId<'bsel'>) {
        if (!sessionId) {
            return;
        }
        await deleteDesignerMutation.mutateAsync({
            profileId,
            sessionId,
            draftId,
        });
        setDesignerDraftForms((current) => {
            const next = { ...current };
            delete next[selectionId];
            return next;
        });
        await invalidateBrowserQueries();
        setFeedback(undefined);
    }

    const target = browserState?.target;
    const includedBrowserSummary =
        includedPacketQuery.data?.available === true ? includedPacketQuery.data.summary : browserState?.summary;
    const canSendIncluded = includedPacketQuery.data?.available === true;
    const hasAnyDraftContext = (browserState?.commentDrafts.length ?? 0) > 0 || (browserState?.designerDrafts.length ?? 0) > 0;
    const selectionCount = browserState?.selections.length ?? 0;
    const staleContextCount =
        (browserState?.commentDrafts.filter((draft) => draft.stale).length ?? 0) +
        (browserState?.designerDrafts.filter((draft) => draft.stale).length ?? 0);
    const statusLabel = describeValidationStatus({
        ...(target?.validation.status ? { status: target.validation.status } : {}),
        ...(target?.browserAvailability ? { browserAvailability: target.browserAvailability } : {}),
    });

    if (!sessionId) {
        return (
            <section className='border-border/60 bg-background/80 flex h-full min-h-0 flex-col items-center justify-center rounded-[26px] border border-dashed p-6 text-center'>
                <h3 className='text-sm font-semibold'>Dev Browser</h3>
                <p className='text-muted-foreground mt-2 max-w-xl text-sm'>
                    Select a session to open the local dev browser and stage structured frontend comments.
                </p>
            </section>
        );
    }

    return (
        <section className='flex h-full min-h-0 flex-col gap-3'>
            <div className='border-border/70 bg-card/20 rounded-[26px] border px-4 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)]'>
                <div className='mb-3 flex flex-wrap items-start justify-between gap-3'>
                    <div>
                        <h3 className='text-sm font-semibold'>Dev Browser</h3>
                        <p className='text-muted-foreground text-xs'>
                            Local-network browser targeting, staged review comments, and packetized frontend context.
                        </p>
                    </div>
                    <div className='flex flex-wrap items-center gap-2 text-[11px]'>
                        <span className='text-muted-foreground rounded-full border px-2 py-1'>{statusLabel}</span>
                        <span className='text-muted-foreground rounded-full border px-2 py-1'>
                            {selectionCount} selection{selectionCount === 1 ? '' : 's'}
                        </span>
                        <span className='text-muted-foreground rounded-full border px-2 py-1'>
                            {browserState?.commentDrafts.length ?? 0} comment{browserState?.commentDrafts.length === 1 ? '' : 's'}
                        </span>
                        <span className='text-muted-foreground rounded-full border px-2 py-1'>
                            {browserState?.designerDrafts.length ?? 0} designer{browserState?.designerDrafts.length === 1 ? '' : 's'}
                        </span>
                    </div>
                </div>

                <div className='grid gap-2 md:grid-cols-[92px_minmax(0,1fr)_88px_160px]'>
                    <select
                        className='border-border bg-background rounded-xl border px-3 py-2 text-sm'
                        value={scheme}
                        onChange={(event) => {
                            setScheme(event.target.value === 'https' ? 'https' : 'http');
                        }}>
                        <option value='http'>http</option>
                        <option value='https'>https</option>
                    </select>
                    <input
                        className='border-border bg-background rounded-xl border px-3 py-2 text-sm'
                        value={host}
                        onChange={(event) => {
                            setHost(event.target.value);
                        }}
                        placeholder='localhost'
                    />
                    <input
                        className='border-border bg-background rounded-xl border px-3 py-2 text-sm'
                        value={port}
                        onChange={(event) => {
                            setPort(event.target.value);
                        }}
                        placeholder='3000'
                    />
                    <input
                        className='border-border bg-background rounded-xl border px-3 py-2 text-sm'
                        value={path}
                        onChange={(event) => {
                            setPath(event.target.value);
                        }}
                        placeholder='/'
                    />
                </div>

                <div className='mt-3 flex flex-wrap items-center gap-2'>
                    <Button type='button' size='sm' variant='outline' onClick={() => void handleApplyTarget()}>
                        Apply Target
                    </Button>
                    <Button type='button' size='icon' variant='outline' className='h-9 w-9 rounded-full' onClick={() => void handleControl('back')}>
                        <ArrowLeft className='h-4 w-4' />
                    </Button>
                    <Button type='button' size='icon' variant='outline' className='h-9 w-9 rounded-full' onClick={() => void handleControl('forward')}>
                        <ArrowRight className='h-4 w-4' />
                    </Button>
                    <Button type='button' size='icon' variant='outline' className='h-9 w-9 rounded-full' onClick={() => void handleControl('reload')}>
                        <RefreshCcw className='h-4 w-4' />
                    </Button>
                    <Button
                        type='button'
                        size='sm'
                        variant={browserState?.pickerActive ? 'default' : 'outline'}
                        onClick={() => void handleTogglePicker()}>
                        <MousePointerClick className='mr-2 h-4 w-4' />
                        {browserState?.pickerActive ? 'Picker On' : 'Start Picker'}
                    </Button>
                    {staleContextCount > 0 ? (
                        <Button type='button' size='sm' variant='outline' onClick={() => clearStaleMutation.mutateAsync({ profileId, sessionId })}>
                            Clear Stale
                        </Button>
                    ) : null}
                </div>

                {target?.validation.blockedReasonMessage ? (
                    <p className='text-muted-foreground mt-3 text-xs'>{target.validation.blockedReasonMessage}</p>
                ) : target?.currentPage?.url ? (
                    <p className='text-muted-foreground mt-3 text-xs'>
                        Current page: {target.currentPage.url}
                        {target.currentPage.title ? ` · ${target.currentPage.title}` : ''}
                    </p>
                ) : null}

                <div
                    ref={mountRef}
                    className='border-border/70 bg-background mt-3 flex min-h-[340px] flex-1 items-center justify-center overflow-hidden rounded-[22px] border border-dashed'>
                    <div className='text-muted-foreground px-6 text-center text-sm'>
                        {typeof window === 'undefined' || !window.neonDesktop
                            ? 'The desktop bridge is unavailable in this renderer context.'
                            : visible
                              ? target?.validation.status === 'allowed'
                                  ? 'The dev browser is mounted here. Use the picker to capture structured element context.'
                                  : 'Set an allowed local-network target to mount the dev browser in this panel.'
                              : 'Switch to the browser surface to mount the dev browser here.'}
                    </div>
                </div>
            </div>

            <div className='border-border/70 bg-card/20 min-h-0 flex-1 rounded-[26px] border px-4 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)]'>
                <div className='mb-3 flex flex-wrap items-start justify-between gap-3'>
                    <div>
                        <h4 className='text-sm font-semibold'>Staged Browser Comments</h4>
                        <p className='text-muted-foreground text-xs'>
                            Keep comments reviewable, choose what to send, and queue browser packets through the normal run path.
                        </p>
                    </div>
                    <div className='flex flex-wrap items-center gap-2'>
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={!canSendIncluded}
                            onClick={() => void handleBuildPacketAndSend({ scope: 'included', action: 'submit' })}>
                            <Send className='mr-2 h-4 w-4' />
                            Send Selected
                        </Button>
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={!onQueuePrompt || !canSendIncluded}
                            onClick={() => void handleBuildPacketAndSend({ scope: 'included', action: 'queue' })}>
                            Queue Selected
                        </Button>
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={!hasAnyDraftContext}
                            onClick={() => void handleBuildPacketAndSend({ scope: 'all', action: 'submit' })}>
                            Send All
                        </Button>
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={!onQueuePrompt || !hasAnyDraftContext}
                            onClick={() => void handleBuildPacketAndSend({ scope: 'all', action: 'queue' })}>
                            Queue All
                        </Button>
                    </div>
                </div>

                {includedBrowserSummary ? (
                    <div className='mb-3 grid gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4'>
                        <div className='rounded-xl border px-3 py-2'>
                            <p className='text-muted-foreground'>Target</p>
                            <p className='font-medium'>{includedBrowserSummary.targetLabel}</p>
                        </div>
                        <div className='rounded-xl border px-3 py-2'>
                            <p className='text-muted-foreground'>Elements</p>
                            <p className='font-medium'>{includedBrowserSummary.selectedElementCount}</p>
                        </div>
                        <div className='rounded-xl border px-3 py-2'>
                            <p className='text-muted-foreground'>Comments</p>
                            <p className='font-medium'>{includedBrowserSummary.commentCount}</p>
                        </div>
                        <div className='rounded-xl border px-3 py-2'>
                            <p className='text-muted-foreground'>Captures</p>
                            <p className='font-medium'>{includedBrowserSummary.captureCount}</p>
                        </div>
                        <div className='rounded-xl border px-3 py-2'>
                            <p className='text-muted-foreground'>Designer</p>
                            <p className='font-medium'>
                                {includedBrowserSummary.designerDraftCount} draft{includedBrowserSummary.designerDraftCount === 1 ? '' : 's'}
                            </p>
                        </div>
                        <div className='rounded-xl border px-3 py-2'>
                            <p className='text-muted-foreground'>Apply Intent</p>
                            <p className='font-medium'>{includedBrowserSummary.designerApplyIntentStatus.replaceAll('_', ' ')}</p>
                        </div>
                    </div>
                ) : null}

                <div className='space-y-3 overflow-y-auto pr-1'>
                    {(browserState?.selections ?? []).length === 0 ? (
                        <div className='text-muted-foreground rounded-2xl border border-dashed px-4 py-5 text-sm'>
                            Turn on the picker, click an element in the dev browser, and it will appear here as a staged selection snapshot.
                        </div>
                    ) : (
                        (browserState?.selections ?? []).map((selection) => {
                            const selectionDraftText = selectionDrafts[selection.id] ?? '';
                            const selectionComments = commentDraftsBySelectionId.get(selection.id) ?? [];
                            const selectionDesignerDraft = designerDraftsBySelectionId.get(selection.id);
                            const designerFormState =
                                designerDraftForms[selection.id] ?? buildDesignerDraftFormState(selectionDesignerDraft);

                            return (
                                <article key={selection.id} className='rounded-2xl border px-4 py-4'>
                                    <div className='flex flex-wrap items-start justify-between gap-3'>
                                        <div className='min-w-0 flex-1'>
                                            <div className='mb-1 flex flex-wrap items-center gap-2'>
                                                <p className='truncate text-sm font-medium'>{summarizeSelection(selection)}</p>
                                                {selection.stale ? (
                                                    <span className='rounded-full border px-2 py-0.5 text-[11px]'>Stale</span>
                                                ) : null}
                                                <span className='text-muted-foreground rounded-full border px-2 py-0.5 text-[11px]'>
                                                    {selection.enrichmentMode}
                                                </span>
                                            </div>
                                            <p className='text-muted-foreground text-xs'>{selection.selector.primary}</p>
                                            {selection.accessibleRole || selection.accessibleLabel ? (
                                                <p className='text-muted-foreground mt-1 text-[11px]'>
                                                    {[selection.accessibleRole, selection.accessibleLabel].filter(Boolean).join(' · ')}
                                                </p>
                                            ) : null}
                                            {selection.textExcerpt ? (
                                                <p className='text-muted-foreground mt-1 text-[11px]'>{selection.textExcerpt}</p>
                                            ) : null}
                                            {selection.reactEnrichment ? (
                                                <div className='mt-2 space-y-1 text-[11px]'>
                                                    <p className='text-muted-foreground'>
                                                        React chain: {selection.reactEnrichment.componentChain.map((component) => component.displayName).join(' -> ')}
                                                    </p>
                                                    {selection.reactEnrichment.sourceAnchor ? (
                                                        <p className='text-muted-foreground'>
                                                            Source: {selection.reactEnrichment.sourceAnchor.displayPath}
                                                            {selection.reactEnrichment.sourceAnchor.line
                                                                ? `:${String(selection.reactEnrichment.sourceAnchor.line)}`
                                                                : ''}
                                                        </p>
                                                    ) : (
                                                        <p className='text-muted-foreground'>Source: component identity only</p>
                                                    )}
                                                </div>
                                            ) : null}
                                        </div>
                                        <div className='flex flex-wrap items-center gap-1 text-[11px]'>
                                            {selection.ancestryTrail.slice(0, 4).map((ancestor, index) => (
                                                <Button
                                                    key={`${selection.id}:${ancestor.selector}`}
                                                    type='button'
                                                    size='sm'
                                                    variant='ghost'
                                                    className='h-7 rounded-full px-2'
                                                    onClick={() => void handleSelectAncestor(selection, index)}>
                                                    {ancestor.tagName.toLowerCase()}
                                                </Button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className='mt-3 flex gap-2'>
                                        <textarea
                                            className='border-border bg-background min-h-20 flex-1 rounded-xl border px-3 py-2 text-sm outline-none'
                                            value={selectionDraftText}
                                            onChange={(event) => {
                                                setSelectionDrafts((current) => ({
                                                    ...current,
                                                    [selection.id]: event.target.value,
                                                }));
                                            }}
                                            placeholder='Add a staged comment for this element…'
                                        />
                                        <Button type='button' size='sm' className='self-start' onClick={() => void handleCreateComment(selection.id)}>
                                            <Plus className='mr-2 h-4 w-4' />
                                            Stage
                                        </Button>
                                    </div>

                                    <div className='mt-3 space-y-2'>
                                        {selectionComments.length === 0 ? (
                                            <p className='text-muted-foreground text-xs'>No staged comments for this selection yet.</p>
                                        ) : (
                                            selectionComments.map((draft, index) => {
                                                const currentCommentText = commentEdits[draft.id] ?? draft.commentText;
                                                return (
                                                    <div key={draft.id} className='rounded-xl border px-3 py-3'>
                                                        <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
                                                            <div className='flex items-center gap-2 text-[11px]'>
                                                                <Button
                                                                    type='button'
                                                                    size='icon'
                                                                    variant='ghost'
                                                                    className='h-7 w-7 rounded-full'
                                                                    onClick={() =>
                                                                        void setInclusionMutation.mutateAsync({
                                                                            profileId,
                                                                            sessionId,
                                                                            draftId: draft.id,
                                                                            inclusionState:
                                                                                draft.inclusionState === 'included'
                                                                                    ? 'excluded'
                                                                                    : 'included',
                                                                        })
                                                                    }>
                                                                    {draft.inclusionState === 'included' ? (
                                                                        <CheckSquare className='h-4 w-4' />
                                                                    ) : (
                                                                        <Square className='h-4 w-4' />
                                                                    )}
                                                                </Button>
                                                                <span className='text-muted-foreground'>
                                                                    {draft.inclusionState === 'included' ? 'Selected for send' : 'Excluded from send'}
                                                                </span>
                                                                {draft.stale ? (
                                                                    <span className='rounded-full border px-2 py-0.5'>Stale</span>
                                                                ) : null}
                                                            </div>
                                                            <div className='flex items-center gap-1'>
                                                                <Button
                                                                    type='button'
                                                                    size='icon'
                                                                    variant='ghost'
                                                                    className='h-7 w-7 rounded-full'
                                                                    disabled={index === 0}
                                                                    onClick={() =>
                                                                        void moveCommentMutation.mutateAsync({
                                                                            profileId,
                                                                            sessionId,
                                                                            draftId: draft.id,
                                                                            direction: 'up',
                                                                        })
                                                                    }>
                                                                    <ArrowLeft className='h-3.5 w-3.5 rotate-90' />
                                                                </Button>
                                                                <Button
                                                                    type='button'
                                                                    size='icon'
                                                                    variant='ghost'
                                                                    className='h-7 w-7 rounded-full'
                                                                    disabled={index === selectionComments.length - 1}
                                                                    onClick={() =>
                                                                        void moveCommentMutation.mutateAsync({
                                                                            profileId,
                                                                            sessionId,
                                                                            draftId: draft.id,
                                                                            direction: 'down',
                                                                        })
                                                                    }>
                                                                    <ArrowRight className='h-3.5 w-3.5 rotate-90' />
                                                                </Button>
                                                                <Button
                                                                    type='button'
                                                                    size='icon'
                                                                    variant='ghost'
                                                                    className='h-7 w-7 rounded-full'
                                                                    onClick={() =>
                                                                        void deleteCommentMutation.mutateAsync({
                                                                            profileId,
                                                                            sessionId,
                                                                            draftId: draft.id,
                                                                        })
                                                                    }>
                                                                    <Trash2 className='h-3.5 w-3.5' />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                        <textarea
                                                            className='border-border bg-background min-h-20 w-full rounded-xl border px-3 py-2 text-sm outline-none'
                                                            value={currentCommentText}
                                                            onChange={(event) => {
                                                                setCommentEdits((current) => ({
                                                                    ...current,
                                                                    [draft.id]: event.target.value,
                                                                }));
                                                            }}
                                                        />
                                                        <div className='mt-2 flex justify-end'>
                                                            <Button type='button' size='sm' variant='outline' onClick={() => void handleSaveComment(draft.id)}>
                                                                Save Comment
                                                            </Button>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>

                                    <div className='mt-4 rounded-2xl border px-3 py-3'>
                                        <div className='mb-3 flex flex-wrap items-start justify-between gap-2'>
                                            <div>
                                                <p className='text-sm font-medium'>Live Designer</p>
                                                <p className='text-muted-foreground text-[11px]'>
                                                    Preview safe style changes in-browser, then carry them through the normal run pipeline.
                                                </p>
                                            </div>
                                            {selectionDesignerDraft ? (
                                                <div className='flex items-center gap-2 text-[11px]'>
                                                    <span className='rounded-full border px-2 py-0.5'>
                                                        {selectionDesignerDraft.applyStatus.replaceAll('_', ' ')}
                                                    </span>
                                                    <Button
                                                        type='button'
                                                        size='icon'
                                                        variant='ghost'
                                                        className='h-7 w-7 rounded-full'
                                                        onClick={() =>
                                                            void setDesignerInclusionMutation.mutateAsync({
                                                                profileId,
                                                                sessionId,
                                                                draftId: selectionDesignerDraft.id,
                                                                inclusionState:
                                                                    selectionDesignerDraft.inclusionState === 'included'
                                                                        ? 'excluded'
                                                                        : 'included',
                                                            })
                                                        }>
                                                        {selectionDesignerDraft.inclusionState === 'included' ? (
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
                                                        value={designerFormState[field.key]}
                                                        onChange={(event) => {
                                                            setDesignerDraftForms((current) => ({
                                                                ...current,
                                                                [selection.id]: {
                                                                    ...designerFormState,
                                                                    [field.key]: event.target.value,
                                                                },
                                                            }));
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
                                                    value={designerFormState.applyMode}
                                                    onChange={(event) => {
                                                        setDesignerDraftForms((current) => ({
                                                            ...current,
                                                            [selection.id]: {
                                                                ...designerFormState,
                                                                applyMode:
                                                                    event.target.value === 'apply_with_agent'
                                                                        ? 'apply_with_agent'
                                                                        : 'preview_only',
                                                            },
                                                        }));
                                                    }}>
                                                    <option value='preview_only'>Preview Only</option>
                                                    <option value='apply_with_agent'>Apply With Agent</option>
                                                </select>
                                            </label>
                                            <label className='text-[11px]'>
                                                <span className='text-muted-foreground mb-1 block'>Text Override</span>
                                                <input
                                                    className='border-border bg-background w-full rounded-xl border px-3 py-2 text-sm'
                                                    value={designerFormState.textContentOverride}
                                                    onChange={(event) => {
                                                        setDesignerDraftForms((current) => ({
                                                            ...current,
                                                            [selection.id]: {
                                                                ...designerFormState,
                                                                textContentOverride: event.target.value,
                                                            },
                                                        }));
                                                    }}
                                                    placeholder='Optional safe text preview'
                                                />
                                            </label>
                                        </div>

                                        {selectionDesignerDraft?.blockedReasonMessage ? (
                                            <p className='text-muted-foreground mt-2 text-[11px]'>{selectionDesignerDraft.blockedReasonMessage}</p>
                                        ) : null}

                                        <div className='mt-3 flex flex-wrap justify-end gap-2'>
                                            {selectionDesignerDraft ? (
                                                <Button
                                                    type='button'
                                                    size='sm'
                                                    variant='ghost'
                                                    onClick={() => void handleDeleteDesignerDraft(selectionDesignerDraft.id, selection.id)}>
                                                    <Trash2 className='mr-2 h-4 w-4' />
                                                    Clear Preview
                                                </Button>
                                            ) : null}
                                            <Button type='button' size='sm' variant='outline' onClick={() => void handlePreviewDesigner(selection.id)}>
                                                Save Preview
                                            </Button>
                                        </div>
                                    </div>
                                </article>
                            );
                        })
                    )}
                </div>

                {feedback ? <p className='text-muted-foreground mt-3 text-xs'>{feedback}</p> : null}
            </div>
        </section>
    );
}
