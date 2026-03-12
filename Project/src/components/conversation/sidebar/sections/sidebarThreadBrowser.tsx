import { useDeferredValue, useState } from 'react';

import { buildConversationSidebarModel } from '@/web/components/conversation/sidebar/sidebarModel';
import { SidebarThreadList } from '@/web/components/conversation/sidebar/sections/sidebarThreadList';
import { Button } from '@/web/components/ui/button';

import type { ConversationRecord, TagRecord, ThreadListRecord } from '@/app/backend/persistence/types';

interface SidebarThreadBrowserProps {
    buckets: ConversationRecord[];
    threads: ThreadListRecord[];
    tags: TagRecord[];
    threadTagIdsByThread: Map<string, string[]>;
    selectedThreadId?: string;
    selectedTagIds: string[];
    scopeFilter: 'all' | 'workspace' | 'detached';
    workspaceFilter?: string;
    sort: 'latest' | 'alphabetical';
    showAllModes: boolean;
    groupView: 'workspace' | 'branch';
    isAddingTag: boolean;
    statusMessage?: string;
    statusTone?: 'info' | 'error';
    onSelectThread: (threadId: string) => void;
    onPreviewThread?: (threadId: string) => void;
    onToggleTagFilter: (tagId: string) => void;
    onToggleThreadFavorite: (threadId: string, nextFavorite: boolean) => Promise<void>;
    onRequestWorkspaceDelete: (workspaceFingerprint: string, workspaceLabel: string) => void;
    onScopeFilterChange: (scope: 'all' | 'workspace' | 'detached') => void;
    onWorkspaceFilterChange: (workspaceFingerprint?: string) => void;
    onSortChange: (sort: 'latest' | 'alphabetical') => void;
    onShowAllModesChange: (showAllModes: boolean) => void;
    onGroupViewChange: (groupView: 'workspace' | 'branch') => void;
    onAddTagToThread: (threadId: string, label: string) => Promise<void>;
}

function matchesThreadSearch(thread: ThreadListRecord, searchValue: string): boolean {
    if (searchValue.length === 0) {
        return true;
    }

    const haystack = [thread.title, thread.anchorId ?? '', thread.workspaceFingerprint ?? '', thread.topLevelTab]
        .join(' ')
        .toLowerCase();

    return haystack.includes(searchValue);
}

export function SidebarThreadBrowser({
    buckets,
    threads,
    tags,
    threadTagIdsByThread,
    selectedThreadId,
    selectedTagIds,
    scopeFilter,
    workspaceFilter,
    sort,
    showAllModes,
    groupView,
    isAddingTag,
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
    onAddTagToThread,
}: SidebarThreadBrowserProps) {
    const [searchValue, setSearchValue] = useState('');
    const [newTagLabel, setNewTagLabel] = useState('');
    const deferredSearchValue = useDeferredValue(searchValue.trim().toLowerCase());
    const visibleThreads = threads.filter((thread) => matchesThreadSearch(thread, deferredSearchValue));
    const selectedThread = threads.find((thread) => thread.id === selectedThreadId);
    const { workspaceOptions, tagLabelById, groupedThreadRows } = buildConversationSidebarModel({
        buckets,
        threads: visibleThreads,
        tags,
        groupView,
        ...(selectedThreadId ? { selectedThreadId } : {}),
    });
    const resultsLabel =
        deferredSearchValue.length > 0
            ? `${String(groupedThreadRows.reduce((count, group) => count + group.rows.length, 0))} matches`
            : `${String(visibleThreads.length)} threads`;

    return (
        <>
            <div className='space-y-2 p-4 pt-0'>
                <input
                    aria-label='Search threads'
                    name='threadSearch'
                    value={searchValue}
                    onChange={(event) => {
                        setSearchValue(event.target.value);
                    }}
                    className='border-border bg-background h-10 w-full rounded-2xl border px-3 text-sm'
                    autoComplete='off'
                    placeholder='Search threads, workspaces, or tabs…'
                />

                <div className='grid grid-cols-[minmax(0,1fr)_112px] gap-2'>
                    <div className='grid grid-cols-3 gap-2'>
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
                    </div>

                    <select
                        aria-label='Sort threads'
                        className='border-border bg-background h-8 rounded-xl border px-3 text-sm'
                        value={sort}
                        onChange={(event) => {
                            onSortChange(event.target.value === 'alphabetical' ? 'alphabetical' : 'latest');
                        }}>
                        <option value='latest'>Latest</option>
                        <option value='alphabetical'>A-Z</option>
                    </select>
                </div>

                <details className='rounded-2xl border border-border/70 bg-background/50 px-3 py-2'>
                    <summary className='flex cursor-pointer list-none items-center justify-between gap-3 py-1'>
                        <div>
                            <p className='text-sm font-medium'>Filters</p>
                            <p className='text-muted-foreground text-xs'>
                                {resultsLabel} · tags and branch grouping stay optional.
                            </p>
                        </div>
                        <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                            Toggle
                        </span>
                    </summary>

                    <div className='mt-3 space-y-3'>
                        <div className='grid grid-cols-2 gap-2'>
                            <Button
                                type='button'
                                size='sm'
                                variant={showAllModes ? 'secondary' : 'outline'}
                                onClick={() => {
                                    onShowAllModesChange(!showAllModes);
                                }}>
                                {showAllModes ? 'Mixed Tabs' : 'Current Tab'}
                            </Button>
                            <select
                                aria-label='Conversation grouping'
                                className='border-border bg-background h-8 rounded-xl border px-3 text-sm'
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
                                className='border-border bg-background h-8 w-full rounded-xl border px-3 text-sm'
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

                        {tags.length > 0 ? (
                            <div className='space-y-2'>
                                <p className='text-muted-foreground text-[11px] font-semibold tracking-wide uppercase'>
                                    Tags
                                </p>
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
                            </div>
                        ) : null}

                        {selectedThread ? (
                            <div className='space-y-2'>
                                <p className='text-muted-foreground text-[11px] font-semibold tracking-wide uppercase'>
                                    Add Tag To Selected Thread
                                </p>
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
                                        placeholder='Tag label…'
                                    />
                                    <Button
                                        type='button'
                                        size='sm'
                                        variant='outline'
                                        disabled={isAddingTag}
                                        onClick={() => {
                                            void onAddTagToThread(selectedThread.id, newTagLabel).then(() => {
                                                setNewTagLabel('');
                                            });
                                        }}>
                                        Add
                                    </Button>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </details>
            </div>

            <SidebarThreadList
                groupedThreadRows={groupedThreadRows}
                threadTagIdsByThread={threadTagIdsByThread}
                tagLabelById={tagLabelById}
                {...(selectedThreadId ? { selectedThreadId } : {})}
                showAllModes={showAllModes}
                groupView={groupView}
                {...(statusMessage ? { statusMessage, statusTone } : {})}
                deferredSearchValue={deferredSearchValue}
                {...(onPreviewThread ? { onPreviewThread } : {})}
                onSelectThread={onSelectThread}
                onToggleThreadFavorite={onToggleThreadFavorite}
                onRequestWorkspaceDelete={onRequestWorkspaceDelete}
            />
        </>
    );
}
