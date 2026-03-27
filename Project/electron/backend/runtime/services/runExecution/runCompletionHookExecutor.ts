import { okRunExecution, type RunExecutionResult } from '@/app/backend/runtime/services/runExecution/errors';
import type { RunExecutionLoopOutcome } from '@/app/backend/runtime/services/runExecution/types';
import type { UsageAccumulator } from '@/app/backend/runtime/services/runExecution/usage';

export async function executeRunCompletionHook(input: {
    onBeforeFinalize?: () => Promise<void>;
    usage: UsageAccumulator;
}): Promise<RunExecutionResult<RunExecutionLoopOutcome>> {
    if (input.onBeforeFinalize) {
        await input.onBeforeFinalize();
    }

    return okRunExecution({
        kind: 'completed',
        usage: input.usage,
    });
}
