import type {
    PlanAdvancedSnapshotView,
    PlanResearchCapacityView,
    PlanResearchRecommendationView,
} from '@/app/backend/runtime/contracts';
import type { PlanRecord } from '@/app/backend/persistence/types';

export interface PlannerResearchWorkerPromptInput {
    plan: PlanRecord;
    currentItemDescriptions: string[];
    advancedSnapshot?: PlanAdvancedSnapshotView;
    researchRequestMarkdown: string;
    capacity: PlanResearchCapacityView;
    recommendation: PlanResearchRecommendationView;
    workerIndex: number;
    workerCount: number;
}

export interface ParsedPlannerResearchWorkerResponse {
    findingsMarkdown: string;
    evidenceMarkdown: string;
    openQuestionsMarkdown: string;
    recommendationMarkdown: string;
    resultSummaryMarkdown: string;
    resultDetailsMarkdown: string;
}

function normalizeText(value: string): string {
    return value.trim();
}

function buildMarkdownList(items: string[]): string {
    return items.length > 0 ? items.map((item) => `- ${normalizeText(item)}`).join('\n') : '- none';
}

function buildSnapshotSection(snapshot?: PlanAdvancedSnapshotView): string {
    if (!snapshot) {
        return [
            '- none',
            '',
            'The current revision has not yet seeded an advanced snapshot.',
        ].join('\n');
    }

    return [
        `- createdAt: ${snapshot.createdAt}`,
        '',
        '### Evidence',
        '',
        snapshot.evidenceMarkdown,
        '',
        '### Observations',
        '',
        snapshot.observationsMarkdown,
        '',
        '### Root Cause',
        '',
        snapshot.rootCauseMarkdown,
        '',
        '### Phase Outline',
        '',
        snapshot.phases.length > 0
            ? snapshot.phases
                  .map((phase) =>
                      [
                          `- id: ${phase.id}`,
                          `  sequence: ${String(phase.sequence)}`,
                          `  title: ${phase.title}`,
                          `  goal: ${phase.goalMarkdown}`,
                          `  exitCriteria: ${phase.exitCriteriaMarkdown}`,
                      ].join('\n')
                  )
                  .join('\n')
            : '- none',
    ].join('\n');
}

export function buildPlannerResearchWorkerPromptMarkdown(input: PlannerResearchWorkerPromptInput): string {
    const workerLabel = `Worker ${String(input.workerIndex)} of ${String(input.workerCount)}`;
    const workerInstructionLines = [
        'You are a read-only planner research worker.',
        'Use only agent.ask-style reasoning.',
        'Do not implement changes, edit files, or spawn any additional workers.',
        'Pursue a distinct angle from the other workers and avoid duplicating their likely focus.',
        'Return exactly the four Markdown sections below and nothing else:',
        '## Findings',
        '## Evidence',
        '## Open Questions',
        '## Recommendation',
        'Do not wrap the response in code fences.',
    ];

    return [
        '# Planner Research Brief',
        '',
        `Worker: ${workerLabel}`,
        `Plan ID: ${input.plan.id}`,
        `Revision: ${String(input.plan.currentRevisionNumber)}`,
        `Variant: ${input.plan.currentVariantId}`,
        `Capacity: ${String(input.capacity.recommendedWorkerCount)} recommended / ${String(input.capacity.hardMaxWorkerCount)} max on ${String(input.capacity.availableParallelism)} available parallel slots`,
        `Recommendation: ${input.recommendation.priority} (${input.recommendation.recommended ? 'research encouraged' : 'research optional'})`,
        '',
        '## Source Prompt',
        '',
        normalizeText(input.plan.sourcePrompt),
        '',
        '## Research Request',
        '',
        normalizeText(input.researchRequestMarkdown),
        '',
        '## Current Plan Summary',
        '',
        normalizeText(input.plan.summaryMarkdown),
        '',
        '## Current Ordered Items',
        '',
        buildMarkdownList(input.currentItemDescriptions),
        '',
        '## Advanced Snapshot',
        '',
        buildSnapshotSection(input.advancedSnapshot),
        '',
        '## Recommendation Context',
        '',
        input.recommendation.reasons.length > 0 ? buildMarkdownList(input.recommendation.reasons) : '- none',
        '',
        '## Instructions',
        '',
        ...workerInstructionLines,
    ].join('\n');
}

function stripOuterFence(value: string): string {
    const trimmed = value.trim();
    const fencedMatch = trimmed.match(/^```(?:markdown|md)?\s*([\s\S]*?)```$/i);
    return fencedMatch?.[1]?.trim() ?? trimmed;
}

export function parsePlannerResearchWorkerResponse(rawText: string): ParsedPlannerResearchWorkerResponse | null {
    const normalized = stripOuterFence(rawText);
    if (normalized.length === 0) {
        return null;
    }

    const expectedSections = ['Findings', 'Evidence', 'Open Questions', 'Recommendation'] as const;
    const sectionBodies = new Map<(typeof expectedSections)[number], string[]>();
    let currentSection: (typeof expectedSections)[number] | null = null;
    let nextExpectedSectionIndex = 0;

    for (const line of normalized.split(/\r?\n/)) {
        const headingMatch = line.match(/^##\s+(.+)$/);
        if (headingMatch) {
            const heading = headingMatch[1]?.trim();
            if (!heading) {
                return null;
            }
            const expectedHeading = expectedSections[nextExpectedSectionIndex];
            if (heading !== expectedHeading) {
                return null;
            }
            currentSection = expectedHeading;
            sectionBodies.set(expectedHeading, []);
            nextExpectedSectionIndex += 1;
            continue;
        }

        if (!currentSection) {
            if (line.trim().length === 0) {
                continue;
            }
            return null;
        }

        sectionBodies.get(currentSection)?.push(line);
    }

    if (nextExpectedSectionIndex !== expectedSections.length) {
        return null;
    }

    const findingsMarkdown = sectionBodies.get('Findings')?.join('\n').trim() ?? '';
    const evidenceMarkdown = sectionBodies.get('Evidence')?.join('\n').trim() ?? '';
    const openQuestionsMarkdown = sectionBodies.get('Open Questions')?.join('\n').trim() ?? '';
    const recommendationMarkdown = sectionBodies.get('Recommendation')?.join('\n').trim() ?? '';

    if (
        findingsMarkdown.length === 0 ||
        evidenceMarkdown.length === 0 ||
        openQuestionsMarkdown.length === 0 ||
        recommendationMarkdown.length === 0
    ) {
        return null;
    }

    return {
        findingsMarkdown,
        evidenceMarkdown,
        openQuestionsMarkdown,
        recommendationMarkdown,
        resultSummaryMarkdown: ['## Findings', '', findingsMarkdown, '', '## Recommendation', '', recommendationMarkdown].join('\n'),
        resultDetailsMarkdown: normalized,
    };
}
