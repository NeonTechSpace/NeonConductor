import { describe, expect, it, vi } from 'vitest';

import { buildConversationDialogProps } from '@/web/components/conversation/shell/buildConversationDialogProps';
import { buildConversationSidebarPaneProps } from '@/web/components/conversation/shell/buildConversationSidebarPaneProps';
import { buildConversationWorkspaceSectionProps } from '@/web/components/conversation/shell/buildConversationWorkspaceSectionProps';

describe('conversation shell composition helpers', () => {
    it('resets thread, session, and run selection when the sidebar selects a workspace fingerprint', () => {
        const setSelectedThreadId = vi.fn();
        const setSelectedSessionId = vi.fn();
        const setSelectedRunId = vi.fn();
        const onSelectedWorkspaceFingerprintChange = vi.fn();

        const sidebarPaneProps = buildConversationSidebarPaneProps({
            profileId: 'profile_default',
            topLevelTab: 'chat',
            selectedWorkspaceFingerprint: 'ws_old',
            isSidebarCollapsed: false,
            onToggleSidebarCollapsed: vi.fn(),
            queries: {
                listThreadsInput: { profileId: 'profile_default', topLevelTab: 'chat' },
                shellBootstrapQuery: {
                    data: {
                        workspaceRoots: [],
                        workspacePreferences: [],
                        threadTags: [],
                    },
                },
                listBucketsQuery: { data: { buckets: [] } },
                sessionsQuery: { data: { sessions: [] } },
                listTagsQuery: { data: { tags: [] } },
            },
            mutations: {
                upsertTagMutation: { isPending: false, mutateAsync: vi.fn() },
                setThreadTagsMutation: { isPending: false, mutateAsync: vi.fn() },
                deleteWorkspaceThreadsMutation: { isPending: false, mutateAsync: vi.fn() },
                createThreadMutation: { isPending: false },
                createSessionMutation: { isPending: false },
                setThreadFavoriteMutation: { mutateAsync: vi.fn() },
            },
            uiState: {
                selectedTagIds: [],
                scopeFilter: 'all',
                workspaceFilter: '',
                sort: 'latest',
                showAllModes: false,
                groupView: 'workspace',
                setSelectedThreadId,
                setSelectedSessionId,
                setSelectedRunId,
                setSelectedTagIds: vi.fn(),
                setScopeFilter: vi.fn(),
                setWorkspaceFilter: vi.fn(),
                setSort: vi.fn(),
                setShowAllModes: vi.fn(),
                setGroupView: vi.fn(),
            },
            selectionState: {
                visibleThreads: [],
                threadTagIdsByThread: new Map(),
                selectedThread: undefined,
            },
            selectedSessionId: undefined,
            selectedRunId: undefined,
            onTopLevelTabChange: vi.fn(),
            onSelectedWorkspaceFingerprintChange,
            setTabSwitchNotice: vi.fn(),
            handleCreateThread: vi.fn(),
            sidebarStatusMessage: 'Loading threads...',
            sidebarStatusTone: 'info',
        } as never);

        sidebarPaneProps.onSelectWorkspaceFingerprint('ws_new');

        expect(onSelectedWorkspaceFingerprintChange).toHaveBeenCalledWith('ws_new');
        expect(setSelectedThreadId).toHaveBeenCalledWith(undefined);
        expect(setSelectedSessionId).toHaveBeenCalledWith(undefined);
        expect(setSelectedRunId).toHaveBeenCalledWith(undefined);
        expect(sidebarPaneProps.statusMessage).toBe('Loading threads...');
        expect(sidebarPaneProps.statusTone).toBe('info');
    });

    it('builds the workspace section header from the runtime shell model', () => {
        const workspaceSectionProps = buildConversationWorkspaceSectionProps({
            shellViewModel: {
                selectedThread: { id: 'thr_1', title: 'Agent thread' },
            },
            queries: {
                shellBootstrapQuery: {
                    data: {
                        lastSequence: 42,
                    },
                },
            },
            streamState: 'connected',
            streamErrorMessage: 'stream warning',
            tabSwitchNotice: 'Moved to agent',
            topLevelTab: 'agent',
            isSidebarCollapsed: true,
            onToggleSidebarCollapsed: vi.fn(),
            onTopLevelTabChange: vi.fn(),
            panel: {
                header: {
                    title: 'Workspace',
                    selectionSummary: 'Agent thread',
                },
                primaryColumn: { sections: [] },
                inspector: { sections: [] },
            },
        } as never);

        expect(workspaceSectionProps.header.selectedThread?.title).toBe('Agent thread');
        expect(workspaceSectionProps.header.streamState).toBe('connected');
        expect(workspaceSectionProps.header.streamErrorMessage).toBe('stream warning');
        expect(workspaceSectionProps.header.lastSequence).toBe(42);
        expect(workspaceSectionProps.header.tabSwitchNotice).toBe('Moved to agent');
    });

    it('passes dialog props through unchanged', () => {
        const dialogProps = buildConversationDialogProps({
            messageEditDialogProps: {
                open: true,
                initialText: 'hello',
                preferredResolution: 'ask',
                busy: false,
                onCancel: vi.fn(),
                onSave: vi.fn(),
            },
            branchWorkflowDialogProps: {
                open: true,
                profileId: 'profile_default',
                workspaceFingerprint: 'ws_1',
                busy: true,
                onClose: vi.fn(),
                onBranch: vi.fn(),
            },
            toolArtifactViewerDialogProps: {
                open: true,
                isLoading: false,
                isUnavailable: false,
                searchDraftValue: '',
                searchMatches: [],
                searchTruncated: false,
                isSearching: false,
                onSearchDraftChange: vi.fn(),
                onSearchSubmit: vi.fn(),
                onSelectSearchMatch: vi.fn(),
                onPreviousPage: vi.fn(),
                onNextPage: vi.fn(),
                onClose: vi.fn(),
            },
            registryPromotionDialogProps: {
                open: false,
                busy: false,
                overwrite: false,
                onTargetChange: vi.fn(),
                onDraftChange: vi.fn(),
                onOverwriteChange: vi.fn(),
                onApply: vi.fn(),
                onClose: vi.fn(),
            },
        });

        expect(dialogProps.messageEditDialogProps.open).toBe(true);
        expect(dialogProps.branchWorkflowDialogProps.busy).toBe(true);
        expect(dialogProps.toolArtifactViewerDialogProps.open).toBe(true);
        expect(dialogProps.registryPromotionDialogProps.open).toBe(false);
    });
});
