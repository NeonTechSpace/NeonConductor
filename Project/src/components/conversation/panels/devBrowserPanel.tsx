import { ArrowLeft, ArrowRight, CheckSquare, Plus, Send, Square, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { DevBrowserDesignerSection } from '@/web/components/conversation/panels/devBrowserDesignerSection';
import {
    buildDesignerDraftFormState,
    buildSessionScopedInput,
    describeValidationStatus,
    summarizeSelection,
    toDesignerStylePatchPayload,
    type DesignerDraftFormState,
    type DevBrowserPanelProps,
} from '@/web/components/conversation/panels/devBrowserPanelModel';
import { DevBrowserTargetSection } from '@/web/components/conversation/panels/devBrowserTargetSection';
import { Button } from '@/web/components/ui/button';
import { createFailClosedAsyncAction } from '@/web/lib/async/createFailClosedAsyncAction';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { BrowserCommentDraft, BrowserDesignerDraft, BrowserSelectionRecord, EntityId } from '@/shared/contracts';

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
    }, [
        browserState?.target?.scheme,
        browserState?.target?.host,
        browserState?.target?.port,
        browserState?.target?.path,
    ]);

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

    async function handleBuildPacketAndSend(input: { scope: 'included' | 'all'; action: 'submit' | 'queue' }) {
        if (!sessionId) {
            return;
        }
        const allDraftIds =
            input.scope === 'all' ? (browserState?.commentDrafts ?? []).map((draft) => draft.id) : undefined;
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
        const formState =
            designerDraftForms[selectionId] ??
            buildDesignerDraftFormState(designerDraftsBySelectionId.get(selectionId));
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
            const next: typeof current = {};
            for (const [key, value] of Object.entries(current)) {
                if (key !== selectionId) {
                    next[key] = value;
                }
            }
            return next;
        });
        await invalidateBrowserQueries();
        setFeedback(undefined);
    }

    function handleDesignerFormChange(selectionId: EntityId<'bsel'>, formState: DesignerDraftFormState) {
        setDesignerDraftForms((current) => ({
            ...current,
            [selectionId]: formState,
        }));
    }

    async function handleToggleDesignerInclusion(draft: BrowserDesignerDraft) {
        if (!sessionId) {
            return;
        }
        await setDesignerInclusionMutation.mutateAsync({
            profileId,
            sessionId,
            draftId: draft.id,
            inclusionState: draft.inclusionState === 'included' ? 'excluded' : 'included',
        });
    }

    function runDevBrowserAction(action: () => Promise<void>): void {
        void createFailClosedAsyncAction(action, (error) => {
            setFeedback(error instanceof Error ? error.message : 'Dev browser action failed.');
        })();
    }

    const target = browserState?.target;
    const includedBrowserSummary =
        includedPacketQuery.data?.available === true ? includedPacketQuery.data.summary : browserState?.summary;
    const canSendIncluded = includedPacketQuery.data?.available === true;
    const hasAnyDraftContext =
        (browserState?.commentDrafts.length ?? 0) > 0 || (browserState?.designerDrafts.length ?? 0) > 0;
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
            <DevBrowserTargetSection
                statusLabel={statusLabel}
                selectionCount={selectionCount}
                commentDraftCount={browserState?.commentDrafts.length ?? 0}
                designerDraftCount={browserState?.designerDrafts.length ?? 0}
                scheme={scheme}
                host={host}
                port={port}
                path={path}
                pickerActive={browserState?.pickerActive ?? false}
                staleContextCount={staleContextCount}
                visible={visible}
                target={target}
                mountRef={mountRef}
                onSchemeChange={setScheme}
                onHostChange={setHost}
                onPortChange={setPort}
                onPathChange={setPath}
                onApplyTarget={() => {
                    runDevBrowserAction(handleApplyTarget);
                }}
                onControl={(action) => {
                    runDevBrowserAction(() => handleControl(action));
                }}
                onTogglePicker={() => {
                    runDevBrowserAction(handleTogglePicker);
                }}
                onClearStale={() => {
                    runDevBrowserAction(async () => {
                        await clearStaleMutation.mutateAsync({ profileId, sessionId });
                    });
                }}
            />

            <div className='border-border/70 bg-card/20 min-h-0 flex-1 rounded-[26px] border px-4 py-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)]'>
                <div className='mb-3 flex flex-wrap items-start justify-between gap-3'>
                    <div>
                        <h4 className='text-sm font-semibold'>Staged Browser Comments</h4>
                        <p className='text-muted-foreground text-xs'>
                            Keep comments reviewable, choose what to send, and queue browser packets through the normal
                            run path.
                        </p>
                    </div>
                    <div className='flex flex-wrap items-center gap-2'>
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={!canSendIncluded}
                            onClick={() => {
                                runDevBrowserAction(() =>
                                    handleBuildPacketAndSend({ scope: 'included', action: 'submit' })
                                );
                            }}>
                            <Send className='mr-2 h-4 w-4' />
                            Send Selected
                        </Button>
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={!onQueuePrompt || !canSendIncluded}
                            onClick={() => {
                                runDevBrowserAction(() =>
                                    handleBuildPacketAndSend({ scope: 'included', action: 'queue' })
                                );
                            }}>
                            Queue Selected
                        </Button>
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={!hasAnyDraftContext}
                            onClick={() => {
                                runDevBrowserAction(() => handleBuildPacketAndSend({ scope: 'all', action: 'submit' }));
                            }}>
                            Send All
                        </Button>
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={!onQueuePrompt || !hasAnyDraftContext}
                            onClick={() => {
                                runDevBrowserAction(() => handleBuildPacketAndSend({ scope: 'all', action: 'queue' }));
                            }}>
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
                                {includedBrowserSummary.designerDraftCount} draft
                                {includedBrowserSummary.designerDraftCount === 1 ? '' : 's'}
                            </p>
                        </div>
                        <div className='rounded-xl border px-3 py-2'>
                            <p className='text-muted-foreground'>Apply Intent</p>
                            <p className='font-medium'>
                                {includedBrowserSummary.designerApplyIntentStatus.replaceAll('_', ' ')}
                            </p>
                        </div>
                    </div>
                ) : null}

                <div className='space-y-3 overflow-y-auto pr-1'>
                    {(browserState?.selections ?? []).length === 0 ? (
                        <div className='text-muted-foreground rounded-2xl border border-dashed px-4 py-5 text-sm'>
                            Turn on the picker, click an element in the dev browser, and it will appear here as a staged
                            selection snapshot.
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
                                                <p className='truncate text-sm font-medium'>
                                                    {summarizeSelection(selection)}
                                                </p>
                                                {selection.stale ? (
                                                    <span className='rounded-full border px-2 py-0.5 text-[11px]'>
                                                        Stale
                                                    </span>
                                                ) : null}
                                                <span className='text-muted-foreground rounded-full border px-2 py-0.5 text-[11px]'>
                                                    {selection.enrichmentMode}
                                                </span>
                                            </div>
                                            <p className='text-muted-foreground text-xs'>
                                                {selection.selector.primary}
                                            </p>
                                            {selection.accessibleRole || selection.accessibleLabel ? (
                                                <p className='text-muted-foreground mt-1 text-[11px]'>
                                                    {[selection.accessibleRole, selection.accessibleLabel]
                                                        .filter(Boolean)
                                                        .join(' · ')}
                                                </p>
                                            ) : null}
                                            {selection.textExcerpt ? (
                                                <p className='text-muted-foreground mt-1 text-[11px]'>
                                                    {selection.textExcerpt}
                                                </p>
                                            ) : null}
                                            {selection.reactEnrichment ? (
                                                <div className='mt-2 space-y-1 text-[11px]'>
                                                    <p className='text-muted-foreground'>
                                                        React chain:{' '}
                                                        {selection.reactEnrichment.componentChain
                                                            .map((component) => component.displayName)
                                                            .join(' -> ')}
                                                    </p>
                                                    {selection.reactEnrichment.sourceAnchor ? (
                                                        <p className='text-muted-foreground'>
                                                            Source: {selection.reactEnrichment.sourceAnchor.displayPath}
                                                            {selection.reactEnrichment.sourceAnchor.line
                                                                ? `:${String(selection.reactEnrichment.sourceAnchor.line)}`
                                                                : ''}
                                                        </p>
                                                    ) : (
                                                        <p className='text-muted-foreground'>
                                                            Source: component identity only
                                                        </p>
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
                                                    onClick={() => {
                                                        runDevBrowserAction(() =>
                                                            handleSelectAncestor(selection, index)
                                                        );
                                                    }}>
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
                                        <Button
                                            type='button'
                                            size='sm'
                                            className='self-start'
                                            onClick={() => {
                                                runDevBrowserAction(() => handleCreateComment(selection.id));
                                            }}>
                                            <Plus className='mr-2 h-4 w-4' />
                                            Stage
                                        </Button>
                                    </div>

                                    <div className='mt-3 space-y-2'>
                                        {selectionComments.length === 0 ? (
                                            <p className='text-muted-foreground text-xs'>
                                                No staged comments for this selection yet.
                                            </p>
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
                                                                    onClick={() => {
                                                                        runDevBrowserAction(async () => {
                                                                            await setInclusionMutation.mutateAsync({
                                                                                profileId,
                                                                                sessionId,
                                                                                draftId: draft.id,
                                                                                inclusionState:
                                                                                    draft.inclusionState === 'included'
                                                                                        ? 'excluded'
                                                                                        : 'included',
                                                                            });
                                                                        });
                                                                    }}>
                                                                    {draft.inclusionState === 'included' ? (
                                                                        <CheckSquare className='h-4 w-4' />
                                                                    ) : (
                                                                        <Square className='h-4 w-4' />
                                                                    )}
                                                                </Button>
                                                                <span className='text-muted-foreground'>
                                                                    {draft.inclusionState === 'included'
                                                                        ? 'Selected for send'
                                                                        : 'Excluded from send'}
                                                                </span>
                                                                {draft.stale ? (
                                                                    <span className='rounded-full border px-2 py-0.5'>
                                                                        Stale
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                            <div className='flex items-center gap-1'>
                                                                <Button
                                                                    type='button'
                                                                    size='icon'
                                                                    variant='ghost'
                                                                    className='h-7 w-7 rounded-full'
                                                                    disabled={index === 0}
                                                                    onClick={() => {
                                                                        runDevBrowserAction(async () => {
                                                                            await moveCommentMutation.mutateAsync({
                                                                                profileId,
                                                                                sessionId,
                                                                                draftId: draft.id,
                                                                                direction: 'up',
                                                                            });
                                                                        });
                                                                    }}>
                                                                    <ArrowLeft className='h-3.5 w-3.5 rotate-90' />
                                                                </Button>
                                                                <Button
                                                                    type='button'
                                                                    size='icon'
                                                                    variant='ghost'
                                                                    className='h-7 w-7 rounded-full'
                                                                    disabled={index === selectionComments.length - 1}
                                                                    onClick={() => {
                                                                        runDevBrowserAction(async () => {
                                                                            await moveCommentMutation.mutateAsync({
                                                                                profileId,
                                                                                sessionId,
                                                                                draftId: draft.id,
                                                                                direction: 'down',
                                                                            });
                                                                        });
                                                                    }}>
                                                                    <ArrowRight className='h-3.5 w-3.5 rotate-90' />
                                                                </Button>
                                                                <Button
                                                                    type='button'
                                                                    size='icon'
                                                                    variant='ghost'
                                                                    className='h-7 w-7 rounded-full'
                                                                    onClick={() => {
                                                                        runDevBrowserAction(async () => {
                                                                            await deleteCommentMutation.mutateAsync({
                                                                                profileId,
                                                                                sessionId,
                                                                                draftId: draft.id,
                                                                            });
                                                                        });
                                                                    }}>
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
                                                            <Button
                                                                type='button'
                                                                size='sm'
                                                                variant='outline'
                                                                onClick={() => {
                                                                    runDevBrowserAction(() =>
                                                                        handleSaveComment(draft.id)
                                                                    );
                                                                }}>
                                                                Save Comment
                                                            </Button>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>

                                    <DevBrowserDesignerSection
                                        selection={selection}
                                        {...(selectionDesignerDraft ? { designerDraft: selectionDesignerDraft } : {})}
                                        formState={designerFormState}
                                        onFormChange={handleDesignerFormChange}
                                        onPreview={handlePreviewDesigner}
                                        onDelete={handleDeleteDesignerDraft}
                                        onToggleInclusion={handleToggleDesignerInclusion}
                                    />
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
