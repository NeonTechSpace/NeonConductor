import { runStore, runUsageStore, sessionStore } from '@/app/backend/persistence/stores';
import { getProviderRuntimeBehavior } from '@/app/backend/providers/behaviors';
import { InvariantError } from '@/app/backend/runtime/services/common/fatalErrors';
import type { RunTerminalOutcome } from '@/app/backend/runtime/services/runExecution/types';

import type { EntityId, ProviderAuthMethod, RuntimeProviderId } from '@/shared/contracts';

type FinalizedRun = Exclude<Awaited<ReturnType<typeof runStore.finalize>>, null>;
type RunUsageRecord = Awaited<ReturnType<typeof runUsageStore.upsert>>;

export interface RunTerminalPersistenceResult {
    run: FinalizedRun;
    usageRecord?: RunUsageRecord;
}

export async function persistRunTerminalOutcome(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
    outcome: RunTerminalOutcome;
    threadId?: EntityId<'thr'>;
    providerId?: RuntimeProviderId;
    modelId?: string;
    authMethod?: ProviderAuthMethod | 'none';
}): Promise<RunTerminalPersistenceResult> {
    if (input.outcome.kind === 'completed') {
        if (!input.threadId || !input.providerId || !input.modelId) {
            throw new InvariantError('Completed terminal outcome requires thread, provider, and model context.');
        }

        const run = await runStore.finalize(input.runId, {
            status: 'completed',
        });
        if (!run) {
            throw new InvariantError(
                'Run completion persisted successfully but the updated run snapshot could not be reloaded.'
            );
        }

        await sessionStore.markRunTerminal(input.profileId, input.sessionId, 'completed');

        const behavior = getProviderRuntimeBehavior(input.providerId);
        const usageRecord = await runUsageStore.upsert({
            runId: input.runId,
            providerId: input.providerId,
            modelId: input.modelId,
            billedVia: behavior.resolveBilledVia(input.authMethod ?? 'none'),
            ...input.outcome.usage,
        });

        return {
            run,
            usageRecord,
        };
    }

    if (input.outcome.kind === 'aborted') {
        const run = await runStore.finalize(input.runId, {
            status: 'aborted',
        });
        if (!run) {
            throw new InvariantError(
                'Run abort persisted successfully but the updated run snapshot could not be reloaded.'
            );
        }

        await sessionStore.markRunTerminal(input.profileId, input.sessionId, 'aborted');

        return {
            run,
        };
    }

    const run = await runStore.finalize(input.runId, {
        status: 'error',
        errorCode: input.outcome.errorCode,
        errorMessage: input.outcome.errorMessage,
    });
    if (!run) {
        throw new InvariantError(
            'Run failure persisted successfully but the updated run snapshot could not be reloaded.'
        );
    }

    await sessionStore.markRunTerminal(input.profileId, input.sessionId, 'error');

    return {
        run,
    };
}
