import { ChevronDown, ChevronRight, GitBranch, Play, Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { SidebarInlineThreadDraft } from '@/web/components/conversation/sidebar/sections/sidebarInlineThreadDraft';

import type { SessionSummaryRecord, ThreadListRecord } from '@/app/backend/persistence/types';
import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';

import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';

interface WorkspaceGroupRow {
    label: string;
    workspaceFingerprint: string;
    absolutePath?: string;
    favoriteCount: number;
    threadCount: number;
    rows: Array<{
        thread: ThreadListRecord;
        depth: number;
    }>;
}

interface SidebarThreadListProps {
    workspaceGroups: WorkspaceGroupRow[];
    playgroundRows: Array<{
        thread: ThreadListRecord;
        depth: number;
    }>;
    sessions: SessionSummaryRecord[];
    selectedWorkspaceFingerprint?: string;
    threadTagIdsByThread: Map<string, string[]>;
    tagLabelById: Map<string, string>;
    selectedThreadId?: string;
    showAllModes: boolean;
    statusMessage?: string;
    statusTone?: 'info' | 'error';
    deferredSearchValue: string;
    onPreviewThread?: (threadId: string) => void;
    onSelectThread: (threadId: string) => void;
    onSelectWorkspaceFingerprint: (workspaceFingerprint: string | undefined) => void;
    onToggleThreadFavorite: (threadId: string, nextFavorite: boolean) => Promise<void>;
    onRequestWorkspaceDelete: (workspaceFingerprint: string, workspaceLabel: string) => void;
    onRequestNewThread: (workspaceFingerprint?: string) => void;
    inlineThreadDraft?: {
        workspaceFingerprint: string;
        title: string;
        topLevelTab: TopLevelTab;
        providerId: RuntimeProviderId | undefined;
        modelId: string;
    };
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
    isCreatingThread: boolean;
    onInlineThreadTitleChange: (title: string) => void;
    onInlineThreadTopLevelTabChange: (topLevelTab: TopLevelTab) => void;
    onInlineThreadProviderChange: (providerId: RuntimeProviderId | undefined) => void;
    onInlineThreadModelChange: (modelId: string) => void;
    onCancelInlineThread: () => void;
    onSubmitInlineThread: () => void;
}

function modeBadgeClass(topLevelTab: TopLevelTab): string {
    if (topLevelTab === 'chat') {
        return 'border-sky-500/30 bg-sky-500/10 text-sky-700';
    }
    if (topLevelTab === 'agent') {
        return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700';
    }
    return 'border-amber-500/30 bg-amber-500/10 text-amber-700';
}

function modeLabel(topLevelTab: TopLevelTab): string {
    if (topLevelTab === 'chat') {
        return 'Chat';
    }
    if (topLevelTab === 'agent') {
        return 'Agent';
    }
    return 'Orchestrator';
}

function summarizeThreadRuns(threadId: string, sessions: SessionSummaryRecord[]): string | undefined {
    const threadSessions = sessions.filter((session) => session.threadId === threadId);
    if (threadSessions.length === 0) {
        return undefined;
    }

    if (threadSessions.some((session) => session.runStatus === 'running')) {
        return 'Running';
    }
    if (threadSessions.some((session) => session.runStatus === 'error')) {
        return 'Needs attention';
    }
    if (threadSessions.some((session) => session.runStatus === 'completed')) {
        return 'Recent runs ready';
    }

    return 'Idle';
}

function getRunStatusTone(runStatus: SessionSummaryRecord['runStatus']): string {
    if (runStatus === 'running') {
        return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700';
    }

    if (runStatus === 'error') {
        return 'border-destructive/30 bg-destructive/10 text-destructive';
    }

    if (runStatus === 'completed') {
        return 'border-sky-500/30 bg-sky-500/10 text-sky-700';
    }

    return 'border-border/70 bg-background/80 text-muted-foreground';
}

function getRunStatusLabel(runStatus: SessionSummaryRecord['runStatus']): string {
    if (runStatus === 'running') {
        return 'Running';
    }

    if (runStatus === 'error') {
        return 'Needs attention';
    }

    if (runStatus === 'completed') {
        return 'Completed';
    }

    return 'Idle';
}

function ThreadRow({
    thread,
    depth,
    sessions,
    threadTagIdsByThread,
    tagLabelById,
    selectedThreadId,
    showAllModes,
    onPreviewThread,
    onSelectThread,
    onToggleThreadFavorite,
}: {
    thread: ThreadListRecord;
    depth: number;
    sessions: SessionSummaryRecord[];
    threadTagIdsByThread: Map<string, string[]>;
    tagLabelById: Map<string, string>;
    selectedThreadId?: string;
    showAllModes: boolean;
    onPreviewThread?: (threadId: string) => void;
    onSelectThread: (threadId: string) => void;
    onToggleThreadFavorite: (threadId: string, nextFavorite: boolean) => Promise<void>;
}) {
    const tagIds = threadTagIdsByThread.get(thread.id) ?? [];
    const runSummary = summarizeThreadRuns(thread.id, sessions);
    const threadSessions = sessions
        .filter((session) => session.threadId === thread.id)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
        .slice(0, 3);

    return (
        <div className='relative'>
            {depth > 0 ? (
                <span
                    aria-hidden
                    className='bg-border absolute top-2 bottom-2 w-px'
                    style={{ left: `${String(depth * 14 - 7)}px` }}
                />
            ) : null}
            <div
                className={`border-border bg-background hover:bg-accent/80 flex items-start gap-2 rounded-3xl border p-3 transition-colors ${
                    selectedThreadId === thread.id ? 'border-primary bg-primary/8 shadow-sm' : ''
                }`}
                style={{ marginLeft: `${String(depth * 14)}px` }}>
                <button
                    type='button'
                    className='focus-visible:ring-ring min-w-0 flex-1 rounded-md text-left focus-visible:ring-2'
                    onMouseEnter={() => {
                        onPreviewThread?.(thread.id);
                    }}
                    onFocus={() => {
                        onPreviewThread?.(thread.id);
                    }}
                    onClick={() => {
                        onSelectThread(thread.id);
                    }}>
                    <div className='flex items-center justify-between gap-2'>
                        <p className='truncate text-sm font-medium'>{thread.title}</p>
                        {showAllModes ? (
                            <span
                                className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${modeBadgeClass(
                                    thread.topLevelTab
                                )}`}>
                                {modeLabel(thread.topLevelTab)}
                            </span>
                        ) : null}
                    </div>
                    <div className='text-muted-foreground mt-2 flex flex-wrap items-center gap-1.5 text-[11px]'>
                        <span className='rounded-full border border-border/70 px-2 py-0.5'>
                            {thread.sessionCount === 1 ? '1 session' : `${String(thread.sessionCount)} sessions`}
                        </span>
                        {runSummary ? (
                            <span className='inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-700'>
                                <Play className='h-3 w-3' />
                                {runSummary}
                            </span>
                        ) : null}
                        {thread.sandboxId ? (
                            <span className='inline-flex items-center gap-1 rounded-full border border-border/70 px-2 py-0.5'>
                                <GitBranch className='h-3 w-3' />
                                Branch-linked
                            </span>
                        ) : null}
                    </div>
                    {tagIds.length > 0 ? (
                        <div className='mt-2 flex flex-wrap gap-1'>
                            {tagIds.map((tagId) => (
                                <span
                                    key={tagId}
                                    className='bg-secondary text-secondary-foreground rounded px-1.5 py-0.5 text-[10px]'>
                                    {tagLabelById.get(tagId) ?? tagId}
                                </span>
                            ))}
                        </div>
                    ) : null}
                    {threadSessions.length > 0 ? (
                        <div className='mt-2 flex flex-wrap gap-1.5'>
                            {threadSessions.map((session) => (
                                <span
                                    key={session.id}
                                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${getRunStatusTone(
                                        session.runStatus
                                    )}`}>
                                    {getRunStatusLabel(session.runStatus)}
                                </span>
                            ))}
                        </div>
                    ) : null}
                </button>
                <button
                    type='button'
                    className={`focus-visible:ring-ring mt-0.5 rounded-md p-1 transition-colors focus-visible:ring-2 ${
                        thread.isFavorite ? 'text-amber-400 hover:text-amber-300' : 'text-muted-foreground hover:text-foreground'
                    }`}
                    aria-label={
                        thread.isFavorite ? `Remove ${thread.title} from favorites` : `Add ${thread.title} to favorites`
                    }
                    onClick={() => {
                        void onToggleThreadFavorite(thread.id, !thread.isFavorite);
                    }}>
                    <Star className={`h-4 w-4 ${thread.isFavorite ? 'fill-current' : ''}`} />
                </button>
            </div>
        </div>
    );
}

