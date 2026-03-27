import { runStore } from '@/app/backend/persistence/stores';
import { InvariantError } from '@/app/backend/runtime/services/common/fatalErrors';
import { emitTransportSelectionEvent } from '@/app/backend/runtime/services/runExecution/eventing';
import type { ProviderRuntimeTransportSelection } from '@/app/backend/providers/types';
import type { EntityId } from '@/shared/contracts';

export async function recordTransportSelectionIfChanged(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
    currentSelection: ProviderRuntimeTransportSelection;
    nextSelection: ProviderRuntimeTransportSelection;
}): Promise<ProviderRuntimeTransportSelection> {
    if (
        input.nextSelection.selected === input.currentSelection.selected &&
        input.nextSelection.degraded === input.currentSelection.degraded &&
        input.nextSelection.degradedReason === input.currentSelection.degradedReason
    ) {
        return input.currentSelection;
    }

    const run = await runStore.updateRuntimeMetadata(input.runId, {
        transportSelected: input.nextSelection.selected,
        ...(input.nextSelection.degradedReason
            ? {
                  transportDegradedReason: input.nextSelection.degradedReason,
              }
            : {}),
    });
    if (!run) {
        throw new InvariantError('Run transport metadata persisted successfully but the updated run snapshot could not be reloaded.');
    }

    await emitTransportSelectionEvent({
        runId: input.runId,
        profileId: input.profileId,
        sessionId: input.sessionId,
        selection: input.nextSelection,
        run,
    });

    return input.nextSelection;
}
