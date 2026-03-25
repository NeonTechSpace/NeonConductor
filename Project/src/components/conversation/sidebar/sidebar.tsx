import { FolderPlus, PanelLeftOpen } from 'lucide-react';
import { useState } from 'react';

import { SidebarRailHeader } from '@/web/components/conversation/sidebar/sections/sidebarRailHeader';
import { SidebarThreadBrowser } from '@/web/components/conversation/sidebar/sections/sidebarThreadBrowser';
import type { SidebarMutationResult } from '@/web/components/conversation/sidebar/sidebarMutationResult';
import { useSidebarThreadDraftController } from '@/web/components/conversation/sidebar/useSidebarThreadDraftController';
import { useSidebarWorkspaceCreateController } from '@/web/components/conversation/sidebar/useSidebarWorkspaceCreateController';
import { useSidebarWorkspaceDeleteController } from '@/web/components/conversation/sidebar/useSidebarWorkspaceDeleteController';
import { WorkspaceDeleteDialog } from '@/web/components/conversation/sidebar/sections/workspaceDeleteDialog';
import { WorkspaceLifecycleDialog } from '@/web/components/conversation/sidebar/sections/workspaceLifecycleDialog';
import { Button } from '@/web/components/ui/button';
import { SECONDARY_QUERY_OPTIONS } from '@/web/lib/query/secondaryQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { ConversationRecord, TagRecord, ThreadListRecord } from '@/app/backend/persistence/types';
import type { SessionSummaryRecord } from '@/app/backend/persistence/types';
import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';

interface ConversationSidebarProps {
    profileId: string;
    isCollapsed: boolean;
    onToggleCollapsed: () => void;
    buckets: ConversationRecord[];
    threads: ThreadListRecord[];
    sessions: SessionSummaryRecord[];
    tags: TagRecord[];
    threadTagIdsByThread: Map<string, string[]>;
    workspaceRoots: Array<{
        fingerprint: string;
        label: string;
        absolutePath: string;
    }>;
    preferredWorkspaceFingerprint?: string;
    selectedThreadId?: string;
    selectedTagIds: string[];
    scopeFilter: 'all' | 'workspace' | 'detached';
    workspaceFilter?: string;
    sort: 'latest' | 'alphabetical';
    showAllModes: boolean;
    groupView: 'workspace' | 'branch';
    isAddingTag: boolean;
    isDeletingWorkspaceThreads: boolean;
    isCreatingThread: boolean;
    statusMessage?: string;
    statusTone?: 'info' | 'error';
    onSelectThread: (threadId: string) => void;
    onPreviewThread?: (threadId: string) => void;
    onToggleTagFilter: (tagId: string) => void;
    onToggleThreadFavorite: (threadId: string, nextFavorite: boolean) => Promise<SidebarMutationResult>;
    onScopeFilterChange: (scope: 'all' | 'workspace' | 'detached') => void;
    onWorkspaceFilterChange: (workspaceFingerprint?: string) => void;
    onSortChange: (sort: 'latest' | 'alphabetical') => void;
    onShowAllModesChange: (showAllModes: boolean) => void;
    onGroupViewChange: (groupView: 'workspace' | 'branch') => void;
    onSelectWorkspaceFingerprint: (workspaceFingerprint: string | undefined) => void;
    onAddTagToThread: (threadId: string, label: string) => Promise<SidebarMutationResult>;
    onDeleteWorkspaceThreads: (input: {
        workspaceFingerprint: string;
        includeFavoriteThreads: boolean;
    }) => Promise<SidebarMutationResult>;
    onCreateThread: (input: {
        workspaceFingerprint: string;
        workspaceAbsolutePath: string;
        title: string;
        topLevelTab: TopLevelTab;
        providerId?: RuntimeProviderId;
        modelId?: string;
    }) => Promise<void>;
}

