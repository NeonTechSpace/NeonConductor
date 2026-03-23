import type { RuntimeEventContext, TrpcUtils } from '@/web/lib/runtime/invalidation/types';

import type { RuntimeEventRecordV1 } from '@/app/backend/persistence/types';

import { readCheckpointRecord, readDiffRecord } from './readers';

function isRunId(value: string | undefined): value is `run_${string}` {
    return typeof value === 'string' && value.startsWith('run_');
}

export function applyCheckpointRuntimeEventPatch(
    utils: TrpcUtils,
    event: RuntimeEventRecordV1,
    context: RuntimeEventContext
): boolean {
    const profileId = context.profileId;
    if (!profileId) {
        return false;
    }

    const checkpoint = readCheckpointRecord(event.payload['checkpoint']);
    if (checkpoint) {
        utils.checkpoint.list.setData(
            {
                profileId,
                sessionId: checkpoint.sessionId,
            },
            (current) =>
                current
                    ? {
                          ...current,
                          checkpoints: [checkpoint, ...current.checkpoints.filter((candidate) => candidate.id !== checkpoint.id)],
                      }
                    : current
        );
        const diff = readDiffRecord(event.payload['diff']);
        const runId = diff ? diff.runId ?? undefined : undefined;
        if (diff && isRunId(runId)) {
            utils.diff.listByRun.setData(
                {
                    profileId,
                    runId,
                },
                (current) => ({
                    diffs: [diff, ...(current?.diffs ?? []).filter((candidate) => candidate.id !== diff.id)],
                })
            );
        }
        return true;
    }

    return event.eventType === 'checkpoint.rolled_back' || event.eventType === 'checkpoint.compaction_completed';
}
