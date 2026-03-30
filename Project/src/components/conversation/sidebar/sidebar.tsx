import { FolderPlus, PanelLeftOpen } from 'lucide-react';
import { useState } from 'react';

import { SidebarRailHeader } from '@/web/components/conversation/sidebar/sections/sidebarRailHeader';
import { SidebarThreadBrowser } from '@/web/components/conversation/sidebar/sections/sidebarThreadBrowser';
import { WorkspaceDeleteDialog } from '@/web/components/conversation/sidebar/sections/workspaceDeleteDialog';
import { WorkspaceLifecycleDialog } from '@/web/components/conversation/sidebar/sections/workspaceLifecycleDialog';
import type { ThreadEntrySubmitResult } from '@/web/components/conversation/sidebar/sidebarTypes';
import { useSidebarMutationController } from '@/web/components/conversation/sidebar/useSidebarMutationController';
import { useSidebarWorkspaceCreateController } from '@/web/components/conversation/sidebar/useSidebarWorkspaceCreateController';
import { useSidebarWorkspaceDeleteController } from '@/web/components/conversation/sidebar/useSidebarWorkspaceDeleteController';
import { useThreadEntryDraftState } from '@/web/components/conversation/sidebar/useThreadEntryDraftState';
import { useWorkspaceLifecycleDraftState } from '@/web/components/conversation/sidebar/useWorkspaceLifecycleDraftState';
import { Button } from '@/web/components/ui/button';

import type {
    ConversationRecord,
    ProviderModelRecord,
    SessionSummaryRecord,
    TagRecord,
    ThreadListRecord,
    ThreadRecord,
    ThreadTagRecord,
} from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';

import type { EntityId, RuntimeProviderId, TopLevelTab } from '@/shared/contracts';
import type { WorkspacePreferenceRecord } from '@/shared/contracts/types/runtime';


interface ConversationSidebarProps {
    profileId: string;
    threadListQueryInput: {
        profileId: string;
        activeTab: TopLevelTab;
        showAllModes: boolean;
        groupView: 'workspace' | 'branch';
        scope?: 'workspace' | 'detached';
        workspaceFingerprint?: string;
        sort?: 'latest' | 'alphabetical';
    };
    isCollapsed: boolean;
    onToggleCollapsed: () => void;
    buckets: ConversationRecord[];
    threads: ThreadListRecord[];
    sessions: SessionSummaryRecord[];
    tags: TagRecord[];
    threadTags: ThreadTagRecord[];
    threadTagIdsByThread: Map<string, string[]>;
    workspaceRoots: Array<{
        fingerprint: string;
        label: string;
        absolutePath: string;
    }>;
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
    workspacePreferences: WorkspacePreferenceRecord[];
    defaults:
        | {
              providerId: string;
              modelId: string;
          }
        | undefined;
    preferredWorkspaceFingerprint?: string;
    selectedThreadId?: string;
    selectedSessionId?: string;
    selectedRunId?: string;
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
    onSelectThreadId: (threadId: string | undefined) => void;
    onSelectSessionId: (sessionId: string | undefined) => void;
    onSelectRunId: (runId: string | undefined) => void;
    onPreviewThread?: (threadId: string) => void;
    onToggleTagFilter: (tagId: string) => void;
    onScopeFilterChange: (scope: 'all' | 'workspace' | 'detached') => void;
    onWorkspaceFilterChange: (workspaceFingerprint?: string) => void;
    onSortChange: (sort: 'latest' | 'alphabetical') => void;
    onShowAllModesChange: (showAllModes: boolean) => void;
    onGroupViewChange: (groupView: 'workspace' | 'branch') => void;
    onSelectWorkspaceFingerprint: (workspaceFingerprint: string | undefined) => void;
    onCreateThread: (input: {
        workspaceFingerprint: string;
        workspaceAbsolutePath: string;
        title: string;
        topLevelTab: TopLevelTab;
        providerId?: RuntimeProviderId;
        modelId?: string;
    }) => Promise<ThreadEntrySubmitResult>;
    upsertTag: (input: { profileId: string; label: string }) => Promise<{ tag: TagRecord }>;
    setThreadTags: (input: {
        profileId: string;
        threadId: EntityId<'thr'>;
        tagIds: EntityId<'tag'>[];
    }) => Promise<{ threadTags: ThreadTagRecord[] }>;
    setThreadFavorite: (input: {
        profileId: string;
        threadId: EntityId<'thr'>;
        isFavorite: boolean;
    }) => Promise<{ updated: boolean; thread?: ThreadRecord }>;
    deleteWorkspaceThreads: (input: {
        profileId: string;
        workspaceFingerprint: string;
        includeFavorites?: boolean;
    }) => Promise<{
        deletedThreadIds: string[];
        deletedTagIds: string[];
        deletedConversationIds: string[];
        sessionIds: string[];
    }>;
}

