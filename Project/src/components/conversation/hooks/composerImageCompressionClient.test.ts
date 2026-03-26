import { afterEach, describe, expect, it } from 'vitest';

import {
    ComposerImageCompressionClient,
    resetSharedComposerImageCompressionClientForTests,
} from '@/web/components/conversation/hooks/composerImageCompressionClient';
import { composerImageCompressionError } from '@/web/components/conversation/hooks/composerImageCompressionErrors';

import type { ComposerImageAttachmentInput } from '@/shared/contracts';

interface PostedMessage {
    requestId: string;
    clientId: string;
    file: File;
}

class FakeCompressionWorker {
    onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    readonly postedMessages: PostedMessage[] = [];
    terminated = false;

    postMessage(message: PostedMessage) {
        this.postedMessages.push(message);
    }

    terminate() {
        this.terminated = true;
    }
}

function buildAttachment(clientId: string): ComposerImageAttachmentInput {
    return {
        clientId,
        mimeType: 'image/png',
        bytesBase64: 'abc123',
        width: 1,
        height: 1,
        sha256: `${clientId}-sha`,
    };
}

afterEach(() => {
    resetSharedComposerImageCompressionClientForTests();
});

describe('ComposerImageCompressionClient', () => {
    it('queues requests through a shared worker instance', async () => {
        const worker = new FakeCompressionWorker();
        const client = new ComposerImageCompressionClient(() => worker);
        const firstFile = new File(['first'], 'first.png', { type: 'image/png' });
        const secondFile = new File(['second'], 'second.png', { type: 'image/png' });

        const firstPromise = client.compress(firstFile, 'client-first');
        const secondPromise = client.compress(secondFile, 'client-second');

        expect(worker.postedMessages).toHaveLength(1);
        expect(worker.postedMessages[0]?.clientId).toBe('client-first');

        worker.onmessage?.({
            data: {
                requestId: worker.postedMessages[0]?.requestId,
                status: 'success',
                attachment: buildAttachment('client-first'),
                byteSize: 128,
            },
        } as MessageEvent<unknown>);

        await expect(firstPromise).resolves.toMatchObject({
            _unsafeUnwrap: expect.any(Function),
        });
        const firstResult = await firstPromise;
        expect(firstResult.isOk()).toBe(true);
        expect(firstResult._unsafeUnwrap()).toEqual({
            attachment: buildAttachment('client-first'),
            byteSize: 128,
        });

        expect(worker.postedMessages).toHaveLength(2);
        expect(worker.postedMessages[1]?.clientId).toBe('client-second');

        worker.onmessage?.({
            data: {
                requestId: worker.postedMessages[1]?.requestId,
                status: 'success',
                attachment: buildAttachment('client-second'),
                byteSize: 256,
            },
        } as MessageEvent<unknown>);

        const secondResult = await secondPromise;
        expect(secondResult.isOk()).toBe(true);
        expect(secondResult._unsafeUnwrap()).toEqual({
            attachment: buildAttachment('client-second'),
            byteSize: 256,
        });

        client.dispose();
        expect(worker.terminated).toBe(true);
    });

    it('surfaces worker creation failures as a typed fallback result', async () => {
        const client = new ComposerImageCompressionClient(() => {
            throw new Error('worker unavailable');
        });

        const result = await client.compress(
            new File(['fallback'], 'fallback.png', { type: 'image/png' }),
            'client-fallback'
        );

        expect(result).toEqual(
            expect.objectContaining({
                error: composerImageCompressionError('worker_unavailable', 'worker unavailable'),
            })
        );
        expect(result.isErr()).toBe(true);
    });
});
