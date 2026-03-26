import { useState } from 'react';

import type { ContextGlobalDraft } from '@/web/components/settings/contextSettingsDrafts';

interface ContextGlobalDefaultsSectionProps {
    initialDraft: ContextGlobalDraft;
    isSaving: boolean;
    onClearFeedback: () => void;
    onSave: (draft: ContextGlobalDraft) => Promise<void>;
}

export function ContextGlobalDefaultsSection({
    initialDraft,
    isSaving,
    onClearFeedback,
    onSave,
}: ContextGlobalDefaultsSectionProps) {
    const [draft, setDraft] = useState(initialDraft);

    return (
        <section className='space-y-3'>
            <div>
                <h4 className='text-sm font-semibold'>Global Default</h4>
                <p className='text-muted-foreground text-xs'>
                    Context management is on by default and compacts older session history before runs when the selected
                    model approaches its input threshold.
                </p>
            </div>

            <label className='flex items-center gap-2 text-sm'>
                <input
                    type='checkbox'
                    checked={draft.enabled}
                    onChange={(event) => {
                        setDraft((current) => ({ ...current, enabled: event.target.checked }));
                        onClearFeedback();
                    }}
                />
                Enable automatic context management
            </label>

            <div className='max-w-sm space-y-1'>
                <label className='text-sm font-medium'>Compact threshold (%)</label>
                <input
                    aria-label='Global context compact threshold percent'
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
                <p className='text-muted-foreground text-xs'>Applies after subtracting the model safety buffer.</p>
            </div>

            <button
                type='button'
                className='border-border bg-background hover:bg-accent rounded-md border px-3 py-2 text-sm'
                disabled={isSaving}
                onClick={() => {
                    void onSave(draft);
                }}>
                Save global defaults
            </button>
        </section>
    );
}
