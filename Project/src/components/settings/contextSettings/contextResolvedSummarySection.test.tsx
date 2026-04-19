import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ContextResolvedSummarySection } from '@/web/components/settings/contextSettings/contextResolvedSummarySection';

describe('ContextResolvedSummarySection', () => {
    it('renders prepared-context checkpoint and contributor diagnostics', () => {
        const html = renderToStaticMarkup(
            createElement(ContextResolvedSummarySection, {
                defaultProvider: {
                    id: 'openai',
                    label: 'OpenAI',
                    supportsByok: true,
                },
                defaultModel: {
                    id: 'openai/gpt-5',
                    providerId: 'openai',
                    label: 'GPT-5',
                    updatedAt: '2026-01-01T00:00:00.000Z',
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
                        toolProtocol: 'openai_responses',
                        apiFamily: 'openai_compatible',
                    },
                },
                state: {
                    policy: {
                        enabled: true,
                        profileId: 'profile_default',
                        providerId: 'openai',
                        modelId: 'openai/gpt-5',
                        limits: {
                            profileId: 'profile_default',
                            providerId: 'openai',
                            modelId: 'openai/gpt-5',
                            contextLength: 128000,
                            maxOutputTokens: 8192,
                            contextLengthSource: 'static',
                            maxOutputTokensSource: 'static',
                            source: 'static',
                            modelLimitsKnown: true,
                        },
                        mode: 'percent',
                        percent: 80,
                        thresholdTokens: 80000,
                        usableInputBudgetTokens: 100000,
                        safetyBufferTokens: 20000,
                    },
                    countingMode: 'estimated',
                    compactable: true,
                    preparedContext: {
                        activeContributorCount: 2,
                        compactionReseedActive: true,
                        contributors: [
                            {
                                id: 'app:bootstrap',
                                kind: 'prompt_layer',
                                group: 'shared_prompt_layer',
                                label: 'App instructions',
                                source: {
                                    kind: 'prompt_layer',
                                    key: 'app_global_instructions',
                                    label: 'App instructions',
                                },
                                inclusionState: 'included',
                                inclusionReason: 'Included by the profile default.',
                                injectionCheckpoint: 'bootstrap',
                                resolvedOrder: 0,
                                countMode: 'estimated',
                                tokenCount: 42,
                                digest: 'ctxcontrib-app',
                            },
                            {
                                id: 'compaction_summary',
                                kind: 'compaction_summary',
                                group: 'compaction',
                                label: 'Compacted conversation summary',
                                source: {
                                    kind: 'compaction',
                                    key: 'session_compaction_summary',
                                    label: 'Compacted conversation summary',
                                },
                                inclusionState: 'included',
                                inclusionReason: 'Included because session compaction replay is active.',
                                injectionCheckpoint: 'post_compaction_reseed',
                                resolvedOrder: 0,
                                countMode: 'estimated',
                                tokenCount: 12,
                                digest: 'ctxcontrib-compaction',
                            },
                        ],
                        digest: {
                            fullDigest: 'runctx-full',
                            contributorDigest: 'ctxcontributors-full',
                            cacheabilityHint: 'Prepared context is less stable while post-compaction reseed is active.',
                            checkpoints: {
                                bootstrap: {
                                    checkpoint: 'bootstrap',
                                    includedContributorCount: 1,
                                    excludedContributorCount: 0,
                                    estimatedTokenCount: 42,
                                    digest: 'ctxchk-bootstrap',
                                    active: true,
                                },
                                post_compaction_reseed: {
                                    checkpoint: 'post_compaction_reseed',
                                    includedContributorCount: 1,
                                    excludedContributorCount: 0,
                                    estimatedTokenCount: 12,
                                    digest: 'ctxchk-post',
                                    active: true,
                                },
                            },
                        },
                    },
                    estimate: {
                        providerId: 'openai',
                        modelId: 'openai/gpt-5',
                        mode: 'estimated',
                        totalTokens: 200,
                        parts: [],
                    },
                },
            })
        );

        expect(html).toContain('Prepared Context Preview');
        expect(html).toContain('App instructions');
        expect(html).toContain('Compacted conversation summary');
        expect(html).toContain('Prepared context is less stable while post-compaction reseed is active.');
        expect(html).toContain('ctxcontributors-full');
        expect(html).toContain('ctxchk-post');
    });
});
