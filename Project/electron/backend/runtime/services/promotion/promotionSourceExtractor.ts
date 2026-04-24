import { createHash } from 'node:crypto';

import { getPersistence } from '@/app/backend/persistence/db';
import { toolResultArtifactStore } from '@/app/backend/persistence/stores';
import type {
    EntityId,
    PromotionProvenance,
    PromotionSource,
} from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';

export interface ExtractedPromotionSource {
    source: PromotionSource;
    sourceText: string;
    sourceLabel: string;
    sourceDigest: string;
    lineCount: number;
    sourceRunId?: EntityId<'run'>;
}

export function sha256Text(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function normalizePromotionBodyMarkdown(value: string): string {
    return value.replace(/\r\n?/g, '\n').trim();
}

export function countPromotionLines(value: string): number {
    if (value.length === 0) {
        return 0;
    }
    return value.split('\n').length;
}

export function createPromotionProvenance(input: ExtractedPromotionSource): PromotionProvenance {
    return {
        sourceKind: input.source.kind,
        sourceSessionId: input.source.sessionId,
        ...(input.source.kind === 'message' ? { sourceMessageId: input.source.messageId } : {}),
        ...(input.source.kind === 'tool_result_artifact_window'
            ? {
                  sourceMessagePartId: input.source.messagePartId,
                  startLine: input.source.startLine,
                  lineCount: input.source.lineCount,
              }
            : {}),
        sourceLabel: input.sourceLabel,
        sourceDigest: input.sourceDigest,
        promotedAt: new Date().toISOString(),
    };
}

async function extractMessageSource(input: {
    profileId: string;
    source: Extract<PromotionSource, { kind: 'message' }>;
}): Promise<OperationalResult<ExtractedPromotionSource>> {
    const { db } = getPersistence();
    const message = await db
        .selectFrom('messages')
        .select(['id', 'role', 'run_id'])
        .where('id', '=', input.source.messageId)
        .where('profile_id', '=', input.profileId)
        .where('session_id', '=', input.source.sessionId)
        .executeTakeFirst();
    if (!message) {
        return errOp('not_found', 'The source message could not be found for this session.');
    }
    if (message.role !== 'user' && message.role !== 'assistant') {
        return errOp('invalid_input', 'Only user and assistant messages can be promoted as transcript material.');
    }

    const parts = await db
        .selectFrom('message_parts')
        .select(['part_type', 'payload_json'])
        .where('message_id', '=', input.source.messageId)
        .orderBy('sequence', 'asc')
        .execute();
    const text = parts
        .flatMap((part) => {
            if (part.part_type !== 'text' && part.part_type !== 'text_file_attachment') {
                return [];
            }
            const payload = JSON.parse(part.payload_json) as Record<string, unknown>;
            const partText =
                typeof payload['text'] === 'string' ? normalizePromotionBodyMarkdown(payload['text']) : '';
            return partText.length > 0 ? [partText] : [];
        })
        .join('\n\n');
    if (text.length === 0) {
        return errOp('invalid_input', 'The source message has no promotable text content.');
    }

    return okOp({
        source: input.source,
        sourceText: text,
        sourceLabel: `${message.role} message ${input.source.messageId}`,
        sourceDigest: sha256Text(text),
        lineCount: countPromotionLines(text),
        ...(message.run_id ? { sourceRunId: message.run_id as EntityId<'run'> } : {}),
    });
}

async function extractArtifactWindowSource(input: {
    profileId: string;
    source: Extract<PromotionSource, { kind: 'tool_result_artifact_window' }>;
}): Promise<OperationalResult<ExtractedPromotionSource>> {
    const artifactWindow = await toolResultArtifactStore.readLineWindow({
        messagePartId: input.source.messagePartId,
        startLine: input.source.startLine,
        lineCount: input.source.lineCount,
    });
    if (
        !artifactWindow ||
        artifactWindow.artifact.profileId !== input.profileId ||
        artifactWindow.artifact.sessionId !== input.source.sessionId
    ) {
        return errOp('not_found', 'The source tool artifact window could not be found for this session.');
    }

    const text = normalizePromotionBodyMarkdown(artifactWindow.lines.map((line) => line.text).join('\n'));
    if (text.length === 0) {
        return errOp('invalid_input', 'The selected artifact window has no promotable text content.');
    }

    return okOp({
        source: input.source,
        sourceText: text,
        sourceLabel: `${artifactWindow.artifact.toolName} lines ${String(artifactWindow.startLine)}-${String(
            artifactWindow.lines.at(-1)?.lineNumber ?? artifactWindow.startLine
        )}`,
        sourceDigest: sha256Text(text),
        lineCount: countPromotionLines(text),
        sourceRunId: artifactWindow.artifact.runId,
    });
}

export async function extractPromotionSource(input: {
    profileId: string;
    source: PromotionSource;
}): Promise<OperationalResult<ExtractedPromotionSource>> {
    if (input.source.kind === 'message') {
        return extractMessageSource({
            profileId: input.profileId,
            source: input.source,
        });
    }

    return extractArtifactWindowSource({
        profileId: input.profileId,
        source: input.source,
    });
}
