import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ModeExecutionPanel } from '@/web/components/conversation/panels/modeExecutionPanel';
import { PlanPhaseDetailSection } from '@/web/components/conversation/panels/modeExecutionPanelPhaseSections';
import {
    canGenerateDraft,
    hasUnansweredRequiredPlanQuestions,
    resolveModeExecutionDraftState,
    resolveModeExecutionPlanArtifactState,
    resolveModeExecutionPlanPhaseState,
    resolveModeExecutionPlanPanelMode,
    resolveModeExecutionOrchestratorPanelState,
} from '@/web/components/conversation/panels/modeExecutionPanelState';

function createActionController() {
    return {
        isPlanMutating: false,
        isOrchestratorMutating: false,
        onAnswerQuestion: vi.fn(),
        onStartResearchBatch: vi.fn(),
        onRevisePlan: vi.fn(),
        onEnterAdvancedPlanning: vi.fn(),
        onCreateVariant: vi.fn(),
        onActivateVariant: vi.fn(),
        onResumeFromRevision: vi.fn(),
        onResolveFollowUp: vi.fn(),
        onAbortResearchBatch: vi.fn(),
        onGenerateDraft: vi.fn(),
        onCancelPlan: vi.fn(),
        onApprovePlan: vi.fn(),
        onImplementPlan: vi.fn(),
        onAbortOrchestrator: vi.fn(),
        onExpandNextPhase: vi.fn(),
        onRevisePhase: vi.fn(),
        onApprovePhase: vi.fn(),
        onImplementPhase: vi.fn(),
        onCancelPhase: vi.fn(),
    };
}

