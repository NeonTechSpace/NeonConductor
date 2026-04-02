import { planStore } from '@/app/backend/persistence/stores';
import type { PlanRecord } from '@/app/backend/persistence/types';
import type { PlanGenerateDraftInput, PlanRecordView } from '@/app/backend/runtime/contracts';
import { generatePlainTextFromMessages } from '@/app/backend/runtime/services/common/plainTextGeneration';
import { resolveSummaryGenerationTarget } from '@/app/backend/runtime/services/common/summaryGenerationTarget';
import { errPlan, okPlan, type PlanServiceError } from '@/app/backend/runtime/services/plan/errors';
import {
    appendPlanDraftGeneratedEvent,
    appendPlanDraftGenerationStartedEvent,
    appendPlanRevisedEvent,
} from '@/app/backend/runtime/services/plan/events';
import { buildDeterministicDraft, hasUnansweredRequiredQuestions } from '@/app/backend/runtime/services/plan/intake';
import { requirePlanView } from '@/app/backend/runtime/services/plan/views';
import { appLog } from '@/app/main/logging';

import type { Result } from 'neverthrow';

interface GeneratedDraftContent {
    summaryMarkdown: string;
    itemDescriptions: string[];
}

function buildDraftGenerationMessages(plan: PlanRecord): Array<{
    role: 'system' | 'user';
    parts: Array<{ type: 'text'; text: string }>;
}> {
    const answeredQuestions = plan.questions.map((question) => {
        const answer = plan.answers[question.id]?.trim();
        return [
            `- id: ${question.id}`,
            `  category: ${question.category}`,
            `  required: ${question.required ? 'yes' : 'no'}`,
            `  question: ${question.question}`,
            `  answer: ${answer && answer.length > 0 ? answer : '[unanswered]'}`,
        ].join('\n');
    });

    return [
        {
            role: 'system',
            parts: [
                {
                    type: 'text',
                    text: [
                        'Generate an implementation-plan draft for NeonConductor basic plan mode.',
                        'Return JSON only with this shape:',
                        '{"summaryMarkdown":"string","items":["string"]}',
                        'The summary must be concise Markdown.',
                        'Items must be short, actionable, ordered steps.',
                        'Do not include code fences, prose outside JSON, tool use, or execution instructions.',
                        'If the request is still somewhat underspecified, keep the summary explicit about that and keep items conservative.',
                    ].join('\n'),
                },
            ],
        },
        {
            role: 'user',
            parts: [
                {
                    type: 'text',
                    text: [
                        `Top-level tab: ${plan.topLevelTab}`,
                        `Source prompt: ${plan.sourcePrompt}`,
                        '',
                        'Questions and answers:',
                        answeredQuestions.join('\n'),
                    ].join('\n'),
                },
            ],
        },
    ];
}

function stripCodeFence(rawText: string): string {
    const fencedMatch = rawText.trim().match(/^```(?:json)?\s*([\s\S]*?)```$/i);
    return fencedMatch?.[1]?.trim() ?? rawText.trim();
}

function extractJsonObject(rawText: string): string | null {
    const normalized = stripCodeFence(rawText);
    const firstBrace = normalized.indexOf('{');
    const lastBrace = normalized.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
        return null;
    }

    return normalized.slice(firstBrace, lastBrace + 1);
}

function parseGeneratedDraft(rawText: string): GeneratedDraftContent | null {
    const jsonText = extractJsonObject(rawText);
    if (!jsonText) {
        return null;
    }

    try {
        const parsed = JSON.parse(jsonText) as {
            summaryMarkdown?: unknown;
            items?: unknown;
        };
        if (typeof parsed.summaryMarkdown !== 'string') {
            return null;
        }
        if (!Array.isArray(parsed.items)) {
            return null;
        }

        const summaryMarkdown = parsed.summaryMarkdown.trim();
        const itemDescriptions = parsed.items
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter((item) => item.length > 0);
        if (summaryMarkdown.length === 0) {
            return null;
        }

        return {
            summaryMarkdown,
            itemDescriptions,
        };
    } catch {
        return null;
    }
}

