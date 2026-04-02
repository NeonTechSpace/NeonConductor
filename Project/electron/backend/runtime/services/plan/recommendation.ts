import type {
    PlanAdvancedSnapshotView,
    PlanResearchCapacityView,
    PlanResearchRecommendationView,
} from '@/app/backend/runtime/contracts';
import type {
    PlanEvidenceAttachmentRecord,
    PlanFollowUpRecord,
    PlanItemRecord,
    PlanRecord,
} from '@/app/backend/persistence/types';

function normalizeText(value: string): string {
    return value.trim().toLowerCase();
}

function containsPlaceholderText(value: string): boolean {
    const normalized = normalizeText(value);
    if (normalized.length === 0) {
        return true;
    }

    return (
        normalized.includes('not established yet') ||
        normalized.includes('placeholder') ||
        normalized.includes('to be determined') ||
        normalized === 'tbd' ||
        normalized.includes('[unanswered]') ||
        normalized.includes('scaffold') ||
        normalized.includes('unknown')
    );
}

function countOpenFollowUps(followUps: PlanFollowUpRecord[]): number {
    return followUps.filter((followUp) => followUp.status === 'open').length;
}

function countPhases(snapshot?: PlanAdvancedSnapshotView): number {
    return snapshot?.phases.length ?? 0;
}

export function buildPlanResearchRecommendation(input: {
    plan: PlanRecord;
    items: PlanItemRecord[];
    followUps: PlanFollowUpRecord[];
    advancedSnapshot?: PlanAdvancedSnapshotView;
    evidenceAttachments: PlanEvidenceAttachmentRecord[];
    capacity: PlanResearchCapacityView;
}): PlanResearchRecommendationView {
    if (input.plan.planningDepth !== 'advanced') {
        return {
            recommended: false,
            priority: 'low',
            reasons: ['Planner research is only available on advanced plans.'],
            suggestedWorkerCount: 1,
        };
    }

    const reasons: string[] = [];
    let score = 0;
    const openFollowUpCount = countOpenFollowUps(input.followUps);
    const phaseCount = countPhases(input.advancedSnapshot);
    const itemCount = input.items.length;
    const evidenceMarkdown = input.advancedSnapshot?.evidenceMarkdown ?? '';
    const rootCauseMarkdown = input.advancedSnapshot?.rootCauseMarkdown ?? '';

    if (input.evidenceAttachments.length === 0) {
        reasons.push('No evidence attachments exist for the current revision yet.');
        score += 2;
    }

    if (containsPlaceholderText(rootCauseMarkdown)) {
        reasons.push('The root cause section is still a placeholder or unresolved.');
        score += 2;
    }

    if (containsPlaceholderText(evidenceMarkdown)) {
        reasons.push('The evidence section is still scaffold-like or incomplete.');
        score += 2;
    }

    if (openFollowUpCount > 0) {
        reasons.push(`${String(openFollowUpCount)} follow-up item${openFollowUpCount === 1 ? '' : 's'} remain open.`);
        score += 1 + Math.min(openFollowUpCount, 2);
    }

    if (phaseCount >= 4 || itemCount >= 6) {
        reasons.push('The plan already has enough structure to justify parallel research coverage.');
        score += 3;
    } else if (phaseCount >= 3 || itemCount >= 4) {
        reasons.push('The plan has enough breadth that a focused research pass could reduce risk.');
        score += 2;
    } else if (itemCount >= 2) {
        score += 1;
    }

    if (input.plan.summaryMarkdown.length >= 800) {
        reasons.push('The current summary is large enough that a research pass may clarify hidden complexity.');
        score += 1;
    }

    const priority: PlanResearchRecommendationView['priority'] =
        score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low';
    const recommended = priority !== 'low';

    const suggestedWorkerCount =
        priority === 'high'
            ? Math.max(2, Math.min(input.capacity.hardMaxWorkerCount, Math.max(input.capacity.recommendedWorkerCount, 3)))
            : priority === 'medium'
              ? Math.max(1, Math.min(input.capacity.hardMaxWorkerCount, input.capacity.recommendedWorkerCount))
              : 1;

    return {
        recommended,
        priority,
        reasons:
            reasons.length > 0
                ? reasons
                : ['The current advanced plan looks straightforward enough to continue without research.'],
        suggestedWorkerCount,
    };
}
