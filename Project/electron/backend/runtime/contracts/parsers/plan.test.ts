import { describe, expect, it } from 'vitest';

import {
    parsePlanAbortResearchBatchInput,
    parsePlanReviseInput,
    parsePlanStartInput,
    parsePlanStartResearchBatchInput,
} from '@/app/backend/runtime/contracts/parsers/plan';

describe('plan parsers', () => {
    it('parses planning depth on plan start input', () => {
        expect(
            parsePlanStartInput({
                profileId: 'profile_default',
                sessionId: 'sess_1',
                topLevelTab: 'agent',
                modeKey: 'plan',
                prompt: 'Draft an advanced plan',
                planningDepth: 'advanced',
            })
        ).toMatchObject({
            profileId: 'profile_default',
            sessionId: 'sess_1',
            topLevelTab: 'agent',
            modeKey: 'plan',
            prompt: 'Draft an advanced plan',
            planningDepth: 'advanced',
        });
    });

    it('parses an advanced snapshot on revise input', () => {
        expect(
            parsePlanReviseInput({
                profileId: 'profile_default',
                planId: 'plan_1',
                summaryMarkdown: '# Revised plan',
                items: [
                    {
                        description: 'Inspect the current plan surface.',
                    },
                ],
                advancedSnapshot: {
                    evidenceMarkdown: 'evidence',
                    observationsMarkdown: 'observations',
                    rootCauseMarkdown: 'root cause',
                    phases: [
                        {
                            id: 'phase_1',
                            sequence: 1,
                            title: 'Scope and evidence',
                            goalMarkdown: 'goal',
                            exitCriteriaMarkdown: 'exit',
                        },
                    ],
                },
            })
        ).toMatchObject({
            profileId: 'profile_default',
            planId: 'plan_1',
            summaryMarkdown: '# Revised plan',
            items: [{ description: 'Inspect the current plan surface.' }],
            advancedSnapshot: expect.objectContaining({
                evidenceMarkdown: 'evidence',
                phases: expect.arrayContaining([
                    expect.objectContaining({
                        id: 'phase_1',
                        sequence: 1,
                    }),
                ]),
            }),
        });
    });

    it('parses planner research start input with runtime options', () => {
        expect(
            parsePlanStartResearchBatchInput({
                profileId: 'profile_default',
                planId: 'plan_1',
                promptMarkdown: 'Investigate the hidden risks in this rollout plan.',
                workerCount: 2,
                providerId: 'openai',
                modelId: 'gpt-5',
                workspaceFingerprint: 'wsf_research',
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
            })
        ).toMatchObject({
            profileId: 'profile_default',
            planId: 'plan_1',
            promptMarkdown: 'Investigate the hidden risks in this rollout plan.',
            workerCount: 2,
            providerId: 'openai',
            modelId: 'gpt-5',
            workspaceFingerprint: 'wsf_research',
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
        });
    });

    it('parses planner research batch abort input with typed research batch ids', () => {
        expect(
            parsePlanAbortResearchBatchInput({
                profileId: 'profile_default',
                planId: 'plan_1',
                researchBatchId: 'prb_1',
            })
        ).toMatchObject({
            profileId: 'profile_default',
            planId: 'plan_1',
            researchBatchId: 'prb_1',
        });
    });

    it('fails closed on invalid planner research worker counts', () => {
        expect(() =>
            parsePlanStartResearchBatchInput({
                profileId: 'profile_default',
                planId: 'plan_1',
                promptMarkdown: 'Investigate',
                workerCount: 0,
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
            })
        ).toThrow(/workerCount/i);
    });
});
