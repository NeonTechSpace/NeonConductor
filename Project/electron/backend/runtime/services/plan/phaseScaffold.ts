import type {
    PlanEvidenceAttachmentRecord,
    PlanItemRecord,
    PlanRecord,
} from '@/app/backend/persistence/types';
import type { PlanAdvancedSnapshotView, PlanPhaseOutlineInput } from '@/app/backend/runtime/contracts';

export interface PlanPhaseScaffold {
    summaryMarkdown: string;
    itemDescriptions: string[];
}

function buildPhaseScaffoldItems(input: {
    phaseOutline: PlanPhaseOutlineInput;
    planItems: PlanItemRecord[];
    evidenceAttachments: PlanEvidenceAttachmentRecord[];
}): string[] {
    const descriptions: string[] = [
        `Align this phase with "${input.phaseOutline.title}".`,
        `Work through the stated goal: ${input.phaseOutline.goalMarkdown}`,
        `Verify the exit criteria: ${input.phaseOutline.exitCriteriaMarkdown}`,
    ];

    if (input.planItems.length > 0) {
        descriptions.push(
            `Reference the current plan roadmap item "${input.planItems[0]?.description ?? 'the current plan roadmap'}".`
        );
    }

    if (input.evidenceAttachments.length > 0) {
        descriptions.push(
            `Incorporate the most relevant evidence attachment "${input.evidenceAttachments[0]?.label ?? 'the most relevant evidence attachment'}".`
        );
    }

    return descriptions.slice(0, 4);
}

export function buildPhaseExpansionScaffold(input: {
    plan: PlanRecord;
    advancedSnapshot: PlanAdvancedSnapshotView;
    phaseOutline: PlanPhaseOutlineInput;
    planItems: PlanItemRecord[];
    evidenceAttachments: PlanEvidenceAttachmentRecord[];
}): PlanPhaseScaffold {
    const itemDescriptions = buildPhaseScaffoldItems({
        phaseOutline: input.phaseOutline,
        planItems: input.planItems,
        evidenceAttachments: input.evidenceAttachments,
    });

    return {
        summaryMarkdown: [
            `## ${input.phaseOutline.title}`,
            '',
            `This detailed phase expands the approved roadmap phase from the advanced plan.`,
            '',
            '### Goal',
            input.phaseOutline.goalMarkdown,
            '',
            '### Exit Criteria',
            input.phaseOutline.exitCriteriaMarkdown,
            '',
            '### Anchor',
            `- Master roadmap summary: ${input.plan.summaryMarkdown}`,
            `- Source prompt: ${input.plan.sourcePrompt}`,
            `- Approved roadmap phases: ${String(input.advancedSnapshot.phases.length)}`,
            `- Evidence attachments carried into this phase: ${String(input.evidenceAttachments.length)}`,
        ].join('\n'),
        itemDescriptions,
    };
}