async function generateModelDraft(input: {
    profileId: string;
    plan: PlanRecord;
    providerId: NonNullable<PlanGenerateDraftInput['providerId']>;
    modelId: NonNullable<PlanGenerateDraftInput['modelId']>;
}): Promise<GeneratedDraftContent | null> {
    const messages = buildDraftGenerationMessages(input.plan);
    const target = await resolveSummaryGenerationTarget({
        profileId: input.profileId,
        fallbackProviderId: input.providerId,
        fallbackModelId: input.modelId,
        summaryMessages: messages,
    });
    if (!target) {
        return null;
    }

    const generated = await generatePlainTextFromMessages({
        profileId: input.profileId,
        providerId: target.providerId,
        modelId: target.modelId,
        messages,
        timeoutMs: 15_000,
    });
    if (generated.isErr()) {
        return null;
    }

    return parseGeneratedDraft(generated.value);
}

export async function generatePlanDraft(
    input: PlanGenerateDraftInput
): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
    const plan = await planStore.getById(input.profileId, input.planId);
    if (!plan) {
        return okPlan({ found: false });
    }

    if (
        plan.status === 'approved' ||
        plan.status === 'implementing' ||
        plan.status === 'implemented' ||
        plan.status === 'cancelled'
    ) {
        return errPlan(
            'revision_conflict',
            'Draft generation is only available while the plan is still being prepared.'
        );
    }

    if (
        hasUnansweredRequiredQuestions({
            questions: plan.questions,
            answers: plan.answers,
        })
    ) {
        return errPlan(
            'unanswered_questions',
            'Cannot generate a draft before answering all required intake questions.'
        );
    }

    const priorRevisionId = plan.currentRevisionId;
    const priorRevisionNumber = plan.currentRevisionNumber;
    const attemptedModelGeneration = Boolean(input.providerId && input.modelId);
    await appendPlanDraftGenerationStartedEvent({
        profileId: input.profileId,
        planId: input.planId,
        priorRevisionId,
        priorRevisionNumber,
        generationMode: attemptedModelGeneration ? 'model' : 'deterministic_fallback',
    });

    const generatedDraft =
        input.providerId && input.modelId
            ? await generateModelDraft({
                  profileId: input.profileId,
                  plan,
                  providerId: input.providerId,
                  modelId: input.modelId,
              })
            : null;

    const fallbackDraft = buildDeterministicDraft(plan);
    const finalDraft = generatedDraft ?? fallbackDraft;
    const generationMode = generatedDraft ? 'model' : 'deterministic_fallback';

    const revised = await planStore.revise(input.planId, finalDraft.summaryMarkdown, finalDraft.itemDescriptions);
    if (!revised || revised.profileId !== input.profileId) {
        return errPlan('draft_generation_failed', 'Plan draft generation could not persist the generated revision.');
    }

    await appendPlanRevisedEvent({
        profileId: input.profileId,
        planId: input.planId,
        revisionId: revised.currentRevisionId,
        revisionNumber: revised.currentRevisionNumber,
    });
    await appendPlanDraftGeneratedEvent({
        profileId: input.profileId,
        planId: input.planId,
        priorRevisionId,
        priorRevisionNumber,
        revisionId: revised.currentRevisionId,
        revisionNumber: revised.currentRevisionNumber,
        generationMode,
    });

    appLog.info({
        tag: 'plan',
        message: 'Generated plan draft revision.',
        profileId: input.profileId,
        planId: input.planId,
        priorRevisionId,
        revisionId: revised.currentRevisionId,
        generationMode,
    });

    const items = await planStore.listItems(input.planId);
    return okPlan({
        found: true,
        plan: requirePlanView(revised, items, 'plan.generateDraft'),
    });
}
