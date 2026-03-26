import { err, ok, type Result } from 'neverthrow';

import {
    composerImageCompressionError,
    type ComposerImageCompressionError,
} from '@/web/components/conversation/hooks/composerImageCompressionErrors';

import type { ComposerImageAttachmentInput } from '@/shared/contracts';

interface ImageCompressionWorkerSuccessMessage {
    requestId: string;
    status: 'success';
    attachment: ComposerImageAttachmentInput;
    byteSize: number;
}

interface ImageCompressionWorkerErrorMessage {
    requestId: string;
    status: 'error';
    message: string;
}

type ImageCompressionWorkerMessage = ImageCompressionWorkerSuccessMessage | ImageCompressionWorkerErrorMessage;

interface ImageCompressionRequest {
    requestId: string;
    clientId: string;
    file: File;
    resolveOutcome: (outcome: ImageCompressionOutcome) => void;
}

type ImageCompressionOutcome =
    | {
          status: 'success';
          value: {
              attachment: ComposerImageAttachmentInput;
              byteSize: number;
          };
      }
    | {
          status: 'error';
          error: ComposerImageCompressionError;
      };

interface ImageCompressionWorkerHandle {
    onmessage: ((event: MessageEvent<ImageCompressionWorkerMessage>) => void) | null;
    onerror: ((event: ErrorEvent) => void) | null;
    postMessage: (message: { requestId: string; clientId: string; file: File }) => void;
    terminate: () => void;
}

export type ComposerImageCompressionWorkerFactory = () => ImageCompressionWorkerHandle;

function createCompressionWorker(): ImageCompressionWorkerHandle {
    return new Worker(new URL('./composerImageCompression.worker.ts', import.meta.url), {
        type: 'module',
    });
}

export class ComposerImageCompressionClient {
    private worker: ImageCompressionWorkerHandle | undefined;
    private activeRequest: ImageCompressionRequest | undefined;
    private readonly queuedRequests: ImageCompressionRequest[] = [];

    constructor(private readonly workerFactory: ComposerImageCompressionWorkerFactory = createCompressionWorker) {}

    compress(
        file: File,
        clientId: string
    ): Promise<
        Result<
            {
                attachment: ComposerImageAttachmentInput;
                byteSize: number;
            },
            ComposerImageCompressionError
        >
    > {
        return new Promise<ImageCompressionOutcome>((resolve) => {
            this.queuedRequests.push({
                requestId: crypto.randomUUID(),
                clientId,
                file,
                resolveOutcome: resolve,
            });
            this.pumpQueue();
        }).then((outcome) => {
            if (outcome.status === 'error') {
                return err(outcome.error);
            }

            return ok(outcome.value);
        });
    }

    dispose(): void {
        const disposedError = composerImageCompressionError(
            'worker_unavailable',
            'Image compression worker was disposed.'
        );
        this.activeRequest?.resolveOutcome({
            status: 'error',
            error: disposedError,
        });
        this.activeRequest = undefined;

        while (this.queuedRequests.length > 0) {
            this.queuedRequests.shift()?.resolveOutcome({
                status: 'error',
                error: disposedError,
            });
        }

        this.teardownWorker();
    }

    private ensureWorker(): ImageCompressionWorkerHandle {
        if (this.worker) {
            return this.worker;
        }

        const worker = this.workerFactory();
        worker.onmessage = (event) => {
            const message = event.data;
            if (!this.activeRequest || message.requestId !== this.activeRequest.requestId) {
                return;
            }

            const activeRequest = this.activeRequest;
            this.activeRequest = undefined;

            if (message.status === 'error') {
                activeRequest.resolveOutcome({
                    status: 'error',
                    error: composerImageCompressionError('worker_unavailable', message.message),
                });
            } else {
                activeRequest.resolveOutcome({
                    status: 'success',
                    value: {
                        attachment: message.attachment,
                        byteSize: message.byteSize,
                    },
                });
            }

            this.pumpQueue();
        };
        worker.onerror = () => {
            const activeRequest = this.activeRequest;
            this.activeRequest = undefined;
            this.teardownWorker();
            activeRequest?.resolveOutcome({
                status: 'error',
                error: composerImageCompressionError('worker_unavailable', 'Image compression worker failed.'),
            });
            this.pumpQueue();
        };
        this.worker = worker;
        return worker;
    }

    private pumpQueue(): void {
        if (this.activeRequest || this.queuedRequests.length === 0) {
            return;
        }

        const nextRequest = this.queuedRequests.shift();
        if (!nextRequest) {
            return;
        }

        let worker: ImageCompressionWorkerHandle;
        try {
            worker = this.ensureWorker();
        } catch (error: unknown) {
            nextRequest.resolveOutcome({
                status: 'error',
                error: composerImageCompressionError(
                    'worker_unavailable',
                    error instanceof Error ? error.message : 'Image compression worker could not be created.'
                ),
            });
            this.pumpQueue();
            return;
        }

        this.activeRequest = nextRequest;
        worker.postMessage({
            requestId: nextRequest.requestId,
            clientId: nextRequest.clientId,
            file: nextRequest.file,
        });
    }

    private teardownWorker(): void {
        this.worker?.terminate();
        this.worker = undefined;
    }
}

let sharedComposerImageCompressionClient: ComposerImageCompressionClient | undefined;

function getSharedComposerImageCompressionClient(): ComposerImageCompressionClient {
    if (!sharedComposerImageCompressionClient) {
        sharedComposerImageCompressionClient = new ComposerImageCompressionClient();
    }

    return sharedComposerImageCompressionClient;
}

export function compressComposerImageInWorker(file: File, clientId: string) {
    return getSharedComposerImageCompressionClient().compress(file, clientId);
}

export function resetSharedComposerImageCompressionClientForTests(): void {
    sharedComposerImageCompressionClient?.dispose();
    sharedComposerImageCompressionClient = undefined;
}
