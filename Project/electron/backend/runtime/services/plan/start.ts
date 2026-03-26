import { planStore } from '@/app/backend/persistence/stores';
import type { PlanRecordView, PlanStartInput } from '@/app/backend/runtime/contracts';
import {
    errPlan,
    type PlanServiceError,
    okPlan,
    validatePlanStartInput,
} from '@/app/backend/runtime/services/plan/errors';
import { appendPlanQuestionRequestedEvents, appendPlanStartedEvent } from '@/app/backend/runtime/services/plan/events';
import { createDefaultQuestions, requirePlanView } from '@/app/backend/runtime/services/plan/views';
import { appLog } from '@/app/main/logging';

import type { Result } from 'neverthrow';

export async function startPlanFlow(
    input: PlanStartInput
): Promise<Result<{ plan: PlanRecordView }, PlanServiceError>> {
    const validation = validatePlanStartInput(input);
    if (validation.isErr()) {
        return errPlan(validation.error.code, validation.error.message);
    }

    const questions = createDefaultQuestions(input.prompt);
    const plan = await planStore.create({
        profileId: input.profileId,
        sessionId: input.sessionId,
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
        sourcePrompt: input.prompt.trim(),
        summaryMarkdown: `# Plan\n\n${input.prompt.trim()}`,
        questions,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    });

    await appendPlanStartedEvent({
        profileId: input.profileId,
        sessionId: input.sessionId,
        topLevelTab: input.topLevelTab,
        planId: plan.id,
    });
    await appendPlanQuestionRequestedEvents({
        planId: plan.id,
        questions,
    });

    appLog.info({
        tag: 'plan',
        message: 'Started planning flow.',
        profileId: input.profileId,
        sessionId: input.sessionId,
        planId: plan.id,
        topLevelTab: input.topLevelTab,
    });

    return okPlan({
        plan: requirePlanView(plan, [], 'plan.start'),
    });
}
