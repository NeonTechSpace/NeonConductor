import type { PlanQuestionRecord, PlanRecord } from '@/app/backend/persistence/types';
import type { TopLevelTab } from '@/app/backend/runtime/contracts';

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function hasKeyword(prompt: string, keywords: string[]): boolean {
    return keywords.some((keyword) => prompt.includes(keyword));
}

function isAmbiguousPrompt(prompt: string): boolean {
    const normalized = normalizeWhitespace(prompt.toLowerCase());
    if (normalized.length === 0) {
        return false;
    }

    const tokenCount = normalized.split(' ').filter((token) => token.length > 0).length;
    if (tokenCount <= 2) {
        return true;
    }

    return hasKeyword(normalized, [
        'something',
        'stuff',
        'help me',
        'continue',
        'work on this',
        'make it better',
        'improve this',
        'implement this',
        'fix it',
        'help with this',
        'look into this',
        'take care of this',
    ]);
}

function shouldAskEnvironmentQuestion(input: {
    prompt: string;
    topLevelTab: TopLevelTab;
    workspaceFingerprint?: string;
}): boolean {
    const normalized = normalizeWhitespace(input.prompt.toLowerCase());
    if (input.topLevelTab === 'orchestrator') {
        return hasKeyword(normalized, ['workspace', 'repo', 'repository', 'service', 'worker', 'lane']);
    }

    const referencesCodeSurface = hasKeyword(normalized, [
        'repo',
        'repository',
        'workspace',
        'package',
        'service',
        'component',
        'screen',
        'router',
        'module',
        'file',
    ]);
    if (referencesCodeSurface) {
        return true;
    }

    return !input.workspaceFingerprint && hasKeyword(normalized, ['codebase', 'code path', 'implementation surface']);
}

function shouldAskValidationQuestion(prompt: string): boolean {
    const normalized = normalizeWhitespace(prompt.toLowerCase());
    return hasKeyword(normalized, [
        'fix',
        'bug',
        'regression',
        'fail',
        'failure',
        'failing',
        'test',
        'verify',
        'validation',
        'review',
        'audit',
        'refactor',
        'migrate',
    ]);
}

function createQuestion(input: {
    id: string;
    question: string;
    category: PlanQuestionRecord['category'];
    required: boolean;
    placeholderText?: string;
    helpText?: string;
}): PlanQuestionRecord {
    return {
        id: input.id,
        question: input.question,
        category: input.category,
        required: input.required,
        ...(input.placeholderText ? { placeholderText: input.placeholderText } : {}),
        ...(input.helpText ? { helpText: input.helpText } : {}),
    };
}

export function createPlanIntakeQuestions(input: {
    prompt: string;
    topLevelTab: TopLevelTab;
    workspaceFingerprint?: string;
}): PlanQuestionRecord[] {
    const normalizedPrompt = normalizeWhitespace(input.prompt);
    if (normalizedPrompt.length === 0) {
        return [];
    }

    const questions: PlanQuestionRecord[] = [
        createQuestion({
            id: 'scope',
            question:
                input.topLevelTab === 'orchestrator'
                    ? 'What concrete orchestrated outcome should this plan produce first?'
                    : 'What exact deliverable should this plan produce first?',
            category: 'deliverable',
            required: true,
            placeholderText:
                input.topLevelTab === 'orchestrator'
                    ? 'Describe the orchestrated outcome, not just the topic.'
                    : 'Name the exact artifact, change, or output to deliver first.',
            helpText: 'Answer with the concrete first outcome this plan should deliver.',
        }),
        createQuestion({
            id: 'constraints',
            question: 'Which constraints are non-negotiable for implementation?',
            category: 'constraints',
            required: true,
            placeholderText: 'Examples: no schema changes, preserve behavior, fail closed, add tests.',
        }),
    ];

    if (shouldAskEnvironmentQuestion(input) && questions.length < 4) {
        questions.push(
            createQuestion({
                id: 'environment',
                question:
                    input.topLevelTab === 'orchestrator'
                        ? 'Which codebase surface, worker lane, or environment should this plan target?'
                        : 'Which repo, package, file area, or surface should this plan target?',
                category: 'environment',
                required: false,
                placeholderText: 'Name the relevant repo/package/component/service if you know it.',
            })
        );
    }

    if (isAmbiguousPrompt(normalizedPrompt) && questions.length < 4) {
        questions.push(
            createQuestion({
                id: 'missing_context',
                question: 'What missing context would make this plan specific enough to execute confidently?',
                category: 'missing_context',
                required: true,
                placeholderText: 'Examples: affected feature, target files, intended behavior, acceptance criteria.',
                helpText: 'Use this to supply the detail that is currently implied but not stated.',
            })
        );
    } else if (shouldAskValidationQuestion(normalizedPrompt) && questions.length < 4) {
        questions.push(
            createQuestion({
                id: 'validation',
                question: 'How should this plan be validated when the work is done?',
                category: 'validation',
                required: false,
                placeholderText: 'Tests, manual verification, smoke checks, or success criteria.',
            })
        );
    }

    return questions;
}

