import { Button } from '@/web/components/ui/button';

interface ContextSummaryCardProps {
    hasUsageNumbers: boolean;
    totalTokens: number | undefined;
    usableInputBudgetTokens: number | undefined;
    remainingInputTokens: number | undefined;
    usagePercent: string | undefined;
    countingModeLabel: string;
    missingReason: string | undefined;
    countingMode: string | undefined;
    thresholdTokens: number | undefined;
    limitsSource: string;
    limitsOverrideReason: string | undefined;
    compactionRecord:
        | {
              source: string;
              updatedAt: string;
          }
        | undefined;
    contextFeedback:
        | {
              message: string;
              tone: 'success' | 'error' | 'info';
          }
        | undefined;
    canCompactContext: boolean;
    isCompactingContext: boolean;
    onCompactContext: (() => void) | undefined;
    formatTokenCount: (value: number) => string;
    formatCompactionTimestamp: (value: string) => string;
}

export function ContextSummaryCard({
    hasUsageNumbers,
    totalTokens,
    usableInputBudgetTokens,
    remainingInputTokens,
    usagePercent,
    countingModeLabel,
    missingReason,
    countingMode,
    thresholdTokens,
    limitsSource,
    limitsOverrideReason,
    compactionRecord,
    contextFeedback,
    canCompactContext,
    isCompactingContext,
    onCompactContext,
    formatTokenCount,
    formatCompactionTimestamp,
}: ContextSummaryCardProps) {
    return (
        <div className='border-border bg-card/40 space-y-1 rounded-md border px-3 py-2'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
                <div className='space-y-0.5'>
                    <p className='text-[11px] font-semibold tracking-[0.14em] uppercase'>Context</p>
                    {hasUsageNumbers && totalTokens !== undefined && usableInputBudgetTokens !== undefined ? (
                        <>
                            <p className='text-xs font-medium'>
                                {formatTokenCount(totalTokens)} used of {formatTokenCount(usableInputBudgetTokens)}{' '}
                                usable input tokens
                            </p>
                            <div className='text-muted-foreground grid gap-1 text-[11px] sm:grid-cols-3'>
                                <p>Remaining {formatTokenCount(remainingInputTokens ?? 0)}</p>
                                <p>Usage {usagePercent}</p>
                                <p>{countingModeLabel} counting</p>
                            </div>
                        </>
                    ) : missingReason === 'missing_model_limits' ? (
                        <p className='text-muted-foreground text-xs'>
                            Current thread usage is unavailable because this model has no known context limit yet.
                        </p>
                    ) : missingReason === 'feature_disabled' ? (
                        <p className='text-muted-foreground text-xs'>
                            Current thread usage is unavailable because context management is disabled for this profile.
                        </p>
                    ) : missingReason === 'multimodal_counting_unavailable' ? (
                        <p className='text-muted-foreground text-xs'>
                            Current thread usage is unavailable for image sessions because multimodal token counting is
                            not implemented yet.
                        </p>
                    ) : (
                        <p className='text-muted-foreground text-xs'>
                            Current thread usage is active with {countingMode} counting for this model.
                        </p>
                    )}
                </div>
                {onCompactContext ? (
                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        disabled={!canCompactContext || isCompactingContext}
                        onClick={onCompactContext}>
                        {isCompactingContext ? 'Compacting...' : 'Compact now'}
                    </Button>
                ) : null}
            </div>
            {compactionRecord ? (
                <p className='text-muted-foreground text-[11px]'>
                    Last compacted {compactionRecord.source} at {formatCompactionTimestamp(compactionRecord.updatedAt)}.
                </p>
            ) : null}
            {thresholdTokens !== undefined ? (
                <p className='text-muted-foreground text-[11px]'>
                    Compaction threshold: {formatTokenCount(thresholdTokens)} tokens.
                </p>
            ) : null}
            <p className='text-muted-foreground text-[11px]'>
                Limit source: {limitsSource}
                {limitsOverrideReason ? ` · Override: ${limitsOverrideReason}` : ''}
            </p>
            {contextFeedback ? (
                <p
                    className={`text-xs ${
                        contextFeedback.tone === 'error'
                            ? 'text-destructive'
                            : contextFeedback.tone === 'success'
                              ? 'text-primary'
                              : 'text-muted-foreground'
                    }`}>
                    {contextFeedback.message}
                </p>
            ) : null}
        </div>
    );
}
