import { useMemo, useState } from 'react';

import { Button } from '@/web/components/ui/button';

import type { ConversationRecord, TagRecord, ThreadListRecord } from '@/app/backend/persistence/types';
import type { TopLevelTab } from '@/app/backend/runtime/contracts';

interface CreateThreadInput {
    scope: 'detached' | 'workspace';
    workspaceFingerprint?: string;
    title: string;
}

interface ConversationSidebarProps {
    buckets: ConversationRecord[];
    threads: ThreadListRecord[];
    tags: TagRecord[];
    threadTagIdsByThread: Map<string, string[]>;
    topLevelTab: TopLevelTab;
    selectedThreadId?: string;
    selectedTagId?: string;
    scopeFilter: 'all' | 'workspace' | 'detached';
    workspaceFilter?: string;
    sort: 'latest' | 'alphabetical';
    showAllModes: boolean;
    groupView: 'workspace' | 'branch';
    isCreatingThread: boolean;
    isAddingTag: boolean;
    onSelectThread: (threadId: string) => void;
    onToggleTagFilter: (tagId: string) => void;
    onScopeFilterChange: (scope: 'all' | 'workspace' | 'detached') => void;
    onWorkspaceFilterChange: (workspaceFingerprint?: string) => void;
    onSortChange: (sort: 'latest' | 'alphabetical') => void;
    onShowAllModesChange: (showAllModes: boolean) => void;
    onGroupViewChange: (groupView: 'workspace' | 'branch') => void;
    onCreateThread: (input: CreateThreadInput) => Promise<void>;
    onAddTagToThread: (threadId: string, label: string) => Promise<void>;
}

interface ThreadRenderRow {
    thread: ThreadListRecord;
    depth: number;
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

function buildBranchRows(threads: ThreadListRecord[]): ThreadRenderRow[] {
    const byId = new Map(threads.map((thread) => [thread.id, thread]));
    const childrenByParent = new Map<string, ThreadListRecord[]>();
    const roots: ThreadListRecord[] = [];

    for (const thread of threads) {
        const parentId = thread.parentThreadId;
        if (!parentId || !byId.has(parentId)) {
            roots.push(thread);
            continue;
        }
        const existing = childrenByParent.get(parentId) ?? [];
        existing.push(thread);
        childrenByParent.set(parentId, existing);
    }

    const rows: ThreadRenderRow[] = [];
    const stack: Array<{ thread: ThreadListRecord; depth: number }> = roots
        .slice()
        .reverse()
        .map((thread) => ({ thread, depth: 0 }));

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) {
            continue;
        }
        rows.push(current);
        const children = childrenByParent.get(current.thread.id) ?? [];
        for (let index = children.length - 1; index >= 0; index -= 1) {
            const child = children[index];
            if (!child) {
                continue;
            }
            stack.push({
                thread: child,
                depth: current.depth + 1,
            });
        }
    }

    return rows;
}

