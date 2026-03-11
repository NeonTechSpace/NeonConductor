import { Star, Trash2 } from 'lucide-react';

import { useConversationSidebarState } from '@/web/components/conversation/hooks/useConversationSidebarState';
import { buildConversationSidebarModel } from '@/web/components/conversation/sidebar/sidebarModel';
import { Button } from '@/web/components/ui/button';

import type { ConversationRecord, TagRecord, ThreadListRecord } from '@/app/backend/persistence/types';

import type { TopLevelTab } from '@/shared/contracts';

interface CreateThreadInput {
    scope: 'detached' | 'workspace';
    workspacePath?: string;
    title: string;
}

interface ConversationSidebarProps {
    buckets: ConversationRecord[];
    threads: ThreadListRecord[];
    tags: TagRecord[];
    threadTagIdsByThread: Map<string, string[]>;
    topLevelTab: TopLevelTab;
    selectedThreadId?: string;
    selectedTagIds: string[];
    scopeFilter: 'all' | 'workspace' | 'detached';
    workspaceFilter?: string;
    sort: 'latest' | 'alphabetical';
    showAllModes: boolean;
    groupView: 'workspace' | 'branch';
    isCreatingThread: boolean;
    isAddingTag: boolean;
    feedbackMessage?: string;
    statusMessage?: string;
    statusTone?: 'info' | 'error';
    onSelectThread: (threadId: string) => void;
    onPreviewThread?: (threadId: string) => void;
    onToggleTagFilter: (tagId: string) => void;
    onToggleThreadFavorite: (threadId: string, nextFavorite: boolean) => void;
    onRequestWorkspaceDelete: (workspaceFingerprint: string, workspaceLabel: string) => void;
    onScopeFilterChange: (scope: 'all' | 'workspace' | 'detached') => void;
    onWorkspaceFilterChange: (workspaceFingerprint?: string) => void;
    onSortChange: (sort: 'latest' | 'alphabetical') => void;
    onShowAllModesChange: (showAllModes: boolean) => void;
    onGroupViewChange: (groupView: 'workspace' | 'branch') => void;
    onCreateThread: (input: CreateThreadInput) => Promise<void>;
    onAddTagToThread: (threadId: string, label: string) => Promise<void>;
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

export function ConversationSidebar({
    buckets,
    threads,
    tags,
    threadTagIdsByThread,
    topLevelTab,
    selectedThreadId,
    selectedTagIds,
    scopeFilter,
    workspaceFilter,
    sort,
    showAllModes,
    groupView,
    isCreatingThread,
    isAddingTag,
    feedbackMessage,
    statusMessage,
    statusTone = 'info',
    onSelectThread,
    onPreviewThread,
    onToggleTagFilter,
    onToggleThreadFavorite,
    onRequestWorkspaceDelete,
    onScopeFilterChange,
    onWorkspaceFilterChange,
    onSortChange,
    onShowAllModesChange,
    onGroupViewChange,
    onCreateThread,
    onAddTagToThread,
}: ConversationSidebarProps) {
    const {
        newThreadTitle,
        setNewThreadTitle,
        newThreadScope,
        setNewThreadScope,
        newThreadWorkspace,
        setNewThreadWorkspace,
        newTagLabel,
        setNewTagLabel,
        createThread,
        addTagToThread,
    } = useConversationSidebarState({
        topLevelTab,
        isCreatingThread,
        isAddingTag,
        onCreateThread,
        onAddTagToThread,
    });

    const { workspaceOptions, tagLabelById, selectedThread, groupedThreadRows } = buildConversationSidebarModel({
        buckets,
        threads,
        tags,
        groupView,
        ...(selectedThreadId ? { selectedThreadId } : {}),
    });

    return (
        <aside className='border-border/70 bg-card/40 flex min-h-0 w-[304px] flex-col border-r xl:w-[320px]'>
            <div className='border-border/70 space-y-4 border-b p-4'>
                <div className='space-y-1'>
                    <p className='text-sm font-semibold'>Threads</p>
                    <p className='text-muted-foreground text-xs'>
                        Keep the active conversation list focused, then branch or filter only when needed.
                    </p>
                </div>
                {feedbackMessage ? (
                    <div aria-live='polite' className='rounded-2xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive'>
                        {feedbackMessage}
                    </div>
                ) : null}
                {statusMessage ? (
                    <div
                        aria-live='polite'
                        className={`rounded-2xl px-3 py-2 text-xs ${
                            statusTone === 'error'
                                ? 'border border-destructive/20 bg-destructive/10 text-destructive'
                                : 'border border-border/70 bg-background/80 text-muted-foreground'
                        }`}>
                        {statusMessage}
                    </div>
                ) : null}
                <div className='grid grid-cols-2 gap-2'>
                    <Button
                        type='button'
                        size='sm'
                        variant={scopeFilter === 'all' ? 'secondary' : 'outline'}
                        onClick={() => {
                            onScopeFilterChange('all');
                        }}>
                        All
                    </Button>
                    <Button
                        type='button'
                        size='sm'
                        variant={scopeFilter === 'workspace' ? 'secondary' : 'outline'}
                        onClick={() => {
                            onScopeFilterChange('workspace');
                        }}>
                        Workspace
                    </Button>
                    <Button
                        type='button'
                        size='sm'
                        variant={scopeFilter === 'detached' ? 'secondary' : 'outline'}
                        onClick={() => {
                            onScopeFilterChange('detached');
                        }}>
                        Playground
                    </Button>
                    <select
                        aria-label='Sort threads'
                        className='border-border bg-background h-9 rounded-xl border px-3 text-sm'
                        value={sort}
                        onChange={(event) => {
                            onSortChange(event.target.value === 'alphabetical' ? 'alphabetical' : 'latest');
                        }}>
                        <option value='latest'>Latest</option>
                        <option value='alphabetical'>Alphabetical</option>
                    </select>
                </div>

                <div className='grid grid-cols-2 gap-2'>
                    <Button
                        type='button'
                        size='sm'
                        variant={showAllModes ? 'secondary' : 'outline'}
                        onClick={() => {
                            onShowAllModesChange(!showAllModes);
                        }}>
                        {showAllModes ? 'Including Other Tabs' : 'Current Tab Only'}
                    </Button>
                    <select
                        aria-label='Conversation grouping'
                        className='border-border bg-background h-9 rounded-xl border px-3 text-sm'
                        value={groupView}
                        onChange={(event) => {
                            onGroupViewChange(event.target.value === 'branch' ? 'branch' : 'workspace');
                        }}>
                        <option value='workspace'>Workspace View</option>
                        <option value='branch'>Conversation Branches</option>
                    </select>
                </div>
                <p className='text-muted-foreground text-[11px] leading-5'>
                    Branch view shows lineage. Workspace execution details stay in the main workspace surface.
                </p>

                {scopeFilter === 'workspace' || workspaceFilter ? (
                    <select
                        className='border-border bg-background h-9 w-full rounded-xl border px-3 text-sm'
                        value={workspaceFilter ?? ''}
                        onChange={(event) => {
                            onWorkspaceFilterChange(event.target.value || undefined);
                        }}>
                        <option value=''>All workspaces</option>
                        {workspaceOptions.map((workspace) => (
                            <option key={workspace} value={workspace}>
                                {workspace}
                            </option>
                        ))}
                    </select>
                ) : null}

                <div className='space-y-2 rounded-2xl border border-border/70 bg-background/70 p-3'>
                    <p className='text-[11px] font-semibold tracking-[0.12em] uppercase'>New Thread</p>
                    <input
                        aria-label='Thread title'
                        name='newThreadTitle'
                        value={newThreadTitle}
                        onChange={(event) => {
                            setNewThreadTitle(event.target.value);
                        }}
                        className='border-border bg-card h-9 w-full rounded-xl border px-3 text-sm'
                        autoComplete='off'
                        placeholder='Optional thread title…'
                    />
                    <div className='grid grid-cols-2 gap-2'>
                        <select
                            aria-label='Thread scope'
                            className='border-border bg-card h-9 rounded-xl border px-3 text-sm'
                            value={newThreadScope}
                            onChange={(event) => {
                                setNewThreadScope(event.target.value === 'workspace' ? 'workspace' : 'detached');
                            }}>
                            <option value='detached'>Playground</option>
                            <option value='workspace'>Workspace</option>
                        </select>
                        <Button
                            type='button'
                            size='sm'
                            disabled={isCreatingThread || (newThreadScope === 'detached' && topLevelTab !== 'chat')}
                            onClick={() => {
                                void createThread();
                            }}>
                            New Thread
                        </Button>
                    </div>
                    {newThreadScope === 'workspace' ? (
                        <input
                            aria-label='Workspace path'
                            name='newThreadWorkspace'
                            value={newThreadWorkspace}
                            onChange={(event) => {
                                setNewThreadWorkspace(event.target.value);
                            }}
                            className='border-border bg-card h-9 w-full rounded-xl border px-3 text-sm'
                            autoComplete='off'
                            placeholder='Workspace path…'
                        />
                    ) : null}
                    {newThreadScope === 'detached' && topLevelTab !== 'chat' ? (
                        <p className='text-muted-foreground text-xs'>Playground is chat-only.</p>
                    ) : null}
                </div>
            </div>

            <div className='border-border/70 space-y-2 border-b p-4'>
                <p className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>Tag Filter</p>
                <div className='flex flex-wrap gap-1.5'>
                    {tags.map((tag) => (
                        <button
                            key={tag.id}
                            type='button'
                            className={`focus-visible:ring-ring rounded-md border px-2 py-1 text-xs focus-visible:ring-2 ${
                                selectedTagIds.includes(tag.id)
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'border-border bg-background text-foreground'
                            }`}
                            onClick={() => {
                                onToggleTagFilter(tag.id);
                            }}>
                            {tag.label}
                        </button>
                    ))}
                </div>
                {selectedThread ? (
                    <div className='flex items-center gap-2'>
                        <input
                            aria-label='Add tag to selected thread'
                            name='newThreadTag'
                            value={newTagLabel}
                            onChange={(event) => {
                                setNewTagLabel(event.target.value);
                            }}
                            className='border-border bg-background h-8 min-w-0 flex-1 rounded-xl border px-3 text-xs'
                            autoComplete='off'
                            placeholder='Add tag to the selected thread…'
                        />
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={isAddingTag}
                            onClick={() => {
                                void addTagToThread(selectedThread.id);
                            }}>
                            Add
                        </Button>
                    </div>
                ) : null}
            </div>

            <div className='min-h-0 flex-1 overflow-y-auto p-3'>
                {groupedThreadRows.length === 0 ? (
                    <div className='text-muted-foreground flex h-full min-h-48 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-background/30 px-6 text-center text-sm'>
                        {statusMessage && statusTone !== 'error'
                            ? 'The sidebar is still loading. The workspace is ready to use.'
                            : statusTone === 'error'
                              ? 'Conversation lists could not be loaded yet. Retry or keep working in the current shell.'
                              : 'No conversations are available yet.'}
                    </div>
                ) : null}
                {groupedThreadRows.map((group) => {
                    const workspaceFingerprint = group.workspaceFingerprint;

                    return (
                        <section key={group.label} className='mb-3'>
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
                            <div className='space-y-1'>
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
                                                className={`border-border bg-background hover:bg-accent flex items-start gap-2 rounded-2xl border p-3 ${
                                                    selectedThreadId === thread.id
                                                        ? 'border-primary bg-primary/10'
                                                        : ''
                                                }`}
                                                style={{ paddingLeft: `${String(depth * 14 + 8)}px` }}>
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
                                                    <p className='text-muted-foreground mt-0.5 text-xs'>
                                                        {thread.anchorKind === 'workspace'
                                                            ? `${thread.topLevelTab === 'chat' ? 'workspace conversation branch' : thread.worktreeId ? 'managed worktree execution' : thread.executionEnvironmentMode === 'new_worktree' ? 'queued worktree execution' : 'local workspace execution'} · ${thread.anchorId ?? 'unknown'}`
                                                            : 'playground conversation branch'}
                                                    </p>
                                                    {tagIds.length > 0 ? (
                                                        <div className='mt-1 flex flex-wrap gap-1'>
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
                                                        onToggleThreadFavorite(thread.id, !thread.isFavorite);
                                                    }}>
                                                    <Star
                                                        className={`h-4 w-4 ${thread.isFavorite ? 'fill-current' : ''}`}
                                                    />
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
        </aside>
    );
}

