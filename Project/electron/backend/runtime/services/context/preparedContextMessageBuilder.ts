import { createHash } from 'node:crypto';

import type { ComposerImageAttachmentInput } from '@/app/backend/runtime/contracts';
import { appendPromptMessage, hashablePartContent } from '@/app/backend/runtime/services/runExecution/contextParts';
import type { ReplayMessage } from '@/app/backend/runtime/services/runExecution/contextReplay';
import type { RunContextMessage } from '@/app/backend/runtime/services/runExecution/types';

export interface PreparedContextMessages {
    messages: RunContextMessage[];
    digest: string;
}

export function buildPreparedContextMessages(input: {
    bootstrapMessages: RunContextMessage[];
    postCompactionReseedMessages?: RunContextMessage[];
    replayMessages: ReplayMessage[];
    prompt: string;
    attachments?: ComposerImageAttachmentInput[];
    summaryMessage?: RunContextMessage;
}): RunContextMessage[] {
    return appendPromptMessage({
        messages: [
            ...input.bootstrapMessages,
            ...(input.summaryMessage ? [input.summaryMessage] : []),
            ...(input.postCompactionReseedMessages ?? []),
            ...input.replayMessages.map<RunContextMessage>((message) => ({
                role: message.role,
                parts: message.parts,
            })),
        ],
        prompt: input.prompt,
        ...(input.attachments ? { attachments: input.attachments } : {}),
    });
}

export function buildPreparedContextDigest(messages: RunContextMessage[]): string {
    const hash = createHash('sha256');
    for (const message of messages) {
        hash.update(message.role);
        hash.update('|');
        for (const part of message.parts) {
            hash.update(hashablePartContent(part));
            hash.update('\n');
        }
    }
    return `runctx-${hash.digest('hex').slice(0, 32)}`;
}
