import type { PlanViewProjection } from '@/app/backend/persistence/types';
import type { PlanRecordView } from '@/app/backend/runtime/contracts';
import { InvariantError } from '@/app/backend/runtime/services/common/fatalErrors';

function toPlanViewFromProjection(projection: PlanViewProjection | null): PlanRecordView | null {
    if (!projection) {
        return null;
    }

    const { plan, items, variants, followUps, history, recoveryBanner } = projection;
    const currentVariant = variants.find((variant) => variant.id === plan.currentVariantId);
    const approvedVariant = plan.approvedVariantId
        ? variants.find((variant) => variant.id === plan.approvedVariantId)
        : undefined;

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
        currentVariantId: plan.currentVariantId,
        currentVariantName: currentVariant?.name ?? 'main',
        ...(plan.approvedRevisionId ? { approvedRevisionId: plan.approvedRevisionId } : {}),
        ...(plan.approvedRevisionNumber !== undefined ? { approvedRevisionNumber: plan.approvedRevisionNumber } : {}),
        ...(plan.approvedVariantId ? { approvedVariantId: plan.approvedVariantId } : {}),
        ...(approvedVariant?.name ? { approvedVariantName: approvedVariant.name } : {}),
        questions: plan.questions.map((question) => ({
            id: question.id,
            question: question.question,
            category: question.category,
            required: question.required,
            ...(question.placeholderText ? { placeholderText: question.placeholderText } : {}),
            ...(question.helpText ? { helpText: question.helpText } : {}),
            ...(plan.answers[question.id] ? { answer: plan.answers[question.id] } : {}),
        })),
        variants,
        followUps,
        history,
        ...(recoveryBanner ? { recoveryBanner } : {}),
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

export function toPlanView(projection: PlanViewProjection | null): PlanRecordView | null {
    return toPlanViewFromProjection(projection);
}

export function requirePlanView(projection: PlanViewProjection | null, context: string): PlanRecordView {
    const view = toPlanView(projection);
    if (!view) {
        throw new InvariantError(`Expected plan view during ${context}.`);
    }

    return view;
}
