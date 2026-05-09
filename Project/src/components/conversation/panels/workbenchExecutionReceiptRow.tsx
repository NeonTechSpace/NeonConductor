import { formatWorkbenchElapsedMs } from '@/web/components/conversation/messages/workbenchRowFormatting';
import { WorkbenchRowShell } from '@/web/components/conversation/messages/workbenchRowPrimitives';

import type { ExecutionReceipt } from '@/shared/contracts';

export function WorkbenchExecutionReceiptRow({ receipt }: { receipt: ExecutionReceipt }) {
    const dynamicContributors = receipt.contract.preparedContext.contributors.filter(
        (contributor) => contributor.kind === 'dynamic_skill_context'
    );
    const terminalSummary =
        receipt.terminalOutcome.kind === 'failed'
            ? receipt.terminalOutcome.errorMessage
            : receipt.terminalOutcome.kind.replaceAll('_', ' ');

    return (
        <WorkbenchRowShell
            id={receipt.id}
            icon='artifact'
            severity={receipt.terminalOutcome.kind === 'failed' ? 'error' : 'success'}
            title='Execution receipt'
            summary={`Outcome: ${terminalSummary}`}
            defaultCollapsed={false}
            meta={
                receipt.usageSummary.latencyMs ? (
                    <span>{formatWorkbenchElapsedMs(receipt.usageSummary.latencyMs)}</span>
                ) : null
            }>
            <div className='space-y-2'>
                <p className='font-medium'>Outcome: {receipt.terminalOutcome.kind}</p>
                <p className='text-muted-foreground'>
                    Attachments: {String(receipt.contract.attachmentSummary.totalCount)}
                </p>
                {receipt.contract.browserContextSummary ? (
                    <p className='text-muted-foreground'>
                        Browser context: {String(receipt.contract.browserContextSummary.commentCount)} comments ·{' '}
                        {String(receipt.contract.browserContextSummary.selectedElementCount)} elements ·{' '}
                        {String(receipt.contract.browserContextSummary.designerDraftCount)} designer drafts
                    </p>
                ) : null}
                {receipt.contract.browserContextSummary &&
                receipt.contract.browserContextSummary.designDiagnosticCount > 0 ? (
                    <p className='text-muted-foreground'>
                        Design diagnostics: {String(receipt.contract.browserContextSummary.designDiagnosticCount)} total
                        · {String(receipt.contract.browserContextSummary.designDiagnosticErrorCount)} blocking ·{' '}
                        {String(receipt.contract.browserContextSummary.designDiagnosticWarningCount)} warnings
                    </p>
                ) : null}
                {receipt.contract.researchTarget ? (
                    <p className='text-muted-foreground'>
                        Research target: {receipt.contract.researchTarget.locator.name} ·{' '}
                        {receipt.contract.researchTarget.effectiveVcs}
                    </p>
                ) : null}
                {(receipt.contract.documentSummary?.length ?? 0) > 0 ? (
                    <p className='text-muted-foreground'>
                        Documents: {String(receipt.contract.documentSummary?.length ?? 0)} PDF summaries
                    </p>
                ) : null}
                <p className='text-muted-foreground'>
                    Prepared context contributors: {String(receipt.contract.preparedContext.activeContributorCount)}
                </p>
                {receipt.contract.modelOptimizationProfile ? (
                    <p className='text-muted-foreground'>
                        Model optimization: {receipt.contract.modelOptimizationProfile.label} ·{' '}
                        {receipt.contract.modelOptimizationProfile.modelRole}
                    </p>
                ) : null}
                {receipt.contract.preparedContext.effectivePromptPreview ? (
                    <p className='text-muted-foreground'>
                        Effective prompt contributors:{' '}
                        {String(receipt.contract.preparedContext.effectivePromptPreview.includedContributorCount)}
                    </p>
                ) : null}
                <p className='text-muted-foreground'>Tools invoked: {String(receipt.toolsInvoked.length)}</p>
                <p className='text-muted-foreground'>Approvals used: {String(receipt.approvalsUsed.length)}</p>
                <p className='text-muted-foreground'>
                    Cache: {receipt.cacheResult.applied ? 'applied' : (receipt.cacheResult.reason ?? 'not applied')}
                </p>
                <p className='text-muted-foreground'>Memory hits: {String(receipt.memoryHitCount)}</p>
                {receipt.usageSummary.totalTokens !== undefined ? (
                    <p className='text-muted-foreground'>Tokens: {String(receipt.usageSummary.totalTokens)}</p>
                ) : null}
                {dynamicContributors.slice(0, 3).map((contributor) => (
                    <p key={contributor.id} className='text-muted-foreground'>
                        Dynamic context: {contributor.label} (
                        {contributor.dynamicExpansion?.resolutionState ?? 'preview_only'})
                    </p>
                ))}
            </div>
        </WorkbenchRowShell>
    );
}
