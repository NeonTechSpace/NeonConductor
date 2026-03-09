import { Button } from '@/web/components/ui/button';

import type { ResolvedContextState } from '@/app/backend/runtime/contracts';

interface ProviderOption {
    id: string;
    label: string;
    authState: string;
}

interface ModelOption {
    id: string;
    label: string;
    price?: number;
    latency?: number;
    tps?: number;
}

interface ComposerActionPanelProps {
    prompt: string;
    disabled: boolean;
    isSubmitting: boolean;
    selectedProviderId: string | undefined;
    selectedModelId: string | undefined;
    routingBadge?: string;
    providerOptions: ProviderOption[];
    modelOptions: ModelOption[];
    runErrorMessage: string | undefined;
    contextState?: ResolvedContextState;
    contextErrorMessage?: string;
    canCompactContext?: boolean;
    isCompactingContext?: boolean;
    onProviderChange: (providerId: string) => void;
    onModelChange: (modelId: string) => void;
    onPromptChange: (nextPrompt: string) => void;
    onSubmitPrompt: () => void;
    onCompactContext?: () => void;
}

function formatTokenCount(value: number): string {
    return new Intl.NumberFormat('en-US').format(value);
}

function formatCompactionTimestamp(value: string): string {
    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) {
        return value;
    }
    return timestamp.toLocaleString();
}

export function ComposerActionPanel({
    prompt,
    disabled,
    isSubmitting,
    selectedProviderId,
    selectedModelId,
    routingBadge,
    providerOptions,
    modelOptions,
    runErrorMessage,
    contextState,
    contextErrorMessage,
    canCompactContext = false,
    isCompactingContext = false,
    onProviderChange,
    onModelChange,
    onPromptChange,
    onSubmitPrompt,
    onCompactContext,
}: ComposerActionPanelProps) {
    const thresholdTokens = contextState?.policy.thresholdTokens;
    const totalTokens = contextState?.estimate?.totalTokens;
    const hasUsageNumbers = totalTokens !== undefined && thresholdTokens !== undefined;
    const compactionRecord = contextState?.compaction;

    return (
        <form
            className='border-border mt-3 space-y-2 border-t pt-3'
            onSubmit={(event) => {
                event.preventDefault();
                onSubmitPrompt();
            }}>
            <div className='grid grid-cols-2 gap-2'>
                <select
                    value={selectedProviderId ?? ''}
                    onChange={(event) => {
                        onProviderChange(event.target.value);
                    }}
                    className='border-border bg-background h-9 rounded-md border px-2 text-xs'
                    disabled={disabled || providerOptions.length === 0}>
                    <option value='' disabled>
                        Select provider
                    </option>
                    {providerOptions.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                            {provider.label} ({provider.authState})
                        </option>
                    ))}
                </select>
                <select
                    value={selectedModelId ?? ''}
                    onChange={(event) => {
                        onModelChange(event.target.value);
                    }}
                    className='border-border bg-background h-9 rounded-md border px-2 text-xs'
                    disabled={disabled || modelOptions.length === 0}>
                    <option value='' disabled>
                        Select model
                    </option>
                    {modelOptions.map((model) => (
                        <option key={model.id} value={model.id}>
                            {model.label}
                        </option>
                    ))}
                </select>
            </div>
            {routingBadge ? <p className='text-muted-foreground text-xs'>{routingBadge}</p> : null}
            {runErrorMessage ? <p className='text-destructive text-xs'>{runErrorMessage}</p> : null}
            {contextState ? (
                <div className='border-border bg-card/40 space-y-1 rounded-md border px-3 py-2'>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                        <div className='space-y-0.5'>
                            <p className='text-[11px] font-semibold tracking-[0.14em] uppercase'>Context</p>
                            {hasUsageNumbers ? (
                                <p className='text-muted-foreground text-xs'>
                                    {formatTokenCount(totalTokens)} / {formatTokenCount(thresholdTokens)} token
                                    threshold · {contextState.estimate?.mode === 'exact' ? 'Exact' : 'Estimated'}
                                </p>
                            ) : contextState.policy.disabledReason === 'missing_model_limits' ? (
                                <p className='text-muted-foreground text-xs'>
                                    Token-aware compaction is unavailable because this model has no known context limit.
                                </p>
                            ) : contextState.policy.disabledReason === 'feature_disabled' ? (
                                <p className='text-muted-foreground text-xs'>
                                    Global context management is disabled for this profile.
                                </p>
                            ) : (
                                <p className='text-muted-foreground text-xs'>
                                    Context policy is active with {contextState.countingMode} counting for this model.
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
                            Last compacted {compactionRecord.source} at{' '}
                            {formatCompactionTimestamp(compactionRecord.updatedAt)}.
                        </p>
                    ) : null}
                    <p className='text-muted-foreground text-[11px]'>
                        Limit source: {contextState.policy.limits.source}
                        {contextState.policy.limits.overrideReason
                            ? ` · Override: ${contextState.policy.limits.overrideReason}`
                            : ''}
                    </p>
                    {contextErrorMessage ? <p className='text-destructive text-xs'>{contextErrorMessage}</p> : null}
                </div>
            ) : null}
            <textarea
                value={prompt}
                onChange={(event) => {
                    onPromptChange(event.target.value);
                }}
                rows={3}
                className='border-border bg-background w-full resize-y rounded-md border p-2 text-sm'
                placeholder='Prompt for selected session...'
            />
            <div className='flex justify-end'>
                <Button type='submit' size='sm' disabled={disabled || isSubmitting || prompt.trim().length === 0}>
                    Start Run
                </Button>
            </div>
        </form>
    );
}
