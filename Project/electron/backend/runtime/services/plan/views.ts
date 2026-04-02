import { planStore } from '@/app/backend/persistence/stores';
import type { PlanRecordView } from '@/app/backend/runtime/contracts';
import { InvariantError } from '@/app/backend/runtime/services/common/fatalErrors';

export function toPlanView(
    plan: Awaited<ReturnType<typeof planStore.getById>>,
    items: Awaited<ReturnType<typeof planStore.listItems>>
): PlanRecordView | null {
    if (!plan) {
        return null;
    }

    return {
        id: plan.id,
        profileId: plan.profileId,
        sessionId: plan.sessionId,
        topLevelTab: plan.topLevelTab,
        modeKey: plan.modeKey,
        status: plan.status,
        sourcePrompt: plan.sourcePrompt,
        summaryMarkdown: plan.summaryMarkdown,
        currentRevisionId: plan.currentRevisionId,
        currentRevisionNumber: plan.currentRevisionNumber,
        ...(plan.approvedRevisionId ? { approvedRevisionId: plan.approvedRevisionId } : {}),
        ...(plan.approvedRevisionNumber !== undefined ? { approvedRevisionNumber: plan.approvedRevisionNumber } : {}),
        questions: plan.questions.map((question) => ({
            id: question.id,
            question: question.question,
            category: question.category,
            required: question.required,
            ...(question.placeholderText ? { placeholderText: question.placeholderText } : {}),
            ...(question.helpText ? { helpText: question.helpText } : {}),
            ...(plan.answers[question.id] ? { answer: plan.answers[question.id] } : {}),
        })),
        items: items.map((item) => ({
            id: item.id,
            sequence: item.sequence,
            description: item.description,
            status: item.status,
            ...(item.runId ? { runId: item.runId } : {}),
            ...(item.errorMessage ? { errorMessage: item.errorMessage } : {}),
        })),
        ...(plan.workspaceFingerprint ? { workspaceFingerprint: plan.workspaceFingerprint } : {}),
        ...(plan.implementationRunId ? { implementationRunId: plan.implementationRunId } : {}),
        ...(plan.orchestratorRunId ? { orchestratorRunId: plan.orchestratorRunId } : {}),
        ...(plan.approvedAt ? { approvedAt: plan.approvedAt } : {}),
        ...(plan.implementedAt ? { implementedAt: plan.implementedAt } : {}),
        createdAt: plan.createdAt,
        updatedAt: plan.updatedAt,
    };
}

export function requirePlanView(
    plan: Awaited<ReturnType<typeof planStore.getById>>,
    items: Awaited<ReturnType<typeof planStore.listItems>>,
    context: string
): PlanRecordView {
    const view = toPlanView(plan, items);
    if (!view) {
        throw new InvariantError(`Expected plan view during ${context}.`);
    }

    return view;
}