export function ConversationSidebar({
    profileId,
    threadListQueryInput,
    isCollapsed,
    onToggleCollapsed,
    buckets,
    threads,
    sessions,
    tags,
    threadTags,
    threadTagIdsByThread,
    workspaceRoots,
    providers,
    providerModels,
    workspacePreferences,
    defaults,
    preferredWorkspaceFingerprint,
    selectedThreadId,
    selectedSessionId,
    selectedRunId,
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
    onSelectThreadId,
    onSelectSessionId,
    onSelectRunId,
    onPreviewThread,
    onToggleTagFilter,
    onScopeFilterChange,
    onWorkspaceFilterChange,
    onSortChange,
    onShowAllModesChange,
    onGroupViewChange,
    onSelectWorkspaceFingerprint,
    onCreateThread,
    upsertTag,
    setThreadTags,
    setThreadFavorite,
    deleteWorkspaceThreads,
}: ConversationSidebarProps) {
    const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>(undefined);
    const desktopBridge = typeof window !== 'undefined' ? window.neonDesktop : undefined;
    const threadDraftController = useThreadEntryDraftState({
        preferredWorkspaceFingerprint,
        workspacePreferences,
        providers,
        providerModels,
        defaults,
    });
    const workspaceLifecycleDraft = useWorkspaceLifecycleDraftState({
        profileId,
        providers,
        providerModels,
        workspacePreferences,
        defaults,
        desktopBridge,
    });
    const workspaceCreateController = useSidebarWorkspaceCreateController({
        profileId,
        onCreateThread,
    });
    const mutationController = useSidebarMutationController({
        profileId,
        threadListQueryInput,
        buckets,
        threads,
        tags,
        threadTags,
        threadTagIdsByThread,
        selectedThreadId,
        selectedSessionId,
        selectedRunId,
        onSelectThreadId,
        onSelectSessionId,
        onSelectRunId,
        upsertTag,
        setThreadTags,
        setThreadFavorite,
        deleteWorkspaceThreads,
    });
    const workspaceDeleteController = useSidebarWorkspaceDeleteController({
        profileId,
        isDeletingWorkspaceThreads,
        onDeleteWorkspaceThreads: (input) => mutationController.deleteWorkspaceThreadsForSidebar(input),
        onFeedbackMessageChange: setFeedbackMessage,
    });

    async function handleWorkspaceCreateSubmit() {
        workspaceLifecycleDraft.clearStatusMessage();
        setFeedbackMessage(undefined);

        const result = await workspaceCreateController.submitWorkspaceCreate({
            absolutePath: workspaceLifecycleDraft.draft.absolutePath,
            label: workspaceLifecycleDraft.draft.label,
            defaultTopLevelTab: workspaceLifecycleDraft.draft.defaultTopLevelTab,
            defaultProviderId: workspaceLifecycleDraft.draft.defaultProviderId,
            defaultModelId: workspaceLifecycleDraft.selectedModelId,
        });

        if (result.kind === 'failed') {
            workspaceLifecycleDraft.setStatusMessage(result.message);
            return;
        }

        workspaceLifecycleDraft.closeDraft();

        if (result.kind === 'created_without_starter_thread') {
            onSelectWorkspaceFingerprint(result.workspaceRoot.fingerprint);
            threadDraftController.openInlineThreadDraft(result.draftState);
            setFeedbackMessage(result.message);
            return;
        }

        if (result.threadEntryResult.kind === 'created_without_starter_session') {
            setFeedbackMessage(result.threadEntryResult.message);
        }
    }

    async function handleInlineThreadSubmit() {
        if (!threadDraftController.inlineThreadDraft) {
            return;
        }

        const workspaceRoot = workspaceRoots.find(
            (workspace) => workspace.fingerprint === threadDraftController.inlineThreadDraft?.workspaceFingerprint
        );
        if (!workspaceRoot) {
            setFeedbackMessage('The selected workspace could not be resolved for the new thread.');
            return;
        }

        setFeedbackMessage(undefined);
        const result = await onCreateThread({
            workspaceFingerprint: threadDraftController.inlineThreadDraft.workspaceFingerprint,
            workspaceAbsolutePath: workspaceRoot.absolutePath,
            title: threadDraftController.inlineThreadDraft.title,
            topLevelTab: threadDraftController.inlineThreadDraft.topLevelTab,
            ...(threadDraftController.inlineThreadDraft.providerId && threadDraftController.inlineThreadDraft.modelId
                ? {
                      providerId: threadDraftController.inlineThreadDraft.providerId,
                      modelId: threadDraftController.inlineThreadDraft.modelId,
                  }
                : {}),
        });

        if (result.kind === 'failed') {
            setFeedbackMessage(result.message);
            return;
        }

        threadDraftController.cancelInlineThread();
        if (result.kind === 'created_without_starter_session') {
            setFeedbackMessage(result.message);
        }
    }

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
                                onClick={() => {
                                    workspaceLifecycleDraft.openDraft();
                                }}>
                                <FolderPlus className='h-4 w-4' />
                            </Button>
                        ) : (
                            <Button
                                type='button'
                                size='sm'
                                variant='secondary'
                                className='h-9 w-full rounded-xl whitespace-nowrap'
                                onClick={() => {
                                    workspaceLifecycleDraft.openDraft();
                                }}>
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
                            const result = await mutationController.toggleThreadFavorite(threadId, nextFavorite);
                            if (!result.ok) {
                                setFeedbackMessage(result.message);
                            }
                            return result;
                        }}
                        onRequestWorkspaceDelete={(workspaceFingerprint, workspaceLabel) => {
                            workspaceDeleteController.requestWorkspaceDelete(workspaceFingerprint, workspaceLabel);
                        }}
                        onRequestNewThread={(workspaceFingerprint) => {
                            const requestedWorkspaceFingerprint =
                                threadDraftController.getRequestWorkspaceFingerprint(workspaceFingerprint);
                            if (!requestedWorkspaceFingerprint) {
                                setFeedbackMessage('Choose a workspace before creating a workspace thread.');
                                return;
                            }

                            setFeedbackMessage(undefined);
                            onSelectWorkspaceFingerprint(requestedWorkspaceFingerprint);
                            threadDraftController.startInlineThreadDraft(requestedWorkspaceFingerprint);
                        }}
                        onInlineThreadTitleChange={(title) => {
                            threadDraftController.setInlineThreadTitle(title);
                        }}
                        onInlineThreadTopLevelTabChange={(topLevelTab) => {
                            threadDraftController.setInlineThreadTopLevelTab(topLevelTab);
                        }}
                        onInlineThreadProviderChange={(providerId) => {
                            const nextModelId =
                                providerModels.find((model) => model.providerId === providerId)?.id ?? '';
                            threadDraftController.setInlineThreadProvider(providerId, nextModelId);
                        }}
                        onInlineThreadModelChange={(modelId) => {
                            threadDraftController.setInlineThreadModel(modelId);
                        }}
                        onCancelInlineThread={() => {
                            threadDraftController.cancelInlineThread();
                        }}
                        onSubmitInlineThread={() => {
                            void handleInlineThreadSubmit();
                        }}
                        onSelectWorkspaceFingerprint={onSelectWorkspaceFingerprint}
                        onScopeFilterChange={onScopeFilterChange}
                        onWorkspaceFilterChange={onWorkspaceFilterChange}
                        onSortChange={onSortChange}
                        onShowAllModesChange={onShowAllModesChange}
                        onGroupViewChange={onGroupViewChange}
                        onAddTagToThread={async (threadId, label) => {
                            setFeedbackMessage(undefined);
                            const result = await mutationController.addTagToThread(threadId, label);
                            if (!result.ok) {
                                setFeedbackMessage(result.message);
                            }
                            return result;
                        }}
                    />
                )}
            </aside>

            <WorkspaceLifecycleDialog
                open={workspaceLifecycleDraft.open}
                draft={workspaceLifecycleDraft.draft}
                providers={providers}
                modelOptions={workspaceLifecycleDraft.modelOptions}
                selectedModelId={workspaceLifecycleDraft.selectedModelId}
                busy={workspaceCreateController.busy}
                isPickingDirectory={workspaceLifecycleDraft.isPickingDirectory}
                {...(workspaceLifecycleDraft.statusMessage
                    ? { statusMessage: workspaceLifecycleDraft.statusMessage }
                    : {})}
                environmentPreview={workspaceLifecycleDraft.environmentPreview}
                onClose={() => {
                    workspaceLifecycleDraft.closeDraft();
                }}
                onBrowseDirectory={() => workspaceLifecycleDraft.browseDirectory()}
                onLabelChange={(label) => {
                    workspaceLifecycleDraft.setLabel(label);
                }}
                onAbsolutePathChange={(absolutePath) => {
                    workspaceLifecycleDraft.setAbsolutePath(absolutePath);
                }}
                onDefaultTopLevelTabChange={(topLevelTab) => {
                    workspaceLifecycleDraft.setDefaultTopLevelTab(topLevelTab);
                }}
                onDefaultProviderIdChange={(providerId) => {
                    workspaceLifecycleDraft.setDefaultProviderId(providerId);
                }}
                onDefaultModelIdChange={(modelId) => {
                    workspaceLifecycleDraft.setDefaultModelId(modelId);
                }}
                onSubmit={handleWorkspaceCreateSubmit}
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
                onCancel={() => {
                    workspaceDeleteController.cancelWorkspaceDelete();
                }}
                onConfirm={() => {
                    void workspaceDeleteController.confirmWorkspaceDelete();
                }}
            />
        </>
    );
}