export function SidebarThreadList({
    workspaceGroups,
    playgroundRows,
    sessions,
    selectedWorkspaceFingerprint,
    threadTagIdsByThread,
    tagLabelById,
    selectedThreadId,
    showAllModes,
    statusMessage,
    statusTone = 'info',
    deferredSearchValue,
    onPreviewThread,
    onSelectThread,
    onSelectWorkspaceFingerprint,
    onToggleThreadFavorite,
    onRequestWorkspaceDelete,
    onRequestNewThread,
    inlineThreadDraft,
    providers,
    providerModels,
    isCreatingThread,
    onInlineThreadTitleChange,
    onInlineThreadTopLevelTabChange,
    onInlineThreadProviderChange,
    onInlineThreadModelChange,
    onCancelInlineThread,
    onSubmitInlineThread,
}: SidebarThreadListProps) {
    const [collapsedWorkspaceFingerprints, setCollapsedWorkspaceFingerprints] = useState<string[]>([]);

    const toggleWorkspaceCollapsed = (workspaceFingerprint: string) => {
        setCollapsedWorkspaceFingerprints((current) =>
            current.includes(workspaceFingerprint)
                ? current.filter((value) => value !== workspaceFingerprint)
                : [...current, workspaceFingerprint]
        );
    };

    const hasAnyThreads = workspaceGroups.some((group) => group.rows.length > 0) || playgroundRows.length > 0;

    return (
        <div className='min-h-0 flex-1 overflow-y-auto p-3'>
            {!hasAnyThreads ? (
                <div className='text-muted-foreground flex h-full min-h-48 items-center justify-center rounded-3xl border border-dashed border-border/70 bg-background/30 px-6 text-center text-sm'>
                    {statusMessage && statusTone !== 'error'
                        ? 'The sessions tree is still loading. The center workspace is ready to use.'
                        : statusTone === 'error'
                          ? 'Session navigation could not be loaded yet. Keep working in the current shell.'
                          : deferredSearchValue.length > 0
                            ? 'No threads match that search yet.'
                            : 'No workspaces or threads are available yet.'}
                </div>
            ) : null}

            {workspaceGroups.map((group) => {
                const isCollapsed = collapsedWorkspaceFingerprints.includes(group.workspaceFingerprint);
                const isSelectedWorkspace = selectedWorkspaceFingerprint === group.workspaceFingerprint;
                return (
                    <section key={group.workspaceFingerprint} className='mb-4 space-y-2'>
                        <div
                            className={`rounded-[26px] border p-3 ${
                                isSelectedWorkspace
                                    ? 'border-primary/40 bg-primary/6'
                                    : 'border-border bg-card/60'
                            }`}>
                            <div className='flex items-start justify-between gap-3'>
                                <div className='min-w-0 flex-1'>
                                    <div className='flex items-start gap-2'>
                                        <button
                                            type='button'
                                            className='border-border bg-background/70 hover:bg-accent inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border'
                                            aria-label={isCollapsed ? `Expand ${group.label}` : `Collapse ${group.label}`}
                                            onClick={() => {
                                                toggleWorkspaceCollapsed(group.workspaceFingerprint);
                                            }}>
                                            {isCollapsed ? <ChevronRight className='h-4 w-4' /> : <ChevronDown className='h-4 w-4' />}
                                        </button>
                                        <button
                                            type='button'
                                            className='min-w-0 flex-1 rounded-xl px-1 py-0.5 text-left transition-colors hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
                                            onClick={() => {
                                                onSelectWorkspaceFingerprint(group.workspaceFingerprint);
                                            }}>
                                            <div className='min-w-0'>
                                                <p className='truncate text-sm font-semibold'>{group.label}</p>
                                                {group.absolutePath ? (
                                                    <p className='text-muted-foreground truncate text-xs'>{group.absolutePath}</p>
                                                ) : null}
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                <div className='flex items-center gap-1'>
                                    <button
                                        type='button'
                                        className='hover:bg-accent focus-visible:ring-ring rounded-md px-2 py-1 text-[11px] font-semibold transition-colors focus-visible:ring-2'
                                        aria-label={`Create a thread in ${group.label}`}
                                        onClick={() => {
                                            onRequestNewThread(group.workspaceFingerprint);
                                        }}>
                                        <span className='inline-flex items-center gap-1'>
                                            <Plus className='h-3.5 w-3.5' />
                                            New thread
                                        </span>
                                    </button>
                                    <button
                                        type='button'
                                        className='hover:bg-destructive/10 hover:text-destructive focus-visible:ring-ring rounded-md p-1 transition-colors focus-visible:ring-2'
                                        aria-label={`Clear threads for ${group.label}`}
                                        onClick={() => {
                                            onRequestWorkspaceDelete(group.workspaceFingerprint, group.label);
                                        }}>
                                        <Trash2 className='h-3.5 w-3.5' />
                                    </button>
                                </div>
                            </div>

                            <div className='text-muted-foreground mt-3 flex flex-wrap gap-1.5 text-[11px]'>
                                <span className='rounded-full border border-border/70 px-2 py-0.5'>
                                    {group.threadCount === 1 ? '1 thread' : `${String(group.threadCount)} threads`}
                                </span>
                                {group.favoriteCount > 0 ? (
                                    <span className='rounded-full border border-border/70 px-2 py-0.5'>
                                        {group.favoriteCount === 1 ? '1 favorite' : `${String(group.favoriteCount)} favorites`}
                                    </span>
                                ) : null}
                            </div>
                        </div>

                        {!isCollapsed ? (
                            <div className='space-y-2 pl-3'>
                                {inlineThreadDraft?.workspaceFingerprint === group.workspaceFingerprint ? (
                                    <SidebarInlineThreadDraft
                                        workspaceLabel={group.label}
                                        title={inlineThreadDraft.title}
                                        topLevelTab={inlineThreadDraft.topLevelTab}
                                        providerId={inlineThreadDraft.providerId}
                                        modelId={inlineThreadDraft.modelId}
                                        providers={providers}
                                        providerModels={providerModels}
                                        busy={isCreatingThread}
                                        onTitleChange={onInlineThreadTitleChange}
                                        onTopLevelTabChange={onInlineThreadTopLevelTabChange}
                                        onProviderChange={onInlineThreadProviderChange}
                                        onModelChange={onInlineThreadModelChange}
                                        onCancel={onCancelInlineThread}
                                        onSubmit={onSubmitInlineThread}
                                    />
                                ) : null}
                                {group.rows.map(({ thread, depth }) => (
                                    <ThreadRow
                                        key={thread.id}
                                        thread={thread}
                                        depth={depth}
                                        sessions={sessions}
                                        threadTagIdsByThread={threadTagIdsByThread}
                                        tagLabelById={tagLabelById}
                                        {...(selectedThreadId ? { selectedThreadId } : {})}
                                        showAllModes={showAllModes}
                                        {...(onPreviewThread ? { onPreviewThread } : {})}
                                        onSelectThread={onSelectThread}
                                        onToggleThreadFavorite={onToggleThreadFavorite}
                                    />
                                ))}
                            </div>
                        ) : null}
                    </section>
                );
            })}

            {playgroundRows.length > 0 ? (
                <section className='mb-4 space-y-2'>
                    <div className='border-border bg-card/60 rounded-[26px] border p-3'>
                        <div>
                            <p className='text-sm font-semibold'>Playground</p>
                            <p className='text-muted-foreground text-xs'>Detached threads that are not tied to a workspace.</p>
                        </div>
                    </div>

                    <div className='space-y-2 pl-3'>
                        {playgroundRows.map(({ thread, depth }) => (
                            <ThreadRow
                                key={thread.id}
                                thread={thread}
                                depth={depth}
                                sessions={sessions}
                                threadTagIdsByThread={threadTagIdsByThread}
                                tagLabelById={tagLabelById}
                                {...(selectedThreadId ? { selectedThreadId } : {})}
                                showAllModes={showAllModes}
                                {...(onPreviewThread ? { onPreviewThread } : {})}
                                onSelectThread={onSelectThread}
                                onToggleThreadFavorite={onToggleThreadFavorite}
                            />
                        ))}
                    </div>
                </section>
            ) : null}
        </div>
    );
}
