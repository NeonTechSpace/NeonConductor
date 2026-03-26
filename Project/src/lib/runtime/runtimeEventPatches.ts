

import { applyCheckpointRuntimeEventPatch } from '@/web/lib/runtime/eventPatches/checkpointPatches';
import { applyProviderRuntimeEventPatch } from '@/web/lib/runtime/eventPatches/providerPatches';
import {
    applyMessagePartRuntimeEventPatch,
    applyMessageRuntimeEventPatch,
    applyRunRuntimeEventPatch,
} from '@/web/lib/runtime/eventPatches/sessionPatches';
import {
    applySessionRuntimeEventPatch,
    applyTagRuntimeEventPatch,
    applyThreadRuntimeEventPatch,
} from '@/web/lib/runtime/eventPatches/threadPatches';
import type { RuntimeEventContext, TrpcUtils } from '@/web/lib/runtime/invalidation/types';

import type { RuntimeEventRecordV1 } from '@/app/backend/persistence/types';

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

