import { err, ok, type Result } from 'neverthrow';

import type { ProviderRuntimePart } from '@/app/backend/providers/types';
import { runtimeMessagePartTypes } from '@/app/backend/runtime/contracts';

export type KiloCloudRemoteClientErrorCode =
    | 'contract_unavailable'
    | 'invalid_prepare_payload'
    | 'invalid_stream_event'
    | 'remote_error'
    | 'request_failed'
    | 'request_unavailable'
    | 'unauthorized';

export interface KiloCloudRemoteClientError {
    code: KiloCloudRemoteClientErrorCode;
    message: string;
    status?: number;
}

export interface KiloCloudPrepareInput {
    accessToken: string;
    profileId: string;
    sessionId: string;
    cloudSessionId: string;
    remoteSessionId: string;
    remoteScopeKey: string;
    prompt: string;
}

export interface KiloCloudPrepareReceipt {
    remoteSessionId: string;
    remoteRunId: string;
    streamTicketId: string;
    streamUrl?: string;
    expiresAt?: string;
}

export type KiloCloudHarnessState = 'preparing' | 'streaming' | 'completed' | 'failed' | 'aborted';

export type KiloCloudStreamEvent =
    | {
          kind: 'harness_state';
          state: KiloCloudHarnessState;
          label?: string;
      }
    | {
          kind: 'message_part';
          part: ProviderRuntimePart;
      }
    | {
          kind: 'completed';
      }
    | {
          kind: 'failed';
          errorCode: string;
          errorMessage: string;
      };

export interface KiloCloudRemoteClient {
    getAvailability(): { available: true } | { available: false; error: KiloCloudRemoteClientError };
    prepare(input: KiloCloudPrepareInput): Promise<Result<KiloCloudPrepareReceipt, KiloCloudRemoteClientError>>;
    stream(
        receipt: KiloCloudPrepareReceipt,
        options?: { signal?: AbortSignal }
    ): AsyncIterable<Result<KiloCloudStreamEvent, KiloCloudRemoteClientError>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readRequiredString(source: Record<string, unknown>, field: string): Result<string, KiloCloudRemoteClientError> {
    const value = source[field];
    if (typeof value === 'string' && value.trim().length > 0) {
        return ok(value.trim());
    }

    return err({
        code: 'invalid_prepare_payload',
        message: `Kilo Cloud prepare payload is missing "${field}".`,
    });
}

function isRuntimeMessagePartType(value: unknown): value is ProviderRuntimePart['partType'] {
    return typeof value === 'string' && runtimeMessagePartTypes.some((partType) => partType === value);
}

export function parseKiloCloudPrepareReceipt(
    payload: unknown
): Result<KiloCloudPrepareReceipt, KiloCloudRemoteClientError> {
    if (!isRecord(payload)) {
        return err({
            code: 'invalid_prepare_payload',
            message: 'Kilo Cloud prepare payload must be an object.',
        });
    }

    const remoteSessionId = readRequiredString(payload, 'remoteSessionId');
    const remoteRunId = readRequiredString(payload, 'remoteRunId');
    const streamTicketId = readRequiredString(payload, 'streamTicketId');
    if (remoteSessionId.isErr()) {
        return err(remoteSessionId.error);
    }
    if (remoteRunId.isErr()) {
        return err(remoteRunId.error);
    }
    if (streamTicketId.isErr()) {
        return err(streamTicketId.error);
    }

    const streamUrl = payload['streamUrl'];
    const expiresAt = payload['expiresAt'];
    return ok({
        remoteSessionId: remoteSessionId.value,
        remoteRunId: remoteRunId.value,
        streamTicketId: streamTicketId.value,
        ...(typeof streamUrl === 'string' && streamUrl.trim().length > 0 ? { streamUrl: streamUrl.trim() } : {}),
        ...(typeof expiresAt === 'string' && expiresAt.trim().length > 0 ? { expiresAt: expiresAt.trim() } : {}),
    });
}

export function parseKiloCloudStreamEvent(payload: unknown): Result<KiloCloudStreamEvent, KiloCloudRemoteClientError> {
    if (!isRecord(payload)) {
        return err({
            code: 'invalid_stream_event',
            message: 'Kilo Cloud stream event must be an object.',
        });
    }

    const type = payload['type'];
    if (type === 'harness_state') {
        const state = payload['state'];
        if (
            state !== 'preparing' &&
            state !== 'streaming' &&
            state !== 'completed' &&
            state !== 'failed' &&
            state !== 'aborted'
        ) {
            return err({
                code: 'invalid_stream_event',
                message: 'Kilo Cloud harness state event has an invalid state.',
            });
        }
        const label = payload['label'];
        return ok({
            kind: 'harness_state',
            state,
            ...(typeof label === 'string' && label.trim().length > 0 ? { label: label.trim() } : {}),
        });
    }

    if (type === 'message_part') {
        const part = payload['part'];
        if (!isRecord(part) || !isRuntimeMessagePartType(part['partType']) || !isRecord(part['payload'])) {
            return err({
                code: 'invalid_stream_event',
                message: 'Kilo Cloud message part event has an invalid part payload.',
            });
        }
        return ok({
            kind: 'message_part',
            part: {
                partType: part['partType'],
                payload: part['payload'],
            },
        });
    }

    if (type === 'completed') {
        return ok({ kind: 'completed' });
    }

    if (type === 'failed') {
        const errorCode = payload['errorCode'];
        const errorMessage = payload['errorMessage'];
        if (typeof errorCode !== 'string' || typeof errorMessage !== 'string') {
            return err({
                code: 'invalid_stream_event',
                message: 'Kilo Cloud failure event must include error code and message.',
            });
        }
        return ok({
            kind: 'failed',
            errorCode,
            errorMessage,
        });
    }

    return err({
        code: 'invalid_stream_event',
        message: 'Kilo Cloud stream event type is not recognized.',
    });
}

class DisabledKiloCloudRemoteClient implements KiloCloudRemoteClient {
    getAvailability(): { available: false; error: KiloCloudRemoteClientError } {
        return {
            available: false,
            error: {
                code: 'contract_unavailable',
                message:
                    'Kilo Cloud remote execution is waiting for the Kilo-owned prepare and stream contract. Neon will not emulate the remote harness locally or create local sync-back for the remote workspace.',
            },
        };
    }

    prepare(): Promise<Result<KiloCloudPrepareReceipt, KiloCloudRemoteClientError>> {
        return Promise.resolve(err(this.getAvailability().error));
    }

    stream(): AsyncIterable<Result<KiloCloudStreamEvent, KiloCloudRemoteClientError>> {
        return {
            [Symbol.asyncIterator]() {
                return {
                    next() {
                        return Promise.resolve({
                            done: true as const,
                            value: undefined,
                        });
                    },
                };
            },
        };
    }
}

let activeKiloCloudRemoteClient: KiloCloudRemoteClient = new DisabledKiloCloudRemoteClient();

export function getKiloCloudRemoteClient(): KiloCloudRemoteClient {
    return activeKiloCloudRemoteClient;
}

export function setKiloCloudRemoteClientForTests(client: KiloCloudRemoteClient): () => void {
    const previous = activeKiloCloudRemoteClient;
    activeKiloCloudRemoteClient = client;
    return () => {
        activeKiloCloudRemoteClient = previous;
    };
}
