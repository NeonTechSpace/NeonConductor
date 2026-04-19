import type { SkillDynamicContextSource } from '@/shared/contracts';

export interface SkillDynamicContextSummary {
    sourceCount: number;
    unsafeCount: number;
    invalidCount: number;
}

export function summarizeSkillDynamicContext(
    sources: SkillDynamicContextSource[] | undefined
): SkillDynamicContextSummary {
    const normalizedSources = sources ?? [];
    return {
        sourceCount: normalizedSources.length,
        unsafeCount: normalizedSources.filter((source) => source.effectiveSafetyClass === 'unsafe').length,
        invalidCount: normalizedSources.filter((source) => source.validationState === 'invalid').length,
    };
}

