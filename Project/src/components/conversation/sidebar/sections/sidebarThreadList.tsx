import { Star, Trash2 } from 'lucide-react';

import type { ThreadListRecord } from '@/app/backend/persistence/types';

import type { TopLevelTab } from '@/shared/contracts';

interface SidebarThreadGroup {
    label: string;
    workspaceFingerprint?: string;
    rows: Array<{
        thread: ThreadListRecord;
        depth: number;
    }>;
}

interface SidebarThreadListProps {
    groupedThreadRows: SidebarThreadGroup[];
    threadTagIdsByThread: Map<string, string[]>;
    tagLabelById: Map<string, string>;
    selectedThreadId?: string;
    showAllModes: boolean;
    groupView: 'workspace' | 'branch';
    statusMessage?: string;
    statusTone?: 'info' | 'error';
    deferredSearchValue: string;
    onPreviewThread?: (threadId: string) => void;
    onSelectThread: (threadId: string) => void;
    onToggleThreadFavorite: (threadId: string, nextFavorite: boolean) => Promise<void>;
    onRequestWorkspaceDelete: (workspaceFingerprint: string, workspaceLabel: string) => void;
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

export function SidebarThreadList({
    groupedThreadRows,
    threadTagIdsByThread,
    tagLabelById,
    selectedThreadId,
    showAllModes,
    groupView,
    statusMessage,
    statusTone = 'info',
    deferredSearchValue,
    onPreviewThread,
    onSelectThread,
    onToggleThreadFavorite,
    onRequestWorkspaceDelete,
}: SidebarThreadListProps) {
    return (
        <div className='min-h-0 flex-1 overflow-y-auto p-3'>
            {groupedThreadRows.length === 0 ? (
                <div className='text-muted-foreground flex h-full min-h-48 items-center justify-center rounded-3xl border border-dashed border-border/70 bg-background/30 px-6 text-center text-sm'>
                    {statusMessage && statusTone !== 'error'
                        ? 'The rail is still loading. The center workspace is ready to use.'
                        : statusTone === 'error'
                          ? 'Conversation lists could not be loaded yet. Keep working in the current shell.'
                          : deferredSearchValue.length > 0
                            ? 'No threads match that search yet.'
                            : 'No conversations are available yet.'}
                </div>
            ) : null}
            {groupedThreadRows.map((group) => {
                const workspaceFingerprint = group.workspaceFingerprint;

                return (
                    <section key={group.label} className='mb-4'>
                        <div className='text-muted-foreground flex items-center justify-between gap-2 px-1 pb-1'>
                            <p className='min-w-0 truncate text-[11px] font-semibold tracking-wide uppercase'>
                                {group.label}
                            </p>
                            {workspaceFingerprint ? (
                                <button
                                    type='button'
                                    className='hover:bg-destructive/10 hover:text-destructive focus-visible:ring-ring rounded-md p-1 transition-colors focus-visible:ring-2'
                                    aria-label={`Clear threads for ${group.label}`}
                                    onClick={() => {
                                        onRequestWorkspaceDelete(workspaceFingerprint, group.label);
                                    }}>
                                    <Trash2 className='h-3.5 w-3.5' />
                                </button>
                            ) : null}
                        </div>
                        <div className='space-y-2'>
                            {group.rows.map(({ thread, depth }) => {
                                const tagIds = threadTagIdsByThread.get(thread.id) ?? [];
                                return (
                                    <div key={thread.id} className='relative'>
                                        {groupView === 'branch' && depth > 0 ? (
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
                                            style={{ paddingLeft: `${String(depth * 14 + 10)}px` }}>
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
                                                <p className='text-muted-foreground mt-1 text-xs leading-5'>
                                                    {thread.anchorKind === 'workspace'
                                                        ? thread.topLevelTab === 'chat'
                                                            ? 'Workspace conversation'
                                                            : thread.worktreeId
                                                              ? 'Managed worktree execution'
                                                              : thread.executionEnvironmentMode === 'new_worktree'
                                                                ? 'Queued worktree execution'
                                                                : 'Local workspace execution'
                                                        : 'Playground conversation'}
                                                </p>
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
                                            </button>
                                            <button
                                                type='button'
                                                className={`focus-visible:ring-ring mt-0.5 rounded-md p-1 transition-colors focus-visible:ring-2 ${
                                                    thread.isFavorite
                                                        ? 'text-amber-400 hover:text-amber-300'
                                                        : 'text-muted-foreground hover:text-foreground'
                                                }`}
                                                aria-label={
                                                    thread.isFavorite
                                                        ? `Remove ${thread.title} from favorites`
                                                        : `Add ${thread.title} to favorites`
                                                }
                                                onClick={() => {
                                                    void onToggleThreadFavorite(thread.id, !thread.isFavorite);
                                                }}>
                                                <Star className={`h-4 w-4 ${thread.isFavorite ? 'fill-current' : ''}`} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                );
            })}
        </div>
    );
}
