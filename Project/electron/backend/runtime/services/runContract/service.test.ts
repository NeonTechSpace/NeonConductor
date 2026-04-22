import { describe, expect, it } from 'vitest';

import { createDefaultPreparedContextModeOverrides } from '@/app/backend/runtime/contracts/types/prompt';
import { prepareRunContractPreview } from '@/app/backend/runtime/services/runContract/service';
import type { PreparedRunStart, StartRunInput } from '@/app/backend/runtime/services/runExecution/types';

import { kiloFrontierModelId } from '@/shared/kiloModels';

function createPreparedRunStart(): PreparedRunStart {
    return {
        resolvedMode: {
            mode: {
                id: 'mode_chat_default',
                profileId: 'profile_default',
                modeKey: 'chat',
                label: 'Chat',
                topLevelTab: 'chat',
                assetKey: 'builtin:chat',
                prompt: {
                    roleDefinition: 'Prompt',
                },
                promptLayerOverrides: createDefaultPreparedContextModeOverrides(),
                authoringRole: 'chat',
                roleTemplate: 'chat/default',
                internalModelRole: 'chat',
                delegatedOnly: false,
                sessionSelectable: true,
                executionPolicy: {},
                source: 'builtin',
                sourceKind: 'system_seed',
                scope: 'global',
                enabled: true,
                precedence: 0,
                createdAt: '2026-04-22T09:55:00.000Z',
                updatedAt: '2026-04-22T09:55:00.000Z',
            },
        },
        activeTarget: {
            providerId: 'kilo',
            modelId: kiloFrontierModelId,
        },
        runtimeDescriptor: {
            toolProtocol: 'kilo_gateway',
            apiFamily: 'kilo_gateway',
            routedApiFamily: 'openai_compatible',
        },
        resolvedAuth: {
            authMethod: 'none',
        },
        resolvedCache: {
            strategy: 'auto',
            applied: false,
        },
        initialTransport: {
            requested: 'auto',
            selected: 'kilo_gateway',
            degraded: false,
        },
        toolDefinitions: [],
        runContext: {
            messages: [],
            digest: 'runctx-browser-test',
            preparedContext: {
                contributors: [],
                digest: {
                    fullDigest: 'runctx-browser-test',
                    contributorDigest: 'ctxcontributors-browser-test',
                    checkpoints: {
                        bootstrap: {
                            checkpoint: 'bootstrap',
                            includedContributorCount: 0,
                            excludedContributorCount: 0,
                            digest: 'ctxchk-bootstrap-browser-test',
                            active: true,
                        },
                        post_compaction_reseed: {
                            checkpoint: 'post_compaction_reseed',
                            includedContributorCount: 0,
                            excludedContributorCount: 0,
                            digest: 'ctxchk-post-browser-test',
                            active: false,
                        },
                    },
                    cacheabilityHint: 'cacheable',
                },
                activeContributorCount: 0,
                compactionReseedActive: false,
            },
        },
    };
}

function createStartRunInput(commentText: string): StartRunInput {
    return {
        profileId: 'profile_default',
        sessionId: 'sess_default',
        prompt: 'Review this change.',
        topLevelTab: 'chat',
        modeKey: 'chat',
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
        browserContext: {
            target: {
                scheme: 'http',
                host: 'localhost',
                port: 3000,
                path: '/',
                sourceKind: 'manual',
                validation: {
                    status: 'allowed',
                    normalizedUrl: 'http://localhost:3000/',
                    resolvedAddresses: ['127.0.0.1'],
                },
                browserAvailability: 'available',
                currentPage: {
                    url: 'http://localhost:3000/',
                    pageIdentity: 'http://localhost:3000/',
                    title: 'Local App',
                    isLoading: false,
                    canGoBack: false,
                    canGoForward: false,
                },
            },
            selections: [
                {
                    id: 'bsel_default',
                    pageIdentity: 'http://localhost:3000/',
                    pageUrl: 'http://localhost:3000/',
                    pageTitle: 'Local App',
                    selector: {
                        primary: '#hero button',
                        path: ['#hero', 'button'],
                    },
                    ancestryTrail: [],
                    accessibleLabel: 'Deploy',
                    accessibleRole: 'button',
                    textExcerpt: 'Deploy now',
                    bounds: {
                        x: 16,
                        y: 20,
                        width: 180,
                        height: 48,
                    },
                    enrichmentMode: 'dom_only',
                    stale: false,
                    createdAt: '2026-04-22T10:00:00.000Z',
                },
            ],
            comments: [
                {
                    draftId: 'bcmt_default',
                    selectionId: 'bsel_default',
                    pageIdentity: 'http://localhost:3000/',
                    commentText,
                    sequence: 0,
                    createdAt: '2026-04-22T10:00:00.000Z',
                    updatedAt: '2026-04-22T10:00:00.000Z',
                },
            ],
            cropAttachmentIds: ['att_browser_crop'],
            designerDrafts: [],
            enrichmentMode: 'dom_only',
        },
    };
}

describe('runContract service', () => {
    it('includes browser summary and trust counts for browser packets', () => {
        const preview = prepareRunContractPreview({
            startInput: createStartRunInput('Tighten the button spacing.'),
            prepared: createPreparedRunStart(),
        });

        expect(preview?.browserContextSummary).toMatchObject({
            targetUrl: 'http://localhost:3000/',
            selectedElementCount: 1,
            commentCount: 1,
            captureCount: 1,
        });
        expect(preview?.trustSummary.contributorCountByTrustLevel.user_input).toBe(4);
        expect(preview?.trustSummary.contributorCountByInstructionAuthority.instruct).toBe(2);
        expect(preview?.trustSummary.contributorCountByInstructionAuthority.contextualize).toBe(2);
    });

    it('treats browser packet changes as material compatibility drift', () => {
        const previousContract = prepareRunContractPreview({
            startInput: createStartRunInput('Tighten the button spacing.'),
            prepared: createPreparedRunStart(),
        });
        const nextContract = prepareRunContractPreview({
            startInput: createStartRunInput('Make the button full width on mobile.'),
            prepared: createPreparedRunStart(),
            ...(previousContract ? { previousCompatibleContract: previousContract } : {}),
        });

        expect(nextContract?.diffFromLastCompatible?.hasMaterialChanges).toBe(true);
        expect(nextContract?.diffFromLastCompatible?.items.some((item) => item.field === 'browserContextDigest')).toBe(
            true
        );
    });
});
