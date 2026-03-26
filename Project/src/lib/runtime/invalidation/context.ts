import { isEntityId, isProviderId } from '@/web/components/conversation/shell/workspace/helpers';
import { readConversationSelectionState } from '@/web/lib/runtime/invalidation/selectionState';
import type { RuntimeEventContext } from '@/web/lib/runtime/invalidation/types';

import type { RuntimeEventRecordV1 } from '@/app/backend/persistence/types';

import type { EntityId, TopLevelTab } from '@/shared/contracts';

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export function hasPayloadKey(event: RuntimeEventRecordV1, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(event.payload, key);
}

function readPayloadString(event: RuntimeEventRecordV1, key: string): string | undefined {
    return readString(event.payload[key]);
}

function readPayloadEntityId<P extends 'sess' | 'run' | 'thr' | 'tag'>(
    event: RuntimeEventRecordV1,
    key: string,
    prefix: P
): EntityId<P> | undefined {
    const value = readPayloadString(event, key);
    return isEntityId(value, prefix) ? value : undefined;
}

function readPayloadTopLevelTab(event: RuntimeEventRecordV1): TopLevelTab | undefined {
    const value = readPayloadString(event, 'topLevelTab');
    return value === 'chat' || value === 'agent' || value === 'orchestrator' ? value : undefined;
}

export function getRuntimeEventContext(event: RuntimeEventRecordV1): RuntimeEventContext {
    const profileId = readPayloadString(event, 'profileId');
    const sessionId =
        readPayloadEntityId(event, 'sessionId', 'sess') ||
        (event.domain === 'session' && isEntityId(event.entityId, 'sess') ? event.entityId : undefined);
    const runId =
        readPayloadEntityId(event, 'runId', 'run') ||
        (event.domain === 'run' && isEntityId(event.entityId, 'run') ? event.entityId : undefined);
    const threadId =
        readPayloadEntityId(event, 'threadId', 'thr') ||
        (event.domain === 'thread' && isEntityId(event.entityId, 'thr') ? event.entityId : undefined);
    const tagId =
        readPayloadEntityId(event, 'tagId', 'tag') ||
        (event.domain === 'tag' && isEntityId(event.entityId, 'tag') ? event.entityId : undefined);
    const providerValue =
        readPayloadString(event, 'providerId') || (event.domain === 'provider' ? event.entityId : undefined);

    return {
        profileId,
        sessionId,
        runId,
        threadId,
        tagId,
        providerId: isProviderId(providerValue) ? providerValue : undefined,
        modelId: readPayloadString(event, 'modelId'),
        topLevelTab: readPayloadTopLevelTab(event),
        selection: readConversationSelectionState(profileId),
    };
}

export function isSelectedSessionAffected(context: RuntimeEventContext): boolean {
    return Boolean(context.sessionId && context.selection.selectedSessionId === context.sessionId);
}

export function isSelectedRunAffected(context: RuntimeEventContext): boolean {
    return Boolean(context.runId && context.selection.selectedRunId === context.runId);
}

export function isSelectedThreadAffected(context: RuntimeEventContext): boolean {
    return Boolean(context.threadId && context.selection.selectedThreadId === context.threadId);
}

export function hasSelectedWorkspaceImpact(context: RuntimeEventContext): boolean {
    if (isSelectedSessionAffected(context) || isSelectedRunAffected(context)) {
        return true;
    }

    return Boolean(!context.runId && context.sessionId && context.selection.selectedSessionId === context.sessionId);
}
