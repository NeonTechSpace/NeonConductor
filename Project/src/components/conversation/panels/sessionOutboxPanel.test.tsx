import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { SessionOutboxPanel } from '@/web/components/conversation/panels/sessionOutboxPanel';

import type { SessionOutboxEntry } from '@/shared/contracts';
import { kiloFrontierModelId } from '@/shared/kiloModels';

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        session: {
            getOutboxEntry: {
                useQuery: () => ({
                    data: undefined,
                    isFetching: false,
                    refetch: vi.fn(),
                }),
            },
            buildBrowserContextPacket: {
                useQuery: () => ({
                    data: undefined,
                }),
            },
            prepareDocumentAttachment: {
                useMutation: () => ({
                    mutateAsync: vi.fn(),
                }),
            },
        },
        profile: {
            getFileReadGuardSettings: {
                useQuery: () => ({
                    data: undefined,
                }),
            },
        },
    },
}));

function createPausedOutboxEntry(): SessionOutboxEntry {
    return {
        id: 'outbox_review',
        profileId: 'profile_default',
        sessionId: 'sess_default',
        state: 'paused_for_review',
        sequence: 0,
        prompt: 'Review the scheduled sandbox target.',
        attachmentIds: [],
        browserContextSummary: {
            targetUrl: 'http://localhost:3000/',
            targetLabel: 'localhost:3000',
            selectedElementCount: 1,
            commentCount: 0,
            captureCount: 0,
            enrichmentMode: 'react_source_enriched',
            designerDraftCount: 1,
            designerPatchCount: 2,
            designerApplyIntentStatus: 'apply_with_agent',
            designDiagnosticCount: 2,
            designDiagnosticWarningCount: 1,
            designDiagnosticErrorCount: 1,
            digest: 'browserctx-outbox',
        },
        steeringSnapshot: {
            profileId: 'profile_default',
            sessionId: 'sess_default',
            topLevelTab: 'agent',
            modeKey: 'code',
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
            createdAt: '2026-04-30T10:00:00.000Z',
        },
        latestRunContract: {
            steeringSnapshot: {
                profileId: 'profile_default',
                sessionId: 'sess_default',
                topLevelTab: 'agent',
                modeKey: 'code',
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
                createdAt: '2026-04-30T10:00:00.000Z',
            },
            executionTarget: {
                kind: 'scheduled_sandbox',
                label: 'Managed sandbox from Workspace',
                materializationState: 'scheduled_on_start',
                workspaceFingerprint: 'ws_review',
                workspaceLabel: 'Workspace',
                workspacePath: 'C:\\Workspace\\Review',
                absolutePath: 'C:\\Workspace\\Review',
            },
            preparedContext: {
                contributors: [],
                digest: {
                    fullDigest: 'runctx-review',
                    contributorDigest: 'ctxcontributors-review',
                    checkpoints: {
                        bootstrap: {
                            checkpoint: 'bootstrap',
                            includedContributorCount: 0,
                            excludedContributorCount: 0,
                            digest: 'ctxchk-bootstrap-review',
                            active: true,
                        },
                        post_compaction_reseed: {
                            checkpoint: 'post_compaction_reseed',
                            includedContributorCount: 0,
                            excludedContributorCount: 0,
                            digest: 'ctxchk-post-review',
                            active: false,
                        },
                    },
                    cacheabilityHint: 'cacheable',
                },
                activeContributorCount: 0,
                compactionReseedActive: false,
            },
            cache: {
                digest: 'runctx-review',
                strategy: 'auto',
                cacheabilityHint: 'cacheable',
            },
            trustSummary: {
                contributorCountByTrustLevel: {
                    trusted_instruction: 0,
                    user_input: 1,
                    workspace_content: 0,
                    external_untrusted: 0,
                    promoted_fact: 0,
                },
                contributorCountByInstructionAuthority: {
                    instruct: 0,
                    contextualize: 1,
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
            diffFromLastCompatible: {
                compatible: false,
                hasMaterialChanges: true,
                items: [
                    {
                        field: 'executionTargetKind',
                        reason: 'The resolved execution target kind changed.',
                        material: true,
                    },
                ],
            },
        },
        pausedReason: 'Review material drift before resuming this queued run.',
        createdAt: '2026-04-30T10:00:00.000Z',
        updatedAt: '2026-04-30T10:00:00.000Z',
    };
}

describe('SessionOutboxPanel', () => {
    it('renders execution target review details and an accept-contract action for paused entries', () => {
        const html = renderToStaticMarkup(
            createElement(SessionOutboxPanel, {
                entries: [createPausedOutboxEntry()],
                onUpdateEntry: vi.fn(),
            })
        );

        expect(html).toContain('Accept Contract');
        expect(html).toContain('Managed sandbox scheduled from C:\\Workspace\\Review');
        expect(html).toContain('Queued run paused for review');
        expect(html).toContain('Run contract changed before execution');
        expect(html).toContain('Design diagnostics: 2 total');
        expect(html).toContain('executionTargetKind');
    });
});
