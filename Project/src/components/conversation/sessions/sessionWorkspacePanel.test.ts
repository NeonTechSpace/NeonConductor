import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        session: {
            getOutboxEntry: {
                useQuery: () => ({
                    data: {
                        found: true,
                        entry: {
                            prompt: 'Review this browser-picked component.',
                        },
                        attachments: [],
                    },
                    isFetching: false,
                    refetch: vi.fn(() => Promise.resolve(undefined)),
                }),
            },
            buildBrowserContextPacket: {
                useQuery: () => ({
                    data: {
                        packet: undefined,
                        summary: undefined,
                    },
                    isFetching: false,
                }),
            },
        },
    },
}));

import { SessionWorkspacePanel } from '@/web/components/conversation/sessions/sessionWorkspacePanel';
import {
    buildWorkspaceShellProjection,
    type SessionWorkspacePanelProps,
} from '@/web/components/conversation/sessions/workspace/workspacePanelModel';

import { kiloFrontierModelId } from '@/shared/kiloModels';

vi.mock('@/web/components/conversation/panels/messageFlowPanel', () => ({
    MessageFlowPanel: () => createElement('div', undefined, 'timeline'),
}));

vi.mock('@/web/components/conversation/panels/devBrowserPanel', () => ({
    DevBrowserPanel: () => createElement('div', undefined, 'dev-browser'),
}));

vi.mock('@/web/components/conversation/panels/composerActionPanel', () => ({
    ComposerActionPanel: () => createElement('div', undefined, 'composer'),
}));

vi.mock('@/web/components/conversation/panels/pendingPermissionsPanel', () => ({
    PendingPermissionsPanel: () => createElement('div', undefined, 'permissions'),
}));

vi.mock('@/web/components/conversation/panels/runChangeSummaryPanel', () => ({
    RunChangeSummaryPanel: () => createElement('div', undefined, 'changes'),
}));

vi.mock('@/web/components/conversation/panels/workspaceStatusPanel', () => ({
    WorkspaceStatusPanel: () => createElement('div', undefined, 'status'),
}));

vi.mock('@/web/components/conversation/sessions/workspaceInspector', () => ({
    WorkspaceInspector: () => createElement('aside', undefined, 'inspector'),
}));

