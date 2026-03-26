export interface ContextGlobalDraft {
    enabled: boolean;
    percent: string;
}

export interface ContextProfileDraft {
    profileId: string;
    overrideMode: 'inherit' | 'percent' | 'fixed_tokens';
    percent: string;
    fixedInputTokens: string;
}

export function resolveContextGlobalDraft(input: {
    settings:
        | {
              enabled: boolean;
              percent: number;
          }
        | undefined;
    draft: ContextGlobalDraft | undefined;
}): ContextGlobalDraft {
    if (input.draft) {
        return input.draft;
    }

    return {
        enabled: input.settings?.enabled ?? true,
        percent: String(input.settings?.percent ?? 90),
    };
}

export function resolveContextProfileDraft(input: {
    profileId: string;
    inheritedPercent: string;
    settings:
        | {
              overrideMode: 'inherit' | 'percent' | 'fixed_tokens';
              percent?: number;
              fixedInputTokens?: number;
          }
        | undefined;
    draft: ContextProfileDraft | undefined;
}): ContextProfileDraft {
    if (input.draft?.profileId === input.profileId) {
        return input.draft;
    }

    return {
        profileId: input.profileId,
        overrideMode: input.settings?.overrideMode ?? 'inherit',
        percent: input.settings?.percent !== undefined ? String(input.settings.percent) : input.inheritedPercent,
        fixedInputTokens: input.settings?.fixedInputTokens !== undefined ? String(input.settings.fixedInputTokens) : '',
    };
}
