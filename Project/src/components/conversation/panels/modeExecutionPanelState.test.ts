import { describe, expect, it } from 'vitest';

import {
    canGenerateDraft,
    hasUnansweredRequiredPlanQuestions,
    resolveModeExecutionDraftState,
    resolveModeExecutionPlanArtifactState,
    resolveModeExecutionPlanPhaseState,
    resolveModeExecutionPlanPanelMode,
} from '@/web/components/conversation/panels/modeExecutionPanelState';

describe('mode execution panel state', () => {
    it('preserves unsaved keyed plan drafts until the plan revision changes', () => {
        const activePlan = {
            id: 'plan_1',
            status: 'draft',
            sourcePrompt: 'Ship the first revision.',
            summaryMarkdown: 'Server Summary',
            currentRevisionId: 'prev_1',
            currentRevisionNumber: 1,
            questions: [
                {
                    id: 'scope',
                    question: 'Question?',
                    category: 'deliverable',
                    required: true,
                    answer: 'Server Answer',
                },
            ],
            items: [{ id: 'step_1', sequence: 1, description: 'Server Item', status: 'pending' }],
        } as const;

        expect(
            resolveModeExecutionDraftState({
                activePlan: activePlan as never,
                draftState: {
                    planId: 'plan_1',
                    revisionId: 'prev_1',
                    summaryDraft: 'Unsaved Summary',
                    itemsDraft: 'Unsaved Item',
                    answerByQuestionId: {
                        scope: 'Unsaved Answer',
                    },
                    planningDepth: 'simple',
                },
            })
        ).toEqual(
            expect.objectContaining({
                revisionId: 'prev_1',
                summaryDraft: 'Unsaved Summary',
                itemsDraft: 'Unsaved Item',
                answerByQuestionId: { scope: 'Unsaved Answer' },
            })
        );

        expect(
            resolveModeExecutionDraftState({
                activePlan: {
                    ...activePlan,
                    currentRevisionId: 'prev_2',
                    currentRevisionNumber: 2,
                    summaryMarkdown: 'Server Summary v2',
                    items: [{ id: 'step_1', sequence: 1, description: 'Server Item v2', status: 'pending' }],
                    questions: [
                        {
                            id: 'scope',
                            question: 'Question?',
                            category: 'deliverable',
                            required: true,
                            answer: 'Server Answer v2',
                        },
                    ],
                } as never,
                draftState: {
                    planId: 'plan_1',
                    revisionId: 'prev_1',
                    summaryDraft: 'Unsaved Summary',
                    itemsDraft: 'Unsaved Item',
                    answerByQuestionId: {
                        scope: 'Unsaved Answer',
                    },
                    planningDepth: 'simple',
                },
            })
        ).toEqual(
            expect.objectContaining({
                revisionId: 'prev_2',
                summaryDraft: 'Server Summary v2',
                itemsDraft: 'Server Item v2',
                answerByQuestionId: { scope: 'Server Answer v2' },
            })
        );
    });

    it('allows draft generation when only optional questions are unanswered', () => {
        const plan = {
            id: 'plan_1',
            status: 'draft',
            sourcePrompt: 'Ship richer intake.',
            summaryMarkdown: 'Summary',
            currentRevisionId: 'prev_1',
            currentRevisionNumber: 1,
            questions: [
                {
                    id: 'scope',
                    question: 'What should ship?',
                    category: 'deliverable',
                    required: true,
                    answer: 'Ship richer intake',
                },
                {
                    id: 'validation',
                    question: 'How should we validate it?',
                    category: 'validation',
                    required: false,
                },
            ],
            items: [],
        } as const;

        expect(hasUnansweredRequiredPlanQuestions(plan as never)).toBe(false);
        expect(canGenerateDraft(plan as never)).toBe(true);
    });

    it('projects artifact readiness and revision comparison for approved plans', () => {
        const plan = {
            id: 'plan_1',
            status: 'approved',
            summaryMarkdown: 'Summary',
            currentRevisionId: 'prev_2',
            currentRevisionNumber: 2,
            approvedRevisionId: 'prev_1',
            approvedRevisionNumber: 1,
            sourcePrompt: 'Ship the plan artifact UX.',
            questions: [],
            items: [],
        } as const;

        expect(
            resolveModeExecutionPlanPanelMode({
                activePlan: plan as never,
                panelModeState: {
                    planId: 'plan_1',
                    revisionId: 'prev_1',
                    mode: 'edit',
                },
            })
        ).toBe('artifact');
        expect(resolveModeExecutionPlanArtifactState({ activePlan: plan as never })).toEqual(
            expect.objectContaining({
                statusLabel: 'Ready to implement',
                readyToImplement: true,
                revisionLabel: 'Revision 2 (prev_2)',
                approvedRevisionLabel: 'Revision 1 (prev_1)',
                revisionComparisonLabel: 'The current revision is ahead of the last approved revision.',
                canImplement: true,
                canCancel: true,
            })
        );
    });

    it('requires passed verification before expanding the next advanced phase', () => {
        const activePlan = {
            id: 'plan_1',
            status: 'approved',
            planningDepth: 'advanced',
            summaryMarkdown: 'Approved summary',
            sourcePrompt: 'Ship the phase detail lane.',
            currentRevisionId: 'prev_2',
            currentRevisionNumber: 2,
            approvedRevisionId: 'prev_1',
            approvedRevisionNumber: 1,
            advancedSnapshot: {
                evidenceMarkdown: '### Evidence\nReady for phase expansion.',
                observationsMarkdown: '- The roadmap is approved.',
                rootCauseMarkdown: 'The plan has settled on a stable approach.',
                phases: [
                    {
                        id: 'phase_1',
                        sequence: 1,
                        title: 'Frame the plan',
                        goalMarkdown: 'Set the direction.',
                        exitCriteriaMarkdown: 'The plan is ready to detail.',
                    },
                    {
                        id: 'phase_2',
                        sequence: 2,
                        title: 'Detail the work',
                        goalMarkdown: 'Expand the next phase.',
                        exitCriteriaMarkdown: 'The next phase is ready for execution.',
                    },
                ],
            },
            phases: [
                {
                    id: 'phase_record_1',
                    planId: 'plan_1',
                    planRevisionId: 'prev_1',
                    variantId: 'pvar_main',
                    phaseOutlineId: 'phase_1',
                    phaseSequence: 1,
                    title: 'Frame the plan',
                    goalMarkdown: 'Set the direction.',
                    exitCriteriaMarkdown: 'The plan is ready to detail.',
                    status: 'implemented',
                    currentRevisionId: 'phase_rev_1',
                    currentRevisionNumber: 1,
                    implementedRevisionId: 'phase_rev_1',
                    implementedRevisionNumber: 1,
                    verificationStatus: 'failed',
                    canStartVerification: false,
                    canStartReplan: true,
                    summaryMarkdown: 'Detailed phase summary',
                    items: [],
                    createdAt: '2026-04-02T10:00:00.000Z',
                    updatedAt: '2026-04-03T10:05:00.000Z',
                    implementedAt: '2026-04-03T10:00:00.000Z',
                },
            ],
        } as const;

        expect(resolveModeExecutionPlanPhaseState({ activePlan: activePlan as never })).toEqual(
            expect.objectContaining({
                canExpandNextPhase: false,
                nextExpandablePhaseOutlineId: undefined,
            })
        );

        expect(
            resolveModeExecutionPlanPhaseState({
                activePlan: {
                    ...activePlan,
                    phases: [
                        {
                            ...activePlan.phases[0],
                            verificationStatus: 'passed',
                            canStartReplan: false,
                        },
                    ],
                } as never,
            })
        ).toEqual(
            expect.objectContaining({
                canExpandNextPhase: true,
                nextExpandablePhaseOutlineId: 'phase_2',
            })
        );
    });
});