const sessionWorkspacePanelProps: SessionWorkspacePanelProps = {
    profileId: 'profile_default',
    profiles: [{ id: 'profile_default', name: 'Local Default' }],
    selectedProfileId: 'profile_default',
    sessions: [
        {
            id: 'sess_default',
            profileId: 'profile_default',
            conversationId: 'conv_default',
            threadId: 'thr_default',
            kind: 'local',
            runStatus: 'completed',
            turnCount: 2,
            createdAt: '2026-03-12T09:00:00.000Z',
            updatedAt: '2026-03-12T09:00:00.000Z',
        },
    ],
    runs: [
        {
            id: 'run_default',
            sessionId: 'sess_default',
            profileId: 'profile_default',
            prompt: 'Prompt',
            status: 'completed',
            createdAt: '2026-03-12T09:00:00.000Z',
            updatedAt: '2026-03-12T09:30:00.000Z',
        },
    ],
    messages: [],
    partsByMessageId: new Map(),
    selectedSessionId: 'sess_default',
    selectedRunId: 'run_default',
    executionPreset: 'standard',
    workspaceScope: {
        kind: 'workspace',
        label: 'Workspace Alpha',
        absolutePath: 'C:\\WorkspaceAlpha',
        executionEnvironmentMode: 'local',
    },
    pendingPermissions: [],
    pendingImages: [],
    pendingTextFiles: [],
    readyComposerAttachments: [],
    hasBlockingPendingAttachments: false,
    isCreatingSession: false,
    isStartingRun: false,
    isResolvingPermission: false,
    canCreateSession: true,
    selectedProviderId: 'kilo',
    selectedModelId: kiloFrontierModelId,
    topLevelTab: 'chat',
    activeModeKey: 'chat',
    modes: [],
    reasoningEffort: 'medium',
    runtimeOptions: {
        reasoning: {
            effort: 'medium',
            summary: 'auto',
            includeEncrypted: false,
        },
        cache: {
            strategy: 'auto',
        },
        transport: {
            family: 'auto',
        },
    },
    selectedModelSupportsReasoning: true,
    maxImageAttachmentsPerMessage: 10,
    canAttachImages: false,
    selectedProviderStatus: {
        label: 'Kilo',
        authState: 'authenticated',
        authMethod: 'device_code',
    },
    modelOptions: [],
    runErrorMessage: undefined,
    attachedRules: [],
    missingAttachedRuleKeys: [],
    attachedSkills: [],
    missingAttachedSkillKeys: [],
    outboxEntries: [
        {
            id: 'outbox_default',
            profileId: 'profile_default',
            sessionId: 'sess_default',
            state: 'queued',
            sequence: 0,
            prompt: 'Review this browser-picked component.',
            attachmentIds: [],
            browserContextSummary: {
                targetUrl: 'http://localhost:3000',
                targetLabel: 'localhost:3000',
                selectedElementCount: 2,
                commentCount: 3,
                captureCount: 1,
                enrichmentMode: 'dom_only',
                designerDraftCount: 0,
                designerPatchCount: 0,
                designerApplyIntentStatus: 'none',
                digest: 'browserctx-1',
            },
            steeringSnapshot: {
                profileId: 'profile_default',
                sessionId: 'sess_default',
                topLevelTab: 'chat',
                modeKey: 'chat',
                providerId: 'kilo',
                modelId: kiloFrontierModelId,
                runtimeOptions: {
                    reasoning: {
                        effort: 'medium',
                        summary: 'auto',
                        includeEncrypted: false,
                    },
                    cache: {
                        strategy: 'auto',
                    },
                    transport: {
                        family: 'auto',
                    },
                },
                createdAt: '2026-03-12T09:00:00.000Z',
            },
            latestRunContract: {
                steeringSnapshot: {
                    profileId: 'profile_default',
                    sessionId: 'sess_default',
                    topLevelTab: 'chat',
                    modeKey: 'chat',
                    providerId: 'kilo',
                    modelId: kiloFrontierModelId,
                    runtimeOptions: {
                        reasoning: {
                            effort: 'medium',
                            summary: 'auto',
                            includeEncrypted: false,
                        },
                        cache: {
                            strategy: 'auto',
                        },
                        transport: {
                            family: 'auto',
                        },
                    },
                    createdAt: '2026-03-12T09:00:00.000Z',
                },
                preparedContext: {
                    contributors: [],
                    digest: {
                        fullDigest: 'runctx-1',
                        contributorDigest: 'ctxcontributors-1',
                        checkpoints: {
                            bootstrap: {
                                checkpoint: 'bootstrap',
                                includedContributorCount: 0,
                                excludedContributorCount: 0,
                                digest: 'ctxchk-bootstrap-1',
                                active: true,
                            },
                            post_compaction_reseed: {
                                checkpoint: 'post_compaction_reseed',
                                includedContributorCount: 0,
                                excludedContributorCount: 0,
                                digest: 'ctxchk-post-1',
                                active: false,
                            },
                        },
                        cacheabilityHint: 'cacheable',
                    },
                    activeContributorCount: 0,
                    compactionReseedActive: false,
                },
                cache: {
                    digest: 'runctx-1',
                    strategy: 'auto',
                    cacheabilityHint: 'cacheable',
                },
                trustSummary: {
                    contributorCountByTrustLevel: {
                        trusted_instruction: 1,
                        user_input: 4,
                        workspace_content: 0,
                        external_untrusted: 0,
                        promoted_fact: 0,
                    },
                    contributorCountByInstructionAuthority: {
                        instruct: 2,
                        contextualize: 2,
                        retrieval_only: 0,
                    },
                },
                dynamicExpansionSummary: {
                    resolvedCount: 0,
                    blockedCount: 0,
                    omittedCount: 0,
                    failedCount: 0,
                    invalidCount: 0,
                },
                attachmentSummary: {
                    totalCount: 0,
                    imageAttachmentCount: 0,
                    textFileAttachmentCount: 0,
                    totalByteSize: 0,
                },
                browserContextSummary: {
                    targetUrl: 'http://localhost:3000',
                    targetLabel: 'localhost:3000',
                    selectedElementCount: 2,
                    commentCount: 3,
                    captureCount: 1,
                    enrichmentMode: 'dom_only',
                    designerDraftCount: 0,
                    designerPatchCount: 0,
                    designerApplyIntentStatus: 'none',
                    digest: 'browserctx-1',
                },
                diffFromLastCompatible: {
                    compatible: true,
                    hasMaterialChanges: false,
                    items: [],
                },
            },
            createdAt: '2026-03-12T09:00:00.000Z',
            updatedAt: '2026-03-12T09:00:00.000Z',
        },
    ],
    selectedOutboxEntry: {
        id: 'outbox_default',
        profileId: 'profile_default',
        sessionId: 'sess_default',
        state: 'queued',
        sequence: 0,
        prompt: 'Review this browser-picked component.',
        attachmentIds: [],
        browserContextSummary: {
            targetUrl: 'http://localhost:3000',
            targetLabel: 'localhost:3000',
            selectedElementCount: 2,
            commentCount: 3,
            captureCount: 1,
            enrichmentMode: 'dom_only',
            designerDraftCount: 0,
            designerPatchCount: 0,
            designerApplyIntentStatus: 'none',
            digest: 'browserctx-1',
        },
        steeringSnapshot: {
            profileId: 'profile_default',
            sessionId: 'sess_default',
            topLevelTab: 'chat',
            modeKey: 'chat',
            providerId: 'kilo',
            modelId: kiloFrontierModelId,
            runtimeOptions: {
                reasoning: {
                    effort: 'medium',
                    summary: 'auto',
                    includeEncrypted: false,
                },
                cache: {
                    strategy: 'auto',
                },
                transport: {
                    family: 'auto',
                },
            },
            createdAt: '2026-03-12T09:00:00.000Z',
        },
        createdAt: '2026-03-12T09:00:00.000Z',
        updatedAt: '2026-03-12T09:00:00.000Z',
    },
    executionReceipt: {
        id: 'rcpt_default',
        profileId: 'profile_default',
        sessionId: 'sess_default',
        runId: 'run_default',
        contract: {
            steeringSnapshot: {
                profileId: 'profile_default',
                sessionId: 'sess_default',
                topLevelTab: 'chat',
                modeKey: 'chat',
                providerId: 'kilo',
                modelId: kiloFrontierModelId,
                runtimeOptions: {
                    reasoning: {
                        effort: 'medium',
                        summary: 'auto',
                        includeEncrypted: false,
                    },
                    cache: {
                        strategy: 'auto',
                    },
                    transport: {
                        family: 'auto',
                    },
                },
                createdAt: '2026-03-12T09:00:00.000Z',
            },
            preparedContext: {
                contributors: [],
                digest: {
                    fullDigest: 'runctx-1',
                    contributorDigest: 'ctxcontributors-1',
                    checkpoints: {
                        bootstrap: {
                            checkpoint: 'bootstrap',
                            includedContributorCount: 0,
                            excludedContributorCount: 0,
                            digest: 'ctxchk-bootstrap-1',
                            active: true,
                        },
                        post_compaction_reseed: {
                            checkpoint: 'post_compaction_reseed',
                            includedContributorCount: 0,
                            excludedContributorCount: 0,
                            digest: 'ctxchk-post-1',
                            active: false,
                        },
                    },
                    cacheabilityHint: 'cacheable',
                },
                activeContributorCount: 0,
                compactionReseedActive: false,
            },
            cache: {
                digest: 'runctx-1',
                strategy: 'auto',
                cacheabilityHint: 'cacheable',
            },
            trustSummary: {
                contributorCountByTrustLevel: {
                    trusted_instruction: 1,
                    user_input: 4,
                    workspace_content: 0,
                    external_untrusted: 0,
                    promoted_fact: 0,
                },
                contributorCountByInstructionAuthority: {
                    instruct: 2,
                    contextualize: 2,
                    retrieval_only: 0,
                },
            },
            dynamicExpansionSummary: {
                resolvedCount: 0,
                blockedCount: 0,
                omittedCount: 0,
                failedCount: 0,
                invalidCount: 0,
            },
            attachmentSummary: {
                totalCount: 0,
                imageAttachmentCount: 0,
                textFileAttachmentCount: 0,
                totalByteSize: 0,
            },
            browserContextSummary: {
                targetUrl: 'http://localhost:3000',
                targetLabel: 'localhost:3000',
                selectedElementCount: 2,
                commentCount: 3,
                captureCount: 1,
                enrichmentMode: 'dom_only',
                designerDraftCount: 0,
                designerPatchCount: 0,
                designerApplyIntentStatus: 'none',
                digest: 'browserctx-1',
            },
            diffFromLastCompatible: {
                compatible: true,
                hasMaterialChanges: false,
                items: [],
            },
        },
        approvalsUsed: [],
        toolsInvoked: [],
        memoryHitCount: 0,
        cacheResult: {
            applied: false,
        },
        usageSummary: {},
        terminalOutcome: {
            kind: 'completed',
        },
        createdAt: '2026-03-12T09:30:00.000Z',
    },
    onSelectSession: vi.fn(),
    onSelectRun: vi.fn(),
    onProfileChange: vi.fn(),
    onProviderChange: vi.fn(),
    onModelChange: vi.fn(),
    onReasoningEffortChange: vi.fn(),
    onModeChange: vi.fn(),
    onCreateSession: vi.fn(),
    onPromptEdited: vi.fn(),
    onAddFiles: vi.fn(),
    onRemovePendingImage: vi.fn(),
    onRemovePendingTextFile: vi.fn(),
    onRetryPendingImage: vi.fn(),
    onSubmitPrompt: vi.fn(),
    onResolvePermission: vi.fn(),
};

