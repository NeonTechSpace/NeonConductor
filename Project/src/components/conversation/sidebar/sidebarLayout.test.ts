import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ConversationSidebar } from '@/web/components/conversation/sidebar/sidebar';

import type { ConversationRecord, TagRecord, ThreadListRecord } from '@/app/backend/persistence/types';
import type { SessionSummaryRecord } from '@/app/backend/persistence/types';

const buckets: ConversationRecord[] = [
    {
        id: 'conv_workspace',
        profileId: 'profile_default',
        scope: 'workspace',
        workspaceFingerprint: 'ws_alpha',
        title: 'Workspace Alpha',
        createdAt: '2026-03-12T09:00:00.000Z',
        updatedAt: '2026-03-12T09:00:00.000Z',
    },
];

const threads: ThreadListRecord[] = [
    {
        id: 'thr_root',
        profileId: 'profile_default',
        conversationId: 'conv_workspace',
        title: 'Root Thread',
        topLevelTab: 'chat',
        rootThreadId: 'thr_root',
        isFavorite: false,
        executionEnvironmentMode: 'local',
        scope: 'workspace',
        workspaceFingerprint: 'ws_alpha',
        anchorKind: 'workspace',
        anchorId: 'ws_alpha',
        sessionCount: 1,
        createdAt: '2026-03-12T09:00:00.000Z',
        updatedAt: '2026-03-12T09:00:00.000Z',
    },
];

const tags: TagRecord[] = [
    {
        id: 'tag_ui',
        profileId: 'profile_default',
        label: 'UI',
        createdAt: '2026-03-12T09:00:00.000Z',
        updatedAt: '2026-03-12T09:00:00.000Z',
    },
];

const sessions: SessionSummaryRecord[] = [
    {
        id: 'sess_root',
        profileId: 'profile_default',
        conversationId: 'conv_workspace',
        threadId: 'thr_root',
        kind: 'local',
        runStatus: 'completed',
        turnCount: 1,
        updatedAt: '2026-03-12T09:00:00.000Z',
        createdAt: '2026-03-12T09:00:00.000Z',
    },
];

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        conversation: {
            getWorkspaceThreadDeletePreview: {
                useQuery: () => ({
                    data: undefined,
                    isLoading: false,
                }),
            },
        },
        runtime: {
            inspectWorkspaceEnvironment: {
                useQuery: () => ({
                    data: undefined,
                    error: undefined,
                    isLoading: false,
                }),
            },
            registerWorkspaceRoot: {
                useMutation: () => ({
                    isPending: false,
                    mutateAsync: vi.fn(),
                }),
            },
            setWorkspacePreference: {
                useMutation: () => ({
                    isPending: false,
                    mutateAsync: vi.fn(),
                }),
            },
        },
        useUtils: () => ({
            runtime: {
                listWorkspaceRoots: { setData: vi.fn() },
                getShellBootstrap: { setData: vi.fn() },
            },
        }),
    },
}));

describe('conversation sidebar layout', () => {
    it('keeps thread composition in the rail while preserving search and filter controls', () => {
        const html = renderToStaticMarkup(
            createElement(ConversationSidebar, {
                profileId: 'profile_default',
                threadListQueryInput: {
                    profileId: 'profile_default',
                    activeTab: 'chat',
                    showAllModes: false,
                    groupView: 'workspace',
                    sort: 'latest',
                },
                isCollapsed: false,
                onToggleCollapsed: vi.fn(),
                buckets,
                threads,
                sessions,
                tags,
                threadTags: [],
                threadTagIdsByThread: new Map([['thr_root', ['tag_ui']]]),
                workspaceRoots: [
                    {
                        fingerprint: 'ws_alpha',
                        label: 'Workspace Alpha',
                        absolutePath: 'C:\\Alpha',
                    },
                ],
                providers: [
                    {
                        id: 'kilo',
                        label: 'Kilo',
                        authState: 'authenticated',
                        authMethod: 'oauth_pkce',
                        connectionProfile: {
                            providerId: 'kilo',
                            optionProfileId: 'gateway',
                            label: 'Gateway',
                            options: [{ value: 'gateway', label: 'Gateway' }],
                            resolvedBaseUrl: null,
                        },
                        apiKeyCta: { label: 'Create key', url: 'https://example.com' },
                        isDefault: true,
                        availableAuthMethods: ['device_code'],
                        features: {
                            supportsKiloRouting: true,
                            catalogStrategy: 'dynamic',
                            supportsModelProviderListing: true,
                            supportsConnectionOptions: false,
                            supportsCustomBaseUrl: false,
                            supportsOrganizationScope: true,
                        },
                        supportsByok: false,
                    },
                ],
                providerModels: [
                    {
                        id: 'kilo-auto/frontier',
                        providerId: 'kilo',
                        label: 'Kilo Auto Frontier',
                        features: {
                            supportsTools: true,
                            supportsReasoning: true,
                            supportsVision: false,
                            supportsAudioInput: false,
                            supportsAudioOutput: false,
                            inputModalities: ['text'],
                            outputModalities: ['text'],
                        },
                        runtime: {
                            toolProtocol: 'kilo_gateway',
                            apiFamily: 'kilo_gateway',
                            routedApiFamily: 'openai_compatible',
                        },
                    },
                ],
                workspacePreferences: [],
                defaults: {
                    providerId: 'kilo',
                    modelId: 'kilo-auto/frontier',
                },
                preferredWorkspaceFingerprint: 'ws_alpha',
                selectedTagIds: [],
                scopeFilter: 'all',
                sort: 'latest',
                showAllModes: false,
                groupView: 'workspace',
                isAddingTag: false,
                isDeletingWorkspaceThreads: false,
                isCreatingThread: false,
                onSelectThread: vi.fn(),
                onSelectThreadId: vi.fn(),
                onSelectSessionId: vi.fn(),
                onSelectRunId: vi.fn(),
                onToggleTagFilter: vi.fn(),
                onScopeFilterChange: vi.fn(),
                onWorkspaceFilterChange: vi.fn(),
                onSortChange: vi.fn(),
                onShowAllModesChange: vi.fn(),
                onGroupViewChange: vi.fn(),
                onSelectWorkspaceFingerprint: vi.fn(),
                upsertTag: vi.fn(() => Promise.resolve({
                    tag: {
                        id: 'tag_ui',
                        profileId: 'profile_default',
                        label: 'UI',
                        createdAt: '2026-03-12T09:00:00.000Z',
                        updatedAt: '2026-03-12T09:00:00.000Z',
                    },
                })),
                setThreadTags: vi.fn(() => Promise.resolve({ threadTags: [] })),
                setThreadFavorite: vi.fn(() => Promise.resolve({ updated: true })),
                deleteWorkspaceThreads: vi.fn(() => Promise.resolve({
                    deletedThreadIds: [],
                    deletedTagIds: [],
                    deletedConversationIds: [],
                    sessionIds: [],
                })),
                onCreateThread: vi.fn(() => Promise.resolve({
                    kind: 'created_with_starter_session' as const,
                    workspaceFingerprint: 'ws_alpha',
                })),
            })
        );

        expect(html).toContain('Sessions');
        expect(html).toContain('Search threads, workspaces, or tabs');
        expect(html).toContain('Filters');
        expect(html).toContain('Add workspace');
        expect(html).toContain('New thread');
        expect(html).not.toContain('Optional thread title');
    });
});

