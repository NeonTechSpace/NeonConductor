import type { ComposerImageAttachmentInput } from '@/app/backend/runtime/contracts';

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
    resolve: (result: {
        attachment: ComposerImageAttachmentInput;
        byteSize: number;
    }) => void;
    reject: (error: Error) => void;
}

interface ImageCompressionWorkerHandle {
    onmessage: ((event: MessageEvent<ImageCompressionWorkerMessage>) => void) | null;
    onerror: ((event: ErrorEvent) => void) | null;
    postMessage: (message: {
        requestId: string;
        clientId: string;
        file: File;
    }) => void;
    terminate: () => void;
}

export type ComposerImageCompressionWorkerFactory = () => ImageCompressionWorkerHandle;

function createCompressionWorker(): ImageCompressionWorkerHandle {
    if (typeof Worker !== 'function') {
        throw new Error('Image compression workers are unavailable.');
    }

    return new Worker(new URL('./composerImageCompression.worker.ts', import.meta.url), {
        type: 'module',
    });
}

export class ComposerImageCompressionClient {
    private worker: ImageCompressionWorkerHandle | undefined;
    private activeRequest: ImageCompressionRequest | undefined;
    private readonly queuedRequests: ImageCompressionRequest[] = [];

    constructor(private readonly workerFactory: ComposerImageCompressionWorkerFactory = createCompressionWorker) {}

    compress(file: File, clientId: string): Promise<{
        attachment: ComposerImageAttachmentInput;
        byteSize: number;
    }> {
        return new Promise((resolve, reject) => {
            this.queuedRequests.push({
                requestId: crypto.randomUUID(),
                clientId,
                file,
                resolve,
                reject,
            });
            this.pumpQueue();
        });
    }

    dispose(): void {
        const error = new Error('Image compression worker was disposed.');
        this.activeRequest?.reject(error);
        this.activeRequest = undefined;

        while (this.queuedRequests.length > 0) {
            this.queuedRequests.shift()?.reject(error);
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
                activeRequest.reject(new Error(message.message));
            } else {
                activeRequest.resolve({
                    attachment: message.attachment,
                    byteSize: message.byteSize,
                });
            }

            this.pumpQueue();
        };
        worker.onerror = () => {
            const activeRequest = this.activeRequest;
            this.activeRequest = undefined;
            this.teardownWorker();
            activeRequest?.reject(new Error('Image compression worker failed.'));
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
            nextRequest.reject(
                error instanceof Error ? error : new Error('Image compression worker could not be created.')
            );
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