export function ConversationSidebar({
    profileId,
    isCollapsed,
    onToggleCollapsed,
    buckets,
    threads,
    sessions,
    tags,
    threadTagIdsByThread,
    workspaceRoots,
    preferredWorkspaceFingerprint,
    selectedThreadId,
    selectedTagIds,
    scopeFilter,
    workspaceFilter,
    sort,
    showAllModes,
    groupView,
    isAddingTag,
    isDeletingWorkspaceThreads,
    isCreatingThread,
    statusMessage,
    statusTone = 'info',
    onSelectThread,
    onPreviewThread,
    onToggleTagFilter,
    onToggleThreadFavorite,
    onScopeFilterChange,
    onWorkspaceFilterChange,
    onSortChange,
    onShowAllModesChange,
    onGroupViewChange,
    onSelectWorkspaceFingerprint,
    onAddTagToThread,
    onDeleteWorkspaceThreads,
    onCreateThread,
}: ConversationSidebarProps) {
    const shellBootstrapQuery = trpc.runtime.getShellBootstrap.useQuery({ profileId }, SECONDARY_QUERY_OPTIONS);
    const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>(undefined);
    const providers = shellBootstrapQuery.data?.providers ?? [];
    const providerModels = shellBootstrapQuery.data?.providerModels ?? [];
    const workspacePreferences = shellBootstrapQuery.data?.workspacePreferences ?? [];
    const defaults = shellBootstrapQuery.data?.defaults;
    const desktopBridge = typeof window !== 'undefined' ? window.neonDesktop : undefined;
    const threadDraftController = useSidebarThreadDraftController({
        preferredWorkspaceFingerprint,
        workspaceRoots,
        workspacePreferences,
        providers,
        providerModels,
        defaults,
        onSelectWorkspaceFingerprint,
        onCreateThread,
        onFeedbackMessageChange: setFeedbackMessage,
    });
    const workspaceCreateController = useSidebarWorkspaceCreateController({
        profileId,
        providers,
        providerModels,
        workspacePreferences,
        defaults,
        desktopBridge,
        onSelectWorkspaceFingerprint,
        onCreateThread,
        onFeedbackMessageChange: setFeedbackMessage,
        onStarterThreadFallback: threadDraftController.startInlineThreadDraft,
    });
    const workspaceDeleteController = useSidebarWorkspaceDeleteController({
        profileId,
        isDeletingWorkspaceThreads,
        onDeleteWorkspaceThreads,
        onFeedbackMessageChange: setFeedbackMessage,
    });

    return (
        <>
            <aside
                className={`border-border/70 bg-card/40 flex min-h-0 shrink-0 flex-col border-r transition-[width] duration-200 ${
                    isCollapsed ? 'w-[76px]' : 'w-[272px] xl:w-[288px]'
                }`}>
                <SidebarRailHeader
                    compact={isCollapsed}
                    {...(feedbackMessage ? { feedbackMessage } : {})}
                    {...(statusMessage ? { statusMessage, statusTone } : {})}
                    onToggleCollapsed={onToggleCollapsed}
                    primaryAction={
                        isCollapsed ? (
                            <Button
                                type='button'
                                size='icon'
                                variant='outline'
                                className='h-10 w-10 rounded-2xl'
                                aria-label='Add workspace'
                                title='Add workspace'
                                onClick={workspaceCreateController.openWorkspaceCreate}>
                                <FolderPlus className='h-4 w-4' />
                            </Button>
                        ) : (
                            <Button
                                type='button'
                                size='sm'
                                variant='secondary'
                                className='h-9 w-full rounded-xl whitespace-nowrap'
                                onClick={workspaceCreateController.openWorkspaceCreate}>
                                Add workspace
                            </Button>
                        )
                    }
                />

                {isCollapsed ? (
                    <div className='flex flex-1 flex-col items-center gap-3 px-3 py-4'>
                        <Button
                            type='button'
                            size='icon'
                            variant='outline'
                            className='h-10 w-10 rounded-2xl'
                            aria-label='Expand threads sidebar'
                            title='Expand threads sidebar'
                            onClick={onToggleCollapsed}>
                            <PanelLeftOpen className='h-4 w-4' />
                        </Button>
                    </div>
                ) : (
                    <SidebarThreadBrowser
                        buckets={buckets}
                        threads={threads}
                        sessions={sessions}
                        tags={tags}
                        workspaceRoots={workspaceRoots}
                        threadTagIdsByThread={threadTagIdsByThread}
                        {...(selectedThreadId ? { selectedThreadId } : {})}
                        {...(preferredWorkspaceFingerprint
                            ? { selectedWorkspaceFingerprint: preferredWorkspaceFingerprint }
                            : {})}
                        selectedTagIds={selectedTagIds}
                        scopeFilter={scopeFilter}
                        {...(workspaceFilter ? { workspaceFilter } : {})}
                        sort={sort}
                        showAllModes={showAllModes}
                        groupView={groupView}
                        isAddingTag={isAddingTag}
                        {...(statusMessage ? { statusMessage, statusTone } : {})}
                        providers={providers}
                        providerModels={providerModels}
                        isCreatingThread={isCreatingThread || workspaceCreateController.busy}
                        {...(threadDraftController.inlineThreadDraft
                            ? { inlineThreadDraft: threadDraftController.inlineThreadDraft }
                            : {})}
                        onSelectThread={onSelectThread}
                        {...(onPreviewThread ? { onPreviewThread } : {})}
                        onToggleTagFilter={onToggleTagFilter}
                        onToggleThreadFavorite={async (threadId, nextFavorite) => {
                            setFeedbackMessage(undefined);
                            const result = await onToggleThreadFavorite(threadId, nextFavorite);
                            if (!result.ok) {
                                setFeedbackMessage(result.message);
                            }
                            return result;
                        }}
                        onRequestWorkspaceDelete={(workspaceFingerprint, workspaceLabel) => {
                            workspaceDeleteController.requestWorkspaceDelete(workspaceFingerprint, workspaceLabel);
                        }}
                        onRequestNewThread={(workspaceFingerprint) => {
                            threadDraftController.startInlineThreadDraft(
                                threadDraftController.getRequestWorkspaceFingerprint(workspaceFingerprint)
                            );
                        }}
                        onInlineThreadTitleChange={threadDraftController.setInlineThreadTitle}
                        onInlineThreadTopLevelTabChange={threadDraftController.setInlineThreadTopLevelTab}
                        onInlineThreadProviderChange={(providerId) => {
                            const nextModelId =
                                providerModels.find((model) => model.providerId === providerId)?.id ?? '';
                            threadDraftController.setInlineThreadProvider(providerId, nextModelId);
                        }}
                        onInlineThreadModelChange={threadDraftController.setInlineThreadModel}
                        onCancelInlineThread={threadDraftController.cancelInlineThread}
                        onSubmitInlineThread={() => {
                            void threadDraftController.submitInlineThread();
                        }}
                        onSelectWorkspaceFingerprint={onSelectWorkspaceFingerprint}
                        onScopeFilterChange={onScopeFilterChange}
                        onWorkspaceFilterChange={onWorkspaceFilterChange}
                        onSortChange={onSortChange}
                        onShowAllModesChange={onShowAllModesChange}
                        onGroupViewChange={onGroupViewChange}
                        onAddTagToThread={async (threadId, label) => {
                            setFeedbackMessage(undefined);
                            const result = await onAddTagToThread(threadId, label);
                            if (!result.ok) {
                                setFeedbackMessage(result.message);
                            }
                            return result;
                        }}
                    />
                )}
            </aside>

            <WorkspaceLifecycleDialog
                open={workspaceCreateController.open}
                profileId={profileId}
                providers={providers}
                providerModels={providerModels}
                workspacePreferences={workspacePreferences}
                defaults={defaults}
                busy={workspaceCreateController.busy}
                isPickingDirectory={workspaceCreateController.isPickingDirectory}
                {...(workspaceCreateController.statusMessage
                    ? { statusMessage: workspaceCreateController.statusMessage }
                    : {})}
                onClose={workspaceCreateController.closeWorkspaceCreate}
                onBrowseDirectory={workspaceCreateController.browseDirectory}
                onSubmit={workspaceCreateController.submitWorkspaceCreate}
            />

            <WorkspaceDeleteDialog
                open={Boolean(workspaceDeleteController.target)}
                {...(workspaceDeleteController.target?.workspaceLabel
                    ? { workspaceLabel: workspaceDeleteController.target.workspaceLabel }
                    : {})}
                deletableThreadCount={workspaceDeleteController.previewQuery.data?.deletableThreadCount ?? 0}
                favoriteThreadCount={workspaceDeleteController.previewQuery.data?.favoriteThreadCount ?? 0}
                totalThreadCount={workspaceDeleteController.previewQuery.data?.totalThreadCount ?? 0}
                busy={workspaceDeleteController.busy}
                includeFavoriteThreads={workspaceDeleteController.includeFavoriteThreads}
                onIncludeFavoriteThreadsChange={workspaceDeleteController.setIncludeFavoriteThreads}
                onCancel={workspaceDeleteController.cancelWorkspaceDelete}
                onConfirm={() => {
                    void workspaceDeleteController.confirmWorkspaceDelete();
                }}
            />
        </>
    );
}
