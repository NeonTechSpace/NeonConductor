import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ModeExecutionPanel } from '@/web/components/conversation/panels/modeExecutionPanel';
import { resolveModeExecutionDraftState } from '@/web/components/conversation/panels/modeExecutionPanelState';

describe('resolveModeExecutionDraftState', () => {
    it('keeps keyed plan drafts instead of replacing them with refreshed plan data', () => {
        const activePlan = {
            id: 'plan_1',
            status: 'draft',
            summaryMarkdown: 'Server Summary',
            questions: [{ id: 'q_1', question: 'Question?', answer: 'Server Answer' }],
            items: [{ id: 'step_1', sequence: 1, description: 'Server Item', status: 'pending' }],
        } as const;

        expect(
            resolveModeExecutionDraftState({
                activePlan: activePlan as never,
                draftState: {
                    planId: 'plan_1',
                    summaryDraft: 'Unsaved Summary',
                    itemsDraft: 'Unsaved Item',
                    answerByQuestionId: {
                        q_1: 'Unsaved Answer',
                    },
                },
            })
        ).toEqual({
            planId: 'plan_1',
            summaryDraft: 'Unsaved Summary',
            itemsDraft: 'Unsaved Item',
            answerByQuestionId: {
                q_1: 'Unsaved Answer',
            },
        });
    });

    it('renders orchestrator strategy and delegated worker lane status', () => {
        const html = renderToStaticMarkup(
            createElement(ModeExecutionPanel, {
                topLevelTab: 'orchestrator',
                modeKey: 'plan',
                isLoadingPlan: false,
                actionController: {
                    isPlanMutating: false,
                    isOrchestratorMutating: false,
                    onAnswerQuestion: vi.fn(),
                    onRevisePlan: vi.fn(),
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
                    questions: [],
                    items: [{ id: 'step_1', sequence: 1, description: 'Child task', status: 'pending' }],
                },
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
    });
});
