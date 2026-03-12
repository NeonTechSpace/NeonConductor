export interface UsageAccumulator {
    inputTokens?: number;
    outputTokens?: number;
    cachedTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
    latencyMs?: number;
    costMicrounits?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readOptionalFiniteNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sumOptionalNumbers(left: number | undefined, right: number | undefined): number | undefined {
    if (left === undefined) {
        return right;
    }

    if (right === undefined) {
        return left;
    }

    return left + right;
}

export function mergeUsage(current: UsageAccumulator, next: unknown): UsageAccumulator {
    const merged: UsageAccumulator = {};

    if (current.inputTokens !== undefined) merged.inputTokens = current.inputTokens;
    if (current.outputTokens !== undefined) merged.outputTokens = current.outputTokens;
    if (current.cachedTokens !== undefined) merged.cachedTokens = current.cachedTokens;
    if (current.reasoningTokens !== undefined) merged.reasoningTokens = current.reasoningTokens;
    if (current.totalTokens !== undefined) merged.totalTokens = current.totalTokens;
    if (current.latencyMs !== undefined) merged.latencyMs = current.latencyMs;
    if (current.costMicrounits !== undefined) merged.costMicrounits = current.costMicrounits;

    if (isRecord(next)) {
        const inputTokens = readOptionalFiniteNumber(next['inputTokens']);
        const outputTokens = readOptionalFiniteNumber(next['outputTokens']);
        const cachedTokens = readOptionalFiniteNumber(next['cachedTokens']);
        const reasoningTokens = readOptionalFiniteNumber(next['reasoningTokens']);
        const totalTokens = readOptionalFiniteNumber(next['totalTokens']);
        const latencyMs = readOptionalFiniteNumber(next['latencyMs']);
        const costMicrounits = readOptionalFiniteNumber(next['costMicrounits']);

        if (inputTokens !== undefined) merged.inputTokens = inputTokens;
        if (outputTokens !== undefined) merged.outputTokens = outputTokens;
        if (cachedTokens !== undefined) merged.cachedTokens = cachedTokens;
        if (reasoningTokens !== undefined) merged.reasoningTokens = reasoningTokens;
        if (totalTokens !== undefined) merged.totalTokens = totalTokens;
        if (latencyMs !== undefined) merged.latencyMs = latencyMs;
        if (costMicrounits !== undefined) merged.costMicrounits = costMicrounits;
    }

    return merged;
}

export function accumulateUsage(current: UsageAccumulator, next: unknown): UsageAccumulator {
    if (!isRecord(next)) {
        return current;
    }

    const inputTokens = readOptionalFiniteNumber(next['inputTokens']);
    const outputTokens = readOptionalFiniteNumber(next['outputTokens']);
    const cachedTokens = readOptionalFiniteNumber(next['cachedTokens']);
    const reasoningTokens = readOptionalFiniteNumber(next['reasoningTokens']);
    const totalTokens = readOptionalFiniteNumber(next['totalTokens']);
    const latencyMs = readOptionalFiniteNumber(next['latencyMs']);
    const costMicrounits = readOptionalFiniteNumber(next['costMicrounits']);

    const accumulated: UsageAccumulator = {};

    const nextInputTokens = sumOptionalNumbers(current.inputTokens, inputTokens);
    const nextOutputTokens = sumOptionalNumbers(current.outputTokens, outputTokens);
    const nextCachedTokens = sumOptionalNumbers(current.cachedTokens, cachedTokens);
    const nextReasoningTokens = sumOptionalNumbers(current.reasoningTokens, reasoningTokens);
    const nextTotalTokens = sumOptionalNumbers(current.totalTokens, totalTokens);
    const nextLatencyMs = sumOptionalNumbers(current.latencyMs, latencyMs);
    const nextCostMicrounits = sumOptionalNumbers(current.costMicrounits, costMicrounits);

    if (nextInputTokens !== undefined) accumulated.inputTokens = nextInputTokens;
    if (nextOutputTokens !== undefined) accumulated.outputTokens = nextOutputTokens;
    if (nextCachedTokens !== undefined) accumulated.cachedTokens = nextCachedTokens;
    if (nextReasoningTokens !== undefined) accumulated.reasoningTokens = nextReasoningTokens;
    if (nextTotalTokens !== undefined) accumulated.totalTokens = nextTotalTokens;
    if (nextLatencyMs !== undefined) accumulated.latencyMs = nextLatencyMs;
    if (nextCostMicrounits !== undefined) accumulated.costMicrounits = nextCostMicrounits;

    return accumulated;
}