describe('session workspace panel layout', () => {
    it('uses compact selectors and keeps the inspector closed by default', () => {
        const html = renderToStaticMarkup(createElement(SessionWorkspacePanel, sessionWorkspacePanelProps));

        expect(html).toContain('Workspace selection');
        expect(html).toContain('Show Inspector');
        expect(html).toContain('Selected thread');
        expect(html).toContain('Thread');
        expect(html).toContain('Run');
        expect(html).toContain('2 turns · completed');
        expect(html).not.toContain('inspector');
    });

    it('builds a workspace shell projection from panel inputs', () => {
        const projection = buildWorkspaceShellProjection(sessionWorkspacePanelProps);
        const queuedReviewSection = projection.inspector.sections.find((section) => section.id === 'selected-outbox-entry');
        const executionReceiptSection = projection.inspector.sections.find((section) => section.id === 'execution-receipt');
        const queuedReviewMarkup = queuedReviewSection
            ? renderToStaticMarkup(queuedReviewSection.content as ReturnType<typeof createElement>)
            : '';
        const executionReceiptMarkup = executionReceiptSection
            ? renderToStaticMarkup(executionReceiptSection.content as ReturnType<typeof createElement>)
            : '';

        expect(projection.header.selectedSession?.id).toBe('sess_default');
        expect(projection.header.selectedRun?.id).toBe('run_default');
        expect(projection.inspector.sections.map((section) => section.id)).toEqual([
            'workspace-status',
            'run-changes',
            'execution-receipt',
            'selected-outbox-entry',
            'pending-permissions',
        ]);
        expect(queuedReviewMarkup).toContain('Browser context: 3 comments · 2 elements');
        expect(executionReceiptMarkup).toContain('Browser context: 3 comments · 2 elements');
    });
});