describe('resolveModeExecutionDraftState', () => {
    it('keeps keyed plan drafts instead of replacing them with refreshed plan data', () => {
        const activePlan = {
            id: 'plan_1',
            status: 'draft',
            sourcePrompt: 'Ship the first revision.',
            summaryMarkdown: 'Server Summary',
            currentRevisionId: 'prev_1',
            currentRevisionNumber: 1,
            questions: [
                {
                    id: 'q_1',
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
                        q_1: 'Unsaved Answer',
                    },
                    planningDepth: 'simple',
                },
            })
        ).toEqual({
            planId: 'plan_1',
            revisionId: 'prev_1',
            summaryDraft: 'Unsaved Summary',
            itemsDraft: 'Unsaved Item',
            answerByQuestionId: {
                q_1: 'Unsaved Answer',
            },
            planningDepth: 'simple',
        });
    });

    it('refreshes local draft state when the plan revision changes', () => {
        const activePlan = {
            id: 'plan_1',
            status: 'draft',
            sourcePrompt: 'Ship the refreshed revision.',
            summaryMarkdown: 'Server Summary v2',
            currentRevisionId: 'prev_2',
            currentRevisionNumber: 2,
            questions: [
                {
                    id: 'scope',
                    question: 'Question?',
                    category: 'deliverable',
                    required: true,
                    answer: 'Server Answer v2',
                },
            ],
            items: [{ id: 'step_1', sequence: 1, description: 'Server Item v2', status: 'pending' }],
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
        ).toEqual({
            planId: 'plan_1',
            revisionId: 'prev_2',
            summaryDraft: 'Server Summary v2',
            itemsDraft: 'Server Item v2',
            answerByQuestionId: {
                scope: 'Server Answer v2',
            },
            planningDepth: 'simple',
        });
    });

    it('treats optional unanswered questions as non-blocking for draft generation', () => {
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

    it('defaults the plan panel to artifact mode when a revision is visible', () => {
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
    });

    it('projects current vs approved revision state for the structured artifact view', () => {
        const plan = {
            id: 'plan_1',
            status: 'approved',
            summaryMarkdown: 'Summary',
            currentRevisionId: 'prev_2',
            currentRevisionNumber: 2,
            approvedRevisionId: 'prev_1',
            approvedRevisionNumber: 1,
            sourcePrompt: 'Ship the plan artifact UX.',
            questions: [
                {
                    id: 'scope',
                    question: 'What should ship?',
                    category: 'deliverable',
                    required: true,
                    answer: 'Ship the artifact view.',
                },
            ],
            items: [],
        } as const;

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

    it('projects the open phase detail from the approved advanced roadmap', () => {
        const phaseState = resolveModeExecutionPlanPhaseState({
            activePlan: {
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
                        status: 'approved',
                        currentRevisionId: 'phase_rev_1',
                        currentRevisionNumber: 1,
                        summaryMarkdown: 'Detailed phase summary',
                        items: [
                            {
                                id: 'phase_item_1',
                                sequence: 1,
                                description: 'Detailed phase item',
                                status: 'pending',
                            },
                        ],
                        createdAt: '2026-04-02T10:00:00.000Z',
                        updatedAt: '2026-04-02T10:05:00.000Z',
                    },
                ],
            } as never,
        });

        expect(phaseState).toEqual(
            expect.objectContaining({
                hasOpenPhaseDetail: true,
                canExpandNextPhase: false,
                currentPhase: expect.objectContaining({
                    title: 'Frame the plan',
                    status: 'approved',
                    summaryMarkdown: 'Detailed phase summary',
                }),
            })
        );
    });

    it('renders orchestrator strategy and delegated worker lane status', () => {
        const html = renderToStaticMarkup(
            createElement(ModeExecutionPanel, {
                topLevelTab: 'orchestrator',
                showPlanSurface: true,
                showOrchestratorSurface: true,
                planningDepthSelection: 'simple',
                isLoadingPlan: false,
                actionController: createActionController(),
                selectedExecutionStrategy: 'parallel',
                canConfigureExecutionStrategy: true,
                onPlanningDepthSelectionChange: vi.fn(),
                activePlan: {
                    id: 'plan_1',
                    status: 'approved',
                    summaryMarkdown: 'Approved summary',
                    sourcePrompt: 'Ship the artifact UX',
                    currentRevisionId: 'prev_1',
                    currentRevisionNumber: 2,
                    questions: [
                        {
                            id: 'scope',
                            question: 'What exact deliverable should this plan produce first?',
                            category: 'deliverable',
                            required: true,
                            placeholderText: 'Name the exact artifact.',
                            helpText: 'Answer with the concrete first outcome.',
                            answer: 'Ship the richer intake flow',
                        },
                    ],
                    items: [{ id: 'step_1', sequence: 1, description: 'Child task', status: 'pending' }],
                } as never,
                orchestratorView: {
                    run: {
                        id: 'orch_1',
                        status: 'running',
                        executionStrategy: 'parallel',
                    },
                    steps: [
                        {
                            id: 'step_1',
                            sequence: 1,
                            description: 'Delegate to worker lane',
                            status: 'running',
                            childThreadId: 'thr_1',
                            childSessionId: 'sess_1',
                            activeRunId: 'run_1',
                        },
                    ],
                },
                onExecutionStrategyChange: vi.fn(),
                onSelectChildThread: vi.fn(),
            })
        );

        expect(html).toContain('Strategy');
        expect(html).toContain('Parallel');
        expect(html).toContain('Open worker lane');
        expect(html).toContain('Active run run_1');
        expect(html).toContain('Current revision');
        expect(html).toContain('Revision 2 (prev_1)');
        expect(html).toContain('Questions');
        expect(html).toContain('Summary');
        expect(html).toContain('Ordered Items');
        expect(html).toContain('Revise');
        expect(html).toContain('Implement');
        expect(html).toContain('Cancel');
    });

    it('shows the simple and advanced planning selector before the first plan starts', () => {
        const html = renderToStaticMarkup(
            createElement(ModeExecutionPanel, {
                topLevelTab: 'agent',
                showPlanSurface: true,
                showOrchestratorSurface: false,
                planningDepthSelection: 'simple',
                isLoadingPlan: false,
                actionController: createActionController(),
                selectedExecutionStrategy: 'delegate',
                canConfigureExecutionStrategy: false,
                onPlanningDepthSelectionChange: vi.fn(),
                onExecutionStrategyChange: vi.fn(),
            })
        );

        expect(html).toContain('Planning depth');
        expect(html).toContain('Simple planning');
        expect(html).toContain('Advanced planning');
        expect(html).toContain('Add evidence, observations, root cause, and a structured phase outline.');
    });

    it('renders advanced planning badge and scaffold sections when advanced planning is selected', () => {
        const html = renderToStaticMarkup(
            createElement(ModeExecutionPanel, {
                topLevelTab: 'agent',
                showPlanSurface: true,
                showOrchestratorSurface: false,
                planningDepthSelection: 'advanced',
                isLoadingPlan: false,
                actionController: createActionController(),
                selectedExecutionStrategy: 'delegate',
                canConfigureExecutionStrategy: false,
                onPlanningDepthSelectionChange: vi.fn(),
                onExecutionStrategyChange: vi.fn(),
                activePlan: {
                    id: 'plan_1',
                    status: 'draft',
                    planningDepth: 'advanced',
                    summaryMarkdown: 'Summary',
                    sourcePrompt: 'Ship the advanced lane.',
                    advancedSnapshot: {
                        evidenceMarkdown: '### Source prompt\nShip the advanced lane.',
                        observationsMarkdown: '- Advanced planning is active.',
                        rootCauseMarkdown: 'Root cause is still being refined.',
                        phases: [
                            {
                                id: 'phase_1',
                                sequence: 1,
                                title: 'Frame the plan',
                                goalMarkdown: 'Set the plan direction.',
                                exitCriteriaMarkdown: 'The plan has a structured scaffold.',
                            },
                            {
                                id: 'phase_2',
                                sequence: 2,
                                title: 'Sequence the work',
                                goalMarkdown: 'Organize the ordered work.',
                                exitCriteriaMarkdown: 'The work is ready for phase detail.',
                            },
                        ],
                    },
                    currentRevisionId: 'prev_1',
                    currentRevisionNumber: 1,
                    questions: [
                        {
                            id: 'scope',
                            question: 'What should ship?',
                            category: 'deliverable',
                            required: true,
                            answer: 'The advanced lane.',
                        },
                    ],
                    items: [
                        {
                            id: 'step_1',
                            sequence: 1,
                            description: 'First structured phase',
                            status: 'pending',
                        },
                        {
                            id: 'step_2',
                            sequence: 2,
                            description: 'Second structured phase',
                            status: 'pending',
                        },
                    ],
                } as never,
            })
        );

        expect(html).toContain('Advanced planning');
        expect(html).toContain('Evidence');
        expect(html).toContain('Observations');
        expect(html).toContain('Root Cause');
        expect(html).toContain('Roadmap');
        expect(html).toContain('Current Phase Detail');
        expect(html).toContain('No detailed phase is open yet.');
        expect(html).toContain('Frame the plan');
    });

    it('renders the approved phase detail lane and its action affordances when a phase is open', () => {
        const html = renderToStaticMarkup(
            createElement(ModeExecutionPanel, {
                topLevelTab: 'agent',
                showPlanSurface: true,
                showOrchestratorSurface: false,
                planningDepthSelection: 'advanced',
                isLoadingPlan: false,
                actionController: createActionController(),
                selectedExecutionStrategy: 'delegate',
                canConfigureExecutionStrategy: false,
                onPlanningDepthSelectionChange: vi.fn(),
                onExecutionStrategyChange: vi.fn(),
                activePlan: {
                    id: 'plan_1',
                    status: 'approved',
                    planningDepth: 'advanced',
                    summaryMarkdown: 'Approved summary',
                    sourcePrompt: 'Ship the phase detail lane.',
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
                        ],
                    },
                    currentRevisionId: 'prev_2',
                    currentRevisionNumber: 2,
                    approvedRevisionId: 'prev_1',
                    approvedRevisionNumber: 1,
                    questions: [],
                    items: [],
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
                            status: 'approved',
                            currentRevisionId: 'phase_rev_1',
                            currentRevisionNumber: 1,
                            summaryMarkdown: 'Detailed phase summary',
                            items: [
                                {
                                    id: 'phase_item_1',
                                    sequence: 1,
                                    description: 'Detailed phase item',
                                    status: 'pending',
                                },
                            ],
                            createdAt: '2026-04-02T10:00:00.000Z',
                            updatedAt: '2026-04-02T10:05:00.000Z',
                        },
                    ],
                } as never,
            })
        );

        expect(html).toContain('Current Phase Detail');
        expect(html).toContain('Approved');
        expect(html).toContain('Detailed phase summary');
        expect(html).toContain('Detailed phase item');
        expect(html).toContain('Goal');
        expect(html).toContain('Exit criteria');
        expect(html).toContain('Revise');
        expect(html).toContain('Approve');
        expect(html).toContain('Implement Phase');
        expect(html).toContain('Cancel');
    });

    it('offers an expand-next-phase affordance when the advanced roadmap has no open phase detail yet', () => {
        const html = renderToStaticMarkup(
            createElement(ModeExecutionPanel, {
                topLevelTab: 'agent',
                showPlanSurface: true,
                showOrchestratorSurface: false,
                planningDepthSelection: 'advanced',
                isLoadingPlan: false,
                actionController: createActionController(),
                selectedExecutionStrategy: 'delegate',
                canConfigureExecutionStrategy: false,
                onPlanningDepthSelectionChange: vi.fn(),
                onExecutionStrategyChange: vi.fn(),
                activePlan: {
                    id: 'plan_1',
                    status: 'approved',
                    planningDepth: 'advanced',
                    summaryMarkdown: 'Approved summary',
                    sourcePrompt: 'Ship the phase detail lane.',
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
                    currentRevisionId: 'prev_2',
                    currentRevisionNumber: 2,
                    approvedRevisionId: 'prev_1',
                    approvedRevisionNumber: 1,
                    questions: [],
                    items: [],
                } as never,
            })
        );

        expect(html).toContain('Current Phase Detail');
        expect(html).toContain('Expand Next Phase');
        expect(html).toContain('No detailed phase is open yet.');
        expect(html).toContain('Next eligible roadmap phase');
        expect(html).toContain('Frame the plan');
    });

    it('renders the phase edit surface when the current phase is opened for revision', () => {
        const html = renderToStaticMarkup(
            createElement(PlanPhaseDetailSection, {
                phaseState: {
                    roadmapPhases: [
                        {
                            id: 'phase_1',
                            sequence: 1,
                            title: 'Frame the plan',
                            goalMarkdown: 'Set the direction.',
                            exitCriteriaMarkdown: 'The plan is ready to detail.',
                        },
                    ],
                    nextExpandablePhaseOutlineId: undefined,
                    currentPhase: {
                        id: 'phase_record_1',
                        planId: 'plan_1',
                        planRevisionId: 'prev_1',
                        variantId: 'pvar_main',
                        phaseOutlineId: 'phase_1',
                        phaseSequence: 1,
                        title: 'Frame the plan',
                        goalMarkdown: 'Set the direction.',
                        exitCriteriaMarkdown: 'The plan is ready to detail.',
                        status: 'draft',
                        currentRevisionId: 'phase_rev_1',
                        currentRevisionNumber: 1,
                        summaryMarkdown: 'Detailed phase summary',
                        items: [
                            {
                                id: 'phase_item_1',
                                sequence: 1,
                                description: 'Detailed phase item',
                                status: 'pending',
                            },
                        ],
                        createdAt: '2026-04-02T10:00:00.000Z',
                        updatedAt: '2026-04-02T10:05:00.000Z',
                    },
                    canExpandNextPhase: false,
                    hasOpenPhaseDetail: true,
                },
                phaseDraftState: {
                    planId: 'plan_1',
                    phaseId: 'phase_record_1',
                    phaseRevisionId: 'phase_rev_1',
                    summaryDraft: 'Draft phase summary',
                    itemsDraft: 'Draft step 1\nDraft step 2',
                },
                phasePanelMode: 'edit',
                isPlanMutating: false,
                onEnterPhaseEditMode: vi.fn(),
                onPhaseSummaryDraftChange: vi.fn(),
                onPhaseItemsDraftChange: vi.fn(),
                onSavePhaseDraft: vi.fn(),
                onDiscardPhaseEdits: vi.fn(),
            })
        );

        expect(html).toContain('Edit Phase Detail');
        expect(html).toContain('Draft phase summary');
        expect(html).toContain('Draft step 1');
        expect(html).toContain('Draft step 2');
        expect(html).toContain('Save Phase Draft');
        expect(html).toContain('Discard Edits');
    });

    it('renders planner research guidance, worker cards, and evidence attachments for advanced plans', () => {
        const html = renderToStaticMarkup(
            createElement(ModeExecutionPanel, {
                topLevelTab: 'agent',
                showPlanSurface: true,
                showOrchestratorSurface: false,
                planningDepthSelection: 'advanced',
                isLoadingPlan: false,
                actionController: createActionController(),
                selectedExecutionStrategy: 'delegate',
                canConfigureExecutionStrategy: false,
                onPlanningDepthSelectionChange: vi.fn(),
                onExecutionStrategyChange: vi.fn(),
                onSelectChildThread: vi.fn(),
                activePlan: {
                    id: 'plan_1',
                    status: 'draft',
                    planningDepth: 'advanced',
                    summaryMarkdown: 'Summary',
                    sourcePrompt: 'Ship the advanced research lane.',
                    advancedSnapshot: {
                        evidenceMarkdown: '### Source prompt\nShip the advanced research lane.',
                        observationsMarkdown: '- Research is likely needed.',
                        rootCauseMarkdown: 'Root cause is not established yet.',
                        phases: [
                            {
                                id: 'phase_1',
                                sequence: 1,
                                title: 'Frame the plan',
                                goalMarkdown: 'Set the plan direction.',
                                exitCriteriaMarkdown: 'The plan has a structured scaffold.',
                            },
                        ],
                    },
                    currentRevisionId: 'prev_1',
                    currentRevisionNumber: 1,
                    questions: [],
                    items: [
                        {
                            id: 'step_1',
                            sequence: 1,
                            description: 'Investigate the riskiest edge cases',
                            status: 'pending',
                        },
                        {
                            id: 'step_2',
                            sequence: 2,
                            description: 'Validate the rollout assumptions',
                            status: 'pending',
                        },
                    ],
                    researchRecommendation: {
                        recommended: true,
                        priority: 'medium',
                        reasons: ['No evidence attachments exist for the current revision yet.'],
                        suggestedWorkerCount: 2,
                    },
                    researchCapacity: {
                        availableParallelism: 6,
                        recommendedWorkerCount: 2,
                        hardMaxWorkerCount: 5,
                    },
                    researchBatches: [
                        {
                            id: 'prb_1',
                            planId: 'plan_1',
                            planRevisionId: 'prev_1',
                            variantId: 'pvar_main',
                            promptMarkdown: 'Investigate the highest-risk assumptions.',
                            requestedWorkerCount: 2,
                            recommendedWorkerCount: 2,
                            hardMaxWorkerCount: 5,
                            status: 'running',
                            workers: [
                                {
                                    id: 'prw_1',
                                    batchId: 'prb_1',
                                    sequence: 1,
                                    label: 'Worker 1 of 2',
                                    promptMarkdown: 'Investigate the data and state model.',
                                    status: 'completed',
                                    childThreadId: 'thr_worker_1',
                                    childSessionId: 'sess_worker_1',
                                    activeRunId: 'run_worker_1',
                                    runId: 'run_worker_1',
                                    resultSummaryMarkdown: 'Findings summary',
                                    resultDetailsMarkdown: '## Findings\nDetailed findings',
                                    createdAt: '2026-04-02T10:00:00.000Z',
                                    completedAt: '2026-04-02T10:05:00.000Z',
                                },
                            ],
                            createdAt: '2026-04-02T10:00:00.000Z',
                        },
                    ],
                    evidenceAttachments: [
                        {
                            id: 'pea_1',
                            planRevisionId: 'prev_1',
                            sourceKind: 'planner_worker',
                            researchBatchId: 'prb_1',
                            researchWorkerId: 'prw_1',
                            label: 'Planner worker evidence',
                            summaryMarkdown: 'Evidence summary',
                            detailsMarkdown: '## Findings\nDetailed findings',
                            childThreadId: 'thr_worker_1',
                            childSessionId: 'sess_worker_1',
                            createdAt: '2026-04-02T10:05:00.000Z',
                        },
                    ],
                } as never,
            })
        );

        expect(html).toContain('Research recommended');
        expect(html).toContain('Recommended: 2 workers on this machine');
        expect(html).toContain('Batch prb_1');
        expect(html).toContain('Worker 1 of 2');
        expect(html).toContain('Open worker lane');
        expect(html).toContain('Evidence Attachments');
        expect(html).toContain('Planner worker evidence');
        expect(html).toContain('Insert Into Evidence Draft');
    });

    it('resolves an explicit orchestrator-facing panel model from the raw inputs', () => {
        const panelState = resolveModeExecutionOrchestratorPanelState({
            topLevelTab: 'orchestrator',
            selectedExecutionStrategy: 'delegate',
            canConfigureExecutionStrategy: true,
            orchestratorView: {
                run: {
                    id: 'orch_1',
                    status: 'running',
                    executionStrategy: 'parallel',
                },
                steps: [
                    {
                        id: 'step_1',
                        sequence: 1,
                        description: 'Delegate to worker lane',
                        status: 'running',
                        childThreadId: 'thr_1',
                        childSessionId: 'sess_1',
                        activeRunId: 'run_1',
                    },
                ],
            },
        });

        expect(panelState).toEqual({
            activeExecutionStrategy: 'parallel',
            canAbortOrchestrator: true,
            canConfigureExecutionStrategy: true,
            isVisible: true,
            isRootOrchestratorThread: true,
            runId: 'orch_1',
            runStatus: 'running',
            runningStepCount: 1,
            showStrategyControls: true,
            steps: [
                {
                    id: 'step_1',
                    sequence: 1,
                    description: 'Delegate to worker lane',
                    status: 'running',
                    childThreadId: 'thr_1',
                    childSessionId: 'sess_1',
                    activeRunId: 'run_1',
                    canOpenWorkerLane: true,
                },
            ],
        });
    });

    it('projects recovery banner, variant divergence, and open follow-up gating into the artifact state', () => {
        const artifactState = resolveModeExecutionPlanArtifactState({
            activePlan: {
                id: 'plan_1',
                status: 'failed',
                sourcePrompt: 'Ship the recovery view.',
                summaryMarkdown: 'Current summary',
                currentRevisionId: 'prev_3',
                currentRevisionNumber: 3,
                approvedRevisionId: 'prev_2',
                approvedRevisionNumber: 2,
                currentVariantId: 'variant_feature',
                currentVariantName: 'Feature branch',
                approvedVariantId: 'variant_main',
                approvedVariantName: 'Main branch',
                questions: [
                    {
                        id: 'scope',
                        question: 'What should be recovered?',
                        category: 'deliverable',
                        required: true,
                        answer: 'The recovery view',
                    },
                ],
                items: [],
                variants: [
                    {
                        id: 'variant_feature',
                        name: 'Feature branch',
                        revisionId: 'prev_3',
                        revisionNumber: 3,
                        revisionLabel: 'Revision 3 (prev_3)',
                        isCurrent: true,
                    },
                    {
                        id: 'variant_main',
                        name: 'Main branch',
                        revisionId: 'prev_2',
                        revisionNumber: 2,
                        revisionLabel: 'Revision 2 (prev_2)',
                        isApproved: true,
                    },
                ],
                followUps: [
                    {
                        id: 'follow_up_1',
                        kind: 'missing_context',
                        status: 'open',
                        promptMarkdown: 'Need one more recovery detail.',
                        sourceRevisionLabel: 'Revision 3 (prev_3)',
                    },
                ],
                history: [
                    {
                        id: 'history_variant',
                        kind: 'variant_created',
                        title: 'Variant created',
                        description: 'A feature branch was created from the current revision.',
                        timestamp: '2026-04-02T10:30:00.000Z',
                        variantLabel: 'Feature branch',
                        actions: [
                            {
                                label: 'Switch Variant',
                                kind: 'switch_to_variant',
                                variantId: 'variant_feature',
                            },
                        ],
                    },
                    {
                        id: 'history_follow_up',
                        kind: 'follow_up_raised',
                        title: 'Open follow-up',
                        description: 'Need one more recovery detail.',
                        timestamp: '2026-04-02T09:30:00.000Z',
                        followUpLabel: 'missing context · open',
                        actions: [
                            {
                                label: 'View Follow-Up',
                                kind: 'view_follow_up',
                                followUpId: 'follow_up_1',
                            },
                        ],
                    },
                    {
                        id: 'history_revision',
                        kind: 'revision',
                        title: 'Current revision',
                        description: 'The active draft is Revision 3 (prev_3).',
                        timestamp: '2026-04-02T08:30:00.000Z',
                        revisionLabel: 'Revision 3 (prev_3)',
                        variantLabel: 'Feature branch',
                        actions: [
                            {
                                label: 'Resume From Here',
                                kind: 'resume_from_here',
                                revisionId: 'prev_3',
                            },
                            {
                                label: 'Branch From Here',
                                kind: 'branch_from_here',
                                revisionId: 'prev_3',
                            },
                        ],
                    },
                ],
            } as never,
        });

        expect(artifactState).toEqual(
            expect.objectContaining({
                currentVariantLabel: 'Feature branch',
                approvedVariantLabel: 'Main branch',
                variantComparisonLabel:
                    'The current variant is Feature branch, while the approved variant is Main branch.',
                hasOpenFollowUps: true,
                canApprove: false,
                canImplement: false,
                recoveryBanner: expect.objectContaining({
                    title: 'Recovery required',
                }),
            })
        );

        expect(artifactState?.history[0]).toEqual(
            expect.objectContaining({
                id: 'history_variant',
                kind: 'variant_created',
            })
        );
    });

    it('renders the recovery banner, variant switcher, and history affordances in the artifact view', () => {
        const html = renderToStaticMarkup(
            createElement(ModeExecutionPanel, {
                topLevelTab: 'agent',
                showPlanSurface: true,
                showOrchestratorSurface: false,
                planningDepthSelection: 'simple',
                isLoadingPlan: false,
                actionController: createActionController(),
                selectedExecutionStrategy: 'delegate',
                canConfigureExecutionStrategy: false,
                onPlanningDepthSelectionChange: vi.fn(),
                activePlan: {
                    id: 'plan_1',
                    status: 'failed',
                    sourcePrompt: 'Ship the recovery view.',
                    summaryMarkdown: 'Current summary',
                    currentRevisionId: 'prev_3',
                    currentRevisionNumber: 3,
                    approvedRevisionId: 'prev_2',
                    approvedRevisionNumber: 2,
                    currentVariantId: 'variant_feature',
                    currentVariantName: 'Feature branch',
                    approvedVariantId: 'variant_main',
                    approvedVariantName: 'Main branch',
                    questions: [
                        {
                            id: 'scope',
                            question: 'What should be recovered?',
                            category: 'deliverable',
                            required: true,
                            answer: 'The recovery view',
                        },
                    ],
                    items: [{ id: 'step_1', sequence: 1, description: 'First recovery step', status: 'pending' }],
                    variants: [
                        {
                            id: 'variant_feature',
                            name: 'Feature branch',
                            revisionId: 'prev_3',
                            revisionNumber: 3,
                            revisionLabel: 'Revision 3 (prev_3)',
                            isCurrent: true,
                        },
                        {
                            id: 'variant_main',
                            name: 'Main branch',
                            revisionId: 'prev_2',
                            revisionNumber: 2,
                            revisionLabel: 'Revision 2 (prev_2)',
                            isApproved: true,
                        },
                        {
                            id: 'variant_recovery',
                            name: 'Recovery branch',
                            revisionId: 'prev_1',
                            revisionNumber: 1,
                            revisionLabel: 'Revision 1 (prev_1)',
                        },
                    ],
                    followUps: [
                        {
                            id: 'follow_up_1',
                            kind: 'missing_context',
                            status: 'open',
                            promptMarkdown: 'Need one more recovery detail.',
                            sourceRevisionLabel: 'Revision 3 (prev_3)',
                        },
                    ],
                    history: [
                        {
                            id: 'history_variant',
                            kind: 'variant_created',
                            title: 'Variant created',
                            description: 'A feature branch was created from the current revision.',
                            timestamp: '2026-04-02T10:30:00.000Z',
                            variantLabel: 'Feature branch',
                            actions: [
                                {
                                    label: 'Switch Variant',
                                    kind: 'switch_to_variant',
                                    variantId: 'variant_feature',
                                },
                            ],
                        },
                        {
                            id: 'history_follow_up',
                            kind: 'follow_up_raised',
                            title: 'Open follow-up',
                            description: 'Need one more recovery detail.',
                            timestamp: '2026-04-02T09:30:00.000Z',
                            followUpLabel: 'missing context · open',
                            actions: [
                                {
                                    label: 'View Follow-Up',
                                    kind: 'view_follow_up',
                                    followUpId: 'follow_up_1',
                                },
                            ],
                        },
                        {
                            id: 'history_revision',
                            kind: 'revision',
                            title: 'Current revision',
                            description: 'The active draft is Revision 3 (prev_3).',
                            timestamp: '2026-04-02T08:30:00.000Z',
                            revisionLabel: 'Revision 3 (prev_3)',
                            variantLabel: 'Feature branch',
                            actions: [
                                {
                                    label: 'Resume From Here',
                                    kind: 'resume_from_here',
                                    revisionId: 'prev_3',
                                },
                                {
                                    label: 'Branch From Here',
                                    kind: 'branch_from_here',
                                    revisionId: 'prev_3',
                                },
                            ],
                        },
                    ],
                    recoveryBanner: {
                        title: 'Recovery required',
                        message: 'Open follow-ups block approval until they are resolved.',
                        actions: [
                            {
                                label: 'Resume Editing',
                                kind: 'resume_editing',
                            },
                            {
                                label: 'Resolve Follow-Up',
                                kind: 'resolve_follow_up',
                                followUpId: 'follow_up_1',
                            },
                            {
                                label: 'Switch To Approved Variant',
                                kind: 'switch_to_variant',
                                variantId: 'variant_main',
                            },
                        ],
                    },
                } as never,
                onExecutionStrategyChange: vi.fn(),
                onSelectChildThread: vi.fn(),
                onCreateVariant: vi.fn(),
                onActivateVariant: vi.fn(),
                onResumeFromRevision: vi.fn(),
                onViewFollowUp: vi.fn(),
                onResolveFollowUp: vi.fn(),
            })
        );

        expect(html).toContain('Recovery required');
        expect(html).toContain('Open follow-ups block approval until they are resolved.');
        expect(html).toContain('Current variant');
        expect(html).toContain('Approved variant');
        expect(html).toContain('Feature branch');
        expect(html).toContain('Main branch');
        expect(html).toContain('Recovery branch');
        expect(html).toContain('Create Variant');
        expect(html).toContain('Upgrade to Advanced Planning');
        expect(html).toContain('History');
        expect(html).toContain('Variant created');
        expect(html).toContain('Open follow-up');
        expect(html).toContain('Current revision');
        expect(html).toContain('Resume From Here');
        expect(html).toContain('Branch From Here');
        expect(html).toContain('View Follow-Up');
        expect(html).toContain('Switch Variant');
        expect(html).toContain('Resolve Follow-Up');
        expect(html).toContain('Resume Editing');
    });
});

describe('ModeExecutionPanel capability gating', () => {
    it('hides the shell panel entirely when no capability-driven surface is available', () => {
        const html = renderToStaticMarkup(
            createElement(ModeExecutionPanel, {
                topLevelTab: 'agent',
                showPlanSurface: false,
                showOrchestratorSurface: false,
                planningDepthSelection: 'simple',
                isLoadingPlan: false,
                actionController: createActionController(),
                selectedExecutionStrategy: 'delegate',
                canConfigureExecutionStrategy: false,
                onPlanningDepthSelectionChange: vi.fn(),
                onExecutionStrategyChange: vi.fn(),
            })
        );

        expect(html).toBe('');
    });
});
