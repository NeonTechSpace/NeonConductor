import type { ResolvedContextState } from '@/shared/contracts';

import { ContextSummaryCard } from '@/web/components/conversation/panels/composerActionPanel/contextSummaryCard';
import { formatCompactionTimestamp, formatTokenCount, formatUsagePercent } from '@/web/components/conversation/panels/composerActionPanel/helpers';
import type { ComposerActionFeedback } from '@/web/components/conversation/panels/composerActionPanel/types';

export function ComposerContextSummarySection(input: {
    contextState: ResolvedContextState;
    canCompactContext: boolean;
    isCompactingContext: boolean;
    contextFeedback: ComposerActionFeedback | undefined;
    onCompactContext: (() => void | Promise<void>) | undefined;
}) {
    const thresholdTokens = input.contextState.policy.thresholdTokens;
    const totalTokens = input.contextState.estimate?.totalTokens;
    const usableInputBudgetTokens = input.contextState.policy.usableInputBudgetTokens;
    const hasUsageNumbers = totalTokens !== undefined && usableInputBudgetTokens !== undefined;
    const remainingInputTokens =
        hasUsageNumbers
            ? Math.max(usableInputBudgetTokens - totalTokens, 0)
            : undefined;
    const usagePercent =
        hasUsageNumbers
            ? formatUsagePercent(totalTokens, usableInputBudgetTokens)
            : undefined;
    const countingModeLabel =
        input.contextState.estimate?.mode === 'exact' || input.contextState.countingMode === 'exact'
            ? 'Exact'
            : 'Estimated';

    return (
        <ContextSummaryCard
            hasUsageNumbers={hasUsageNumbers}
            totalTokens={totalTokens}
            usableInputBudgetTokens={usableInputBudgetTokens}
            remainingInputTokens={remainingInputTokens}
            usagePercent={usagePercent}
            countingModeLabel={countingModeLabel}
            missingReason={input.contextState.policy.disabledReason}
            countingMode={input.contextState.countingMode}
            thresholdTokens={thresholdTokens}
            limitsSource={input.contextState.policy.limits.source}
            limitsOverrideReason={input.contextState.policy.limits.overrideReason}
            preparedContextContributorCount={input.contextState.preparedContext.activeContributorCount}
            compactionReseedActive={input.contextState.preparedContext.compactionReseedActive}
            compactionRecord={input.contextState.compaction}
            contextFeedback={input.contextFeedback}
            canCompactContext={input.canCompactContext}
            isCompactingContext={input.isCompactingContext}
            onCompactContext={
                input.onCompactContext
                    ? () => {
                          void input.onCompactContext?.();
                      }
                    : undefined
            }
            formatTokenCount={formatTokenCount}
            formatCompactionTimestamp={formatCompactionTimestamp}
        />
    );
}
