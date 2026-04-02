import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ModeExecutionPanel } from '@/web/components/conversation/panels/modeExecutionPanel';
import {
    canGenerateDraft,
    hasUnansweredRequiredPlanQuestions,
    resolveModeExecutionDraftState,
    resolveModeExecutionPlanArtifactState,
    resolveModeExecutionPlanPanelMode,
    resolveModeExecutionOrchestratorPanelState,
} from '@/web/components/conversation/panels/modeExecutionPanelState';

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

    it('renders orchestrator strategy and delegated worker lane status', () => {
        const html = renderToStaticMarkup(
            createElement(ModeExecutionPanel, {
                topLevelTab: 'orchestrator',
                showPlanSurface: true,
                showOrchestratorSurface: true,
                isLoadingPlan: false,
                actionController: {
                    isPlanMutating: false,
                    isOrchestratorMutating: false,
                    onAnswerQuestion: vi.fn(),
                    onRevisePlan: vi.fn(),
                    onCreateVariant: vi.fn(),
                    onActivateVariant: vi.fn(),
                    onResumeFromRevision: vi.fn(),
                    onResolveFollowUp: vi.fn(),
                    onGenerateDraft: vi.fn(),
                    onCancelPlan: vi.fn(),
                    onApprovePlan: vi.fn(),
                    onImplementPlan: vi.fn(),
                    onAbortOrchestrator: vi.fn(),
                },
                selectedExecutionStrategy: 'parallel',
                canConfigureExecutionStrategy: true,
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
        expect(html).toContain('Evidence');
        expect(html).toContain('Ordered Items');
        expect(html).toContain('Revise');
        expect(html).toContain('Implement');
        expect(html).toContain('Cancel');
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
                isLoadingPlan: false,
                actionController: {
                    isPlanMutating: false,
                    isOrchestratorMutating: false,
                    onAnswerQuestion: vi.fn(),
                    onRevisePlan: vi.fn(),
                    onCreateVariant: vi.fn(),
                    onActivateVariant: vi.fn(),
                    onResumeFromRevision: vi.fn(),
                    onResolveFollowUp: vi.fn(),
                    onGenerateDraft: vi.fn(),
                    onCancelPlan: vi.fn(),
                    onApprovePlan: vi.fn(),
                    onImplementPlan: vi.fn(),
                    onAbortOrchestrator: vi.fn(),
                },
                selectedExecutionStrategy: 'delegate',
                canConfigureExecutionStrategy: false,
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
                isLoadingPlan: false,
                actionController: {
                    isPlanMutating: false,
                    isOrchestratorMutating: false,
                    onAnswerQuestion: vi.fn(),
                    onRevisePlan: vi.fn(),
                    onCreateVariant: vi.fn(),
                    onActivateVariant: vi.fn(),
                    onResumeFromRevision: vi.fn(),
                    onResolveFollowUp: vi.fn(),
                    onGenerateDraft: vi.fn(),
                    onCancelPlan: vi.fn(),
                    onApprovePlan: vi.fn(),
                    onImplementPlan: vi.fn(),
                    onAbortOrchestrator: vi.fn(),
                },
                selectedExecutionStrategy: 'delegate',
                canConfigureExecutionStrategy: false,
                onExecutionStrategyChange: vi.fn(),
            })
        );

        expect(html).toBe('');
    });
});
