import {
    formatQueuedExecutionTargetSummary,
    getQueuedDynamicContributors,
} from '@/web/components/conversation/panels/queuedRunReviewModel';
import { OperatorDiagnosticList } from '@/web/components/ui/operatorDiagnosticList';
import { buildOutboxReviewDiagnostics } from '@/web/lib/operatorDiagnostics';

import type { SessionOutboxEntry } from '@/shared/contracts';

export function QueuedRunReviewSummary({ entry }: { entry: SessionOutboxEntry }) {
    const diagnostics = buildOutboxReviewDiagnostics(entry);
    const dynamicContributors = getQueuedDynamicContributors(entry);

    return (
        <div className='space-y-2 text-xs'>
            <p className='text-muted-foreground'>{entry.prompt}</p>
            <p className='text-muted-foreground'>
                Attachments: {String(entry.attachmentIds.length)} · Context contributors:{' '}
                {String(entry.latestRunContract?.preparedContext.activeContributorCount ?? 0)}
            </p>
            <p className='text-muted-foreground'>Execution target: {formatQueuedExecutionTargetSummary(entry)}</p>
            {entry.latestRunContract?.modelOptimizationProfile ? (
                <p className='text-muted-foreground'>
                    Model optimization: {entry.latestRunContract.modelOptimizationProfile.label} ·{' '}
                    {entry.latestRunContract.modelOptimizationProfile.modelRole}
                </p>
            ) : null}
            {entry.latestRunContract?.preparedContext.effectivePromptPreview ? (
                <p className='text-muted-foreground'>
                    Effective prompt:{' '}
                    {String(entry.latestRunContract.preparedContext.effectivePromptPreview.includedContributorCount)}{' '}
                    contributors
                </p>
            ) : null}
            <p className='text-muted-foreground'>
                Browser context:{' '}
                {entry.browserContextSummary
                    ? `${String(entry.browserContextSummary.commentCount)} comments · ${String(entry.browserContextSummary.selectedElementCount)} elements · ${String(entry.browserContextSummary.designerDraftCount)} designer drafts · ${entry.browserContextSummary.targetLabel}`
                    : 'none'}
            </p>
            {entry.browserContextSummary && entry.browserContextSummary.designDiagnosticCount > 0 ? (
                <p className='text-muted-foreground'>
                    Design diagnostics: {String(entry.browserContextSummary.designDiagnosticCount)} total ·{' '}
                    {String(entry.browserContextSummary.designDiagnosticErrorCount)} blocking ·{' '}
                    {String(entry.browserContextSummary.designDiagnosticWarningCount)} warnings
                </p>
            ) : null}
            <p className='text-muted-foreground'>
                Trust mix: trusted{' '}
                {String(entry.latestRunContract?.trustSummary.contributorCountByTrustLevel.trusted_instruction ?? 0)} ·
                user {String(entry.latestRunContract?.trustSummary.contributorCountByTrustLevel.user_input ?? 0)}
            </p>
            {entry.pausedReason ? <p className='text-amber-700 dark:text-amber-300'>{entry.pausedReason}</p> : null}
            {entry.latestRunContract?.diffFromLastCompatible?.items.slice(0, 3).map((item, index) => (
                <p key={`diff-${String(index)}`} className='text-muted-foreground'>
                    {item.field}: {item.reason}
                </p>
            ))}
            {dynamicContributors.slice(0, 3).map((contributor) => (
                <p key={contributor.id} className='text-muted-foreground'>
                    Dynamic context: {contributor.label} (
                    {contributor.dynamicExpansion?.resolutionState ?? 'preview_only'})
                </p>
            ))}
            <OperatorDiagnosticList diagnostics={diagnostics} compact />
        </div>
    );
}
