import {
    readEntityId,
    readEnumValue,
    readObject,
    readOptionalNumber,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import type { PromotionSource } from '@/app/backend/runtime/contracts/types';

export function parsePromotionSource(value: unknown): PromotionSource {
    const source = readObject(value, 'source');
    const kind = readEnumValue(source.kind, 'source.kind', ['message', 'tool_result_artifact_window'] as const);
    const sessionId = readEntityId(source.sessionId, 'source.sessionId', 'sess');

    if (kind === 'message') {
        return {
            kind,
            sessionId,
            messageId: readEntityId(source.messageId, 'source.messageId', 'msg'),
        };
    }

    return {
        kind,
        sessionId,
        messagePartId: readEntityId(source.messagePartId, 'source.messagePartId', 'part'),
        startLine: Math.max(1, Math.floor(readOptionalNumber(source.startLine, 'source.startLine') ?? 1)),
        lineCount: Math.min(400, Math.max(1, Math.floor(readOptionalNumber(source.lineCount, 'source.lineCount') ?? 1))),
    };
}