export function hasUnansweredRequiredQuestions(input: {
    questions: PlanQuestionRecord[];
    answers: Record<string, string>;
}): boolean {
    return input.questions.some((question) => {
        if (!question.required) {
            return false;
        }

        const response = input.answers[question.id];
        return typeof response !== 'string' || response.trim().length === 0;
    });
}

export function createInitialPlanSummary(input: { prompt: string; questions: PlanQuestionRecord[] }): string {
    const normalizedPrompt = normalizeWhitespace(input.prompt);
    const hasMissingContext = input.questions.some((question) => question.category === 'missing_context');

    return [
        '# Plan',
        '',
        hasMissingContext
            ? 'This draft is provisional until the missing implementation context is clarified.'
            : 'Initial planning context captured from the prompt.',
        '',
        '## Source Prompt',
        '',
        normalizedPrompt,
    ].join('\n');
}

function readAnsweredQuestion(plan: PlanRecord, questionId: string): string | undefined {
    const answer = plan.answers[questionId];
    return typeof answer === 'string' && answer.trim().length > 0 ? answer.trim() : undefined;
}

export function buildDeterministicDraft(plan: PlanRecord): {
    summaryMarkdown: string;
    itemDescriptions: string[];
} {
    const deliverable = readAnsweredQuestion(plan, 'scope') ?? plan.sourcePrompt.trim();
    const constraints = readAnsweredQuestion(plan, 'constraints');
    const environment = readAnsweredQuestion(plan, 'environment');
    const validation = readAnsweredQuestion(plan, 'validation');
    const missingContext = readAnsweredQuestion(plan, 'missing_context');

    const summarySections = ['# Plan', '', '## Goal', '', deliverable];

    if (constraints) {
        summarySections.push('', '## Constraints', '', `- ${constraints}`);
    }

    if (environment) {
        summarySections.push('', '## Target Surface', '', environment);
    }

    if (validation) {
        summarySections.push('', '## Validation', '', validation);
    }

    if (missingContext) {
        summarySections.push('', '## Clarified Context', '', missingContext);
    }

    const itemDescriptions: string[] = [];
    if (environment) {
        itemDescriptions.push(`Inspect the relevant surface: ${environment}`);
    } else {
        itemDescriptions.push('Inspect the relevant code paths and existing constraints.');
    }
    itemDescriptions.push(`Deliver the agreed outcome: ${deliverable}`);
    if (validation) {
        itemDescriptions.push(`Verify the result using: ${validation}`);
    } else {
        itemDescriptions.push('Verify the result against the agreed constraints and expected outcome.');
    }

    return {
        summaryMarkdown: summarySections.join('\n'),
        itemDescriptions,
    };
}
