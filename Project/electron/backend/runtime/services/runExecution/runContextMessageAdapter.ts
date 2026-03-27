import { Buffer } from 'node:buffer';

import { messageMediaStore } from '@/app/backend/persistence/stores';
import type { ProviderRuntimeInput } from '@/app/backend/providers/types';
import type { RunContextMessage } from '@/app/backend/runtime/services/runExecution/types';

type ProviderContextMessage = NonNullable<ProviderRuntimeInput['contextMessages']>[number];

export async function resolveRunContextMessages(input: {
    contextMessages?: RunContextMessage[];
}): Promise<ProviderContextMessage[] | undefined> {
    if (!input.contextMessages) {
        return undefined;
    }

    return Promise.all(
        input.contextMessages.map(async (message) => ({
            role: message.role,
            parts: (
                await Promise.all(
                    message.parts.map(async (part) => {
                        if (
                            part.type === 'text' ||
                            part.type === 'reasoning' ||
                            part.type === 'reasoning_summary' ||
                            part.type === 'reasoning_encrypted' ||
                            part.type === 'tool_call' ||
                            part.type === 'tool_result'
                        ) {
                            return part;
                        }

                        const mediaPayload = part.dataUrl
                            ? undefined
                            : part.mediaId
                              ? await messageMediaStore.getPayload(part.mediaId)
                              : null;
                        const dataUrl =
                            part.dataUrl ??
                            (mediaPayload
                                ? `data:${mediaPayload.mimeType};base64,${Buffer.from(mediaPayload.bytes).toString('base64')}`
                                : null);
                        if (!dataUrl) {
                            return null;
                        }

                        return {
                            type: 'image' as const,
                            dataUrl,
                            mimeType: part.mimeType,
                            width: part.width,
                            height: part.height,
                        };
                    })
                )
            ).filter((part): part is NonNullable<typeof part> => part !== null),
        }))
    );
}
