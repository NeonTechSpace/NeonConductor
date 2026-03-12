import { useState } from 'react';

import type { ContextProfileDraft } from '@/web/components/settings/contextSettingsDrafts';

interface ContextProfileOverrideSectionProps {
    initialDraft: ContextProfileDraft;
    isSaving: boolean;
    modelLimitsKnown: boolean;
    onClearFeedback: () => void;
    onSave: (draft: ContextProfileDraft) => Promise<void>;
}

export function ContextProfileOverrideSection({
    initialDraft,
    isSaving,
    modelLimitsKnown,
    onClearFeedback,
    onSave,
}: ContextProfileOverrideSectionProps) {
    const [draft, setDraft] = useState(initialDraft);

    return (
        <section className='space-y-3'>
            <div>
                <h4 className='text-sm font-semibold'>Profile Override</h4>
                <p className='text-muted-foreground text-xs'>
                    Override the global default for the selected profile with either another percentage or a fixed
                    input-token ceiling.
                </p>
            </div>

            <div className='max-w-sm space-y-1'>
                <label className='text-sm font-medium'>Override mode</label>
                <select
                    aria-label='Profile override mode'
                    value={draft.overrideMode}
                    onChange={(event) => {
                        const value = event.target.value;
                        if (value !== 'inherit' && value !== 'percent' && value !== 'fixed_tokens') {
                            return;
                        }
                        setDraft((current) => ({ ...current, overrideMode: value }));
                        onClearFeedback();
                    }}
                    className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm'>
                    <option value='inherit'>Inherit global default</option>
                    <option value='percent'>Use a profile-specific percentage</option>
                    <option value='fixed_tokens'>Use a fixed input token budget</option>
                </select>
            </div>

            {draft.overrideMode === 'percent' ? (
                <div className='max-w-sm space-y-1'>
                    <label className='text-sm font-medium'>Profile threshold (%)</label>
                    <input
                        aria-label='Profile-specific threshold percent'
                        type='number'
                        min={1}
                        max={100}
                        value={draft.percent}
                        onChange={(event) => {
                            setDraft((current) => ({ ...current, percent: event.target.value }));
                            onClearFeedback();
                        }}
                        className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm'
                    />
                </div>
            ) : null}

            {draft.overrideMode === 'fixed_tokens' ? (
                <div className='max-w-sm space-y-1'>
                    <label className='text-sm font-medium'>Fixed input tokens</label>
                    <input
                        aria-label='Fixed input token budget'
                        type='number'
                        min={1}
                        value={draft.fixedInputTokens}
                        onChange={(event) => {
                            setDraft((current) => ({ ...current, fixedInputTokens: event.target.value }));
                            onClearFeedback();
                        }}
                        className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm'
                        disabled={!modelLimitsKnown}
                    />
                    {!modelLimitsKnown ? (
                        <p className='text-muted-foreground text-xs'>
                            Fixed-token overrides need a model with a known context length.
                        </p>
                    ) : null}
                </div>
            ) : null}

            <button
                type='button'
                className='border-border bg-background hover:bg-accent rounded-md border px-3 py-2 text-sm'
                disabled={isSaving}
                onClick={() => {
                    void onSave(draft);
                }}>
                Save profile override
            </button>
        </section>
    );
}
