import type { RuntimeEventContext, TrpcUtils } from '@/web/lib/runtime/invalidation/types';

import type { RuntimeEventRecordV1 } from '@/app/backend/persistence/types';

import { applyCheckpointRuntimeEventPatch } from './eventPatches/checkpointPatches';
import { applyProviderRuntimeEventPatch } from './eventPatches/providerPatches';
import { applyMessagePartRuntimeEventPatch, applyMessageRuntimeEventPatch, applyRunRuntimeEventPatch } from './eventPatches/sessionPatches';
import { applySessionRuntimeEventPatch, applyTagRuntimeEventPatch, applyThreadRuntimeEventPatch } from './eventPatches/threadPatches';

export function applyRuntimeEventPatches(
    utils: TrpcUtils,
    event: RuntimeEventRecordV1,
    context: RuntimeEventContext
): boolean {
    if (!context.profileId) {
        return false;
    }

    if (event.domain === 'thread') {
        return applyThreadRuntimeEventPatch(utils, event, context);
    }

    if (event.domain === 'session') {
        const applySessionPatch = applySessionRuntimeEventPatch(event);
        return applySessionPatch ? applySessionPatch() : false;
    }

    if (event.domain === 'messagePart') {
        return applyMessagePartRuntimeEventPatch(event, context);
    }

    if (event.domain === 'message') {
        return applyMessageRuntimeEventPatch(event, context);
    }

    if (event.domain === 'run') {
        return applyRunRuntimeEventPatch(utils, event);
    }

    if (event.domain === 'tag') {
        return applyTagRuntimeEventPatch(event);
    }

    if (event.domain === 'checkpoint') {
        return applyCheckpointRuntimeEventPatch(utils, event, context);
    }

    if (event.domain === 'provider') {
        return applyProviderRuntimeEventPatch(utils, event, context);
    }

    return false;
}
