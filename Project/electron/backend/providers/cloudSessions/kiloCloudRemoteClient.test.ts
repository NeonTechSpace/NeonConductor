import { describe, expect, it } from 'vitest';

import {
    getKiloCloudRemoteClient,
    parseKiloCloudPrepareReceipt,
    parseKiloCloudStreamEvent,
} from '@/app/backend/providers/cloudSessions/kiloCloudRemoteClient';

describe('kiloCloudRemoteClient contracts', () => {
    it('parses non-secret prepare receipts from the Kilo-owned harness contract', () => {
        const parsed = parseKiloCloudPrepareReceipt({
            remoteSessionId: 'remote_session_alpha',
            remoteRunId: 'remote_run_alpha',
            streamTicketId: 'ticket_alpha',
            streamUrl: 'https://cloud.kilo.example/stream',
            expiresAt: '2026-04-28T10:00:00.000Z',
        });

        expect(parsed.isOk()).toBe(true);
        expect(parsed._unsafeUnwrap()).toEqual({
            remoteSessionId: 'remote_session_alpha',
            remoteRunId: 'remote_run_alpha',
            streamTicketId: 'ticket_alpha',
            streamUrl: 'https://cloud.kilo.example/stream',
            expiresAt: '2026-04-28T10:00:00.000Z',
        });
    });

    it('rejects prepare receipts without a stream ticket', () => {
        const parsed = parseKiloCloudPrepareReceipt({
            remoteSessionId: 'remote_session_alpha',
            remoteRunId: 'remote_run_alpha',
        });

        expect(parsed.isErr()).toBe(true);
        expect(parsed._unsafeUnwrapErr()).toMatchObject({
            code: 'invalid_prepare_payload',
            message: 'Kilo Cloud prepare payload is missing "streamTicketId".',
        });
    });

    it('parses stream events into local provider runtime parts', () => {
        const parsed = parseKiloCloudStreamEvent({
            type: 'message_part',
            part: {
                partType: 'text',
                payload: {
                    text: 'Remote harness output',
                },
            },
        });

        expect(parsed.isOk()).toBe(true);
        expect(parsed._unsafeUnwrap()).toEqual({
            kind: 'message_part',
            part: {
                partType: 'text',
                payload: {
                    text: 'Remote harness output',
                },
            },
        });
    });

    it('keeps remote execution disabled until Kilo supplies the prepare and stream contract', async () => {
        const client = getKiloCloudRemoteClient();

        expect(client.getAvailability()).toMatchObject({
            available: false,
            error: {
                code: 'contract_unavailable',
            },
        });
        await expect(client.prepare({} as never)).resolves.toMatchObject({
            error: {
                code: 'contract_unavailable',
            },
        });
    });
});
