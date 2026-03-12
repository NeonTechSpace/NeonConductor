import type { RunRecord } from '@/app/backend/persistence/types';

export function describeAssistantPlaceholder(input: {
    runStatus: RunRecord['status'] | undefined;
    runErrorMessage: string | undefined;
}): string {
    if (input.runStatus === 'error') {
        return input.runErrorMessage?.trim().length
            ? `Run failed before any assistant output was recorded. ${input.runErrorMessage}`
            : 'Run failed before any assistant output was recorded.';
    }

    if (input.runStatus === 'aborted') {
        return 'Run was aborted before any assistant output was recorded.';
    }

    if (input.runStatus === 'completed') {
        return 'Run completed without any renderable assistant output.';
    }

    return 'Assistant is responding...';
}
