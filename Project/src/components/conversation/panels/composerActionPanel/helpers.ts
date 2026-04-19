import type { RuntimeReasoningEffort } from '@/shared/contracts';

export function formatTokenCount(value: number): string {
    return new Intl.NumberFormat('en-US').format(value);
}

export function formatUsagePercent(usedTokens: number, budgetTokens: number): string {
    if (!Number.isFinite(usedTokens) || !Number.isFinite(budgetTokens) || budgetTokens <= 0) {
        return '-';
    }

    return `${Math.round((usedTokens / budgetTokens) * 100).toString()}%`;
}

export function formatCompactionTimestamp(value: string): string {
    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) {
        return value;
    }
    return timestamp.toLocaleString();
}

export function formatImageBytes(value?: number): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    return `${(value / 1_000_000).toFixed(2)} MB`;
}

export function formatAttachmentBytes(value?: number): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    if (value >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(2)} MB`;
    }

    if (value >= 1_000) {
        return `${(value / 1_000).toFixed(1)} KB`;
    }

    return `${String(value)} B`;
}

export function extractDroppedFiles(dataTransfer: DataTransfer | null): File[] {
    if (!dataTransfer) {
        return [];
    }

    return Array.from(dataTransfer.files);
}

export function extractClipboardFiles(clipboardData: DataTransfer | null): File[] {
    if (!clipboardData) {
        return [];
    }

    return Array.from(clipboardData.items)
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
}

export function shouldSubmitComposerOnEnter(input: {
    key: string;
    shiftKey: boolean;
    nativeEvent: { isComposing?: boolean };
}): boolean {
    return input.key === 'Enter' && !input.shiftKey && input.nativeEvent.isComposing !== true;
}

export const reasoningEffortOptions: Array<{ value: RuntimeReasoningEffort; label: string }> = [
    { value: 'none', label: 'Off' },
    { value: 'minimal', label: 'Minimal' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'xhigh', label: 'Max' },
];