export function ConversationSidebar({
    buckets,
    threads,
    tags,
    threadTagIdsByThread,
    topLevelTab,
    selectedThreadId,
    selectedTagId,
    scopeFilter,
    workspaceFilter,
    sort,
    showAllModes,
    groupView,
    isCreatingThread,
    isAddingTag,
    onSelectThread,
    onToggleTagFilter,
    onScopeFilterChange,
    onWorkspaceFilterChange,
    onSortChange,
    onShowAllModesChange,
    onGroupViewChange,
    onCreateThread,
    onAddTagToThread,
}: ConversationSidebarProps) {
    const [newThreadTitle, setNewThreadTitle] = useState('');
    const [newThreadScope, setNewThreadScope] = useState<'detached' | 'workspace'>('detached');
    const [newThreadWorkspace, setNewThreadWorkspace] = useState('');
    const [newTagLabel, setNewTagLabel] = useState('');

    const workspaceOptions = [
        ...new Set(
            buckets.filter((bucket) => bucket.scope === 'workspace').map((bucket) => bucket.workspaceFingerprint)
        ),
    ]
        .filter((fingerprint): fingerprint is string => Boolean(fingerprint))
        .sort((left, right) => left.localeCompare(right));

    const tagLabelById = new Map(tags.map((tag) => [tag.id, tag.label]));
    const selectedThread = selectedThreadId ? threads.find((thread) => thread.id === selectedThreadId) : undefined;

    const groupedThreadRows = useMemo(() => {
        const grouped = new Map<string, { label: string; rows: ThreadRenderRow[] }>();
        for (const thread of threads) {
            const anchorKey = thread.anchorKind === 'workspace' ? `ws:${thread.anchorId ?? ''}` : 'playground';
            if (!grouped.has(anchorKey)) {
                grouped.set(anchorKey, {
                    label:
                        thread.anchorKind === 'workspace' ? `Workspace: ${thread.anchorId ?? 'Unknown'}` : 'Playground',
                    rows: [],
                });
            }
        }

        for (const [anchorKey, group] of grouped.entries()) {
            const anchorThreads = threads.filter((thread) => {
                const key = thread.anchorKind === 'workspace' ? `ws:${thread.anchorId ?? ''}` : 'playground';
                return key === anchorKey;
            });
            if (groupView === 'branch') {
                group.rows = buildBranchRows(anchorThreads);
            } else {
                group.rows = anchorThreads.map((thread) => ({ thread, depth: 0 }));
            }
        }

        return Array.from(grouped.values());
    }, [groupView, threads]);

    return (
        <aside className='border-border bg-card/40 flex min-h-0 w-[360px] flex-col border-r'>
            <div className='border-border space-y-3 border-b p-3'>
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
                        className='border-border bg-background h-9 rounded-md border px-2 text-sm'
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
                        {showAllModes ? 'Showing All Modes' : 'Show All Modes'}
                    </Button>
                    <select
                        className='border-border bg-background h-9 rounded-md border px-2 text-sm'
                        value={groupView}
                        onChange={(event) => {
                            onGroupViewChange(event.target.value === 'branch' ? 'branch' : 'workspace');
                        }}>
                        <option value='workspace'>Workspace View</option>
                        <option value='branch'>Branch View</option>
                    </select>
                </div>

                {scopeFilter === 'workspace' || workspaceFilter ? (
                    <select
                        className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm'
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

                <div className='space-y-2'>
                    <input
                        value={newThreadTitle}
                        onChange={(event) => {
                            setNewThreadTitle(event.target.value);
                        }}
                        className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm'
                        placeholder='Optional thread title'
                    />
                    <div className='grid grid-cols-2 gap-2'>
                        <select
                            className='border-border bg-background h-9 rounded-md border px-2 text-sm'
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
                                const generatedTitle =
                                    newThreadTitle.trim().length > 0
                                        ? newThreadTitle.trim()
                                        : `New ${modeLabel(topLevelTab).toLowerCase()} thread`;
                                if (newThreadScope === 'workspace' && newThreadWorkspace.trim().length === 0) {
                                    return;
                                }
                                if (newThreadScope === 'detached' && topLevelTab !== 'chat') {
                                    return;
                                }

                                void onCreateThread({
                                    scope: newThreadScope,
                                    title: generatedTitle,
                                    ...(newThreadScope === 'workspace' && newThreadWorkspace.trim().length > 0
                                        ? { workspaceFingerprint: newThreadWorkspace.trim() }
                                        : {}),
                                }).then(() => {
                                    setNewThreadTitle('');
                                });
                            }}>
                            New Thread
                        </Button>
                    </div>
                    {newThreadScope === 'workspace' ? (
                        <input
                            value={newThreadWorkspace}
                            onChange={(event) => {
                                setNewThreadWorkspace(event.target.value);
                            }}
                            className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm'
                            placeholder='workspace fingerprint'
                        />
                    ) : null}
                    {newThreadScope === 'detached' && topLevelTab !== 'chat' ? (
                        <p className='text-muted-foreground text-xs'>Playground is chat-only.</p>
                    ) : null}
                </div>
            </div>

            <div className='border-border space-y-2 border-b p-3'>
                <p className='text-muted-foreground text-xs font-semibold tracking-wide uppercase'>Tag Filter</p>
                <div className='flex flex-wrap gap-1.5'>
                    {tags.map((tag) => (
                        <button
                            key={tag.id}
                            type='button'
                            className={`rounded-md border px-2 py-1 text-xs ${
                                selectedTagId === tag.id
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
                            value={newTagLabel}
                            onChange={(event) => {
                                setNewTagLabel(event.target.value);
                            }}
                            className='border-border bg-background h-8 min-w-0 flex-1 rounded-md border px-2 text-xs'
                            placeholder='Add tag to selected thread'
                        />
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={isAddingTag}
                            onClick={() => {
                                const label = newTagLabel.trim();
                                if (label.length === 0) {
                                    return;
                                }

                                void onAddTagToThread(selectedThread.id, label).then(() => {
                                    setNewTagLabel('');
                                });
                            }}>
                            Add
                        </Button>
                    </div>
                ) : null}
            </div>

            <div className='min-h-0 flex-1 overflow-y-auto p-2'>
                {groupedThreadRows.map((group) => (
                    <section key={group.label} className='mb-3'>
                        <p className='text-muted-foreground px-1 pb-1 text-[11px] font-semibold tracking-wide uppercase'>
                            {group.label}
                        </p>
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
                                        <button
                                            type='button'
                                            className={`w-full rounded-lg border p-2 text-left ${
                                                selectedThreadId === thread.id
                                                    ? 'border-primary bg-primary/10'
                                                    : 'border-border bg-background hover:bg-accent'
                                            }`}
                                            style={{ paddingLeft: `${String(depth * 14 + 8)}px` }}
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
                                                    ? `workspace · ${thread.anchorId ?? 'unknown'}`
                                                    : 'playground'}
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
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </div>
        </aside>
    );
}
