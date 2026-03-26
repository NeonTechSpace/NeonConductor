import type { EntityId } from '@/shared/contracts';

interface PlanQuestionView {
    id: string;
    question: string;
    answer?: string;
}

interface PlanItemView {
    id: EntityId<'step'>;
    sequence: number;
    description: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted';
}

export interface ModeExecutionPlanView {
    id: EntityId<'plan'>;
    status: 'awaiting_answers' | 'draft' | 'approved' | 'implementing' | 'implemented' | 'failed' | 'cancelled';
    summaryMarkdown: string;
    questions: PlanQuestionView[];
    items: PlanItemView[];
}

export interface ModeExecutionDraftState {
    planId: EntityId<'plan'>;
    summaryDraft: string;
    itemsDraft: string;
    answerByQuestionId: Record<string, string>;
}

export function resolveModeExecutionDraftState(input: {
    activePlan: ModeExecutionPlanView | undefined;
    draftState: ModeExecutionDraftState | undefined;
}): ModeExecutionDraftState | undefined {
    if (!input.activePlan) {
        return undefined;
    }

    if (input.draftState?.planId === input.activePlan.id) {
        return input.draftState;
    }

    return {
        planId: input.activePlan.id,
        summaryDraft: input.activePlan.summaryMarkdown,
        itemsDraft: input.activePlan.items.map((item) => item.description).join('\n'),
        answerByQuestionId: Object.fromEntries(
            input.activePlan.questions.map((question) => [question.id, question.answer ?? ''])
        ),
    };
}
