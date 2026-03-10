import type { ComposerImageAttachmentInput } from '@/app/backend/runtime/contracts';
import { readImageMimeType } from '@/app/shared/imageMimeType';

const MAX_IMAGE_EDGE_PX = 2048;
const MAX_COMPRESSED_IMAGE_BYTES = 1_500_000;
const JPEG_QUALITY_STEPS = [0.82, 0.74, 0.66, 0.58, 0.5, 0.42] as const;
const DOWNSCALE_RATIO = 0.85;
const MIN_IMAGE_EDGE_PX = 512;

interface CompressionRequestMessage {
    requestId: string;
    clientId: string;
    file: File;
}

interface CompressionSuccessMessage {
    requestId: string;
    status: 'success';
    attachment: ComposerImageAttachmentInput;
    byteSize: number;
}

interface CompressionErrorMessage {
    requestId: string;
    status: 'error';
    message: string;
}

function fitDimensions(width: number, height: number, maxEdge: number): { width: number; height: number } {
    if (width <= maxEdge && height <= maxEdge) {
        return { width, height };
    }

    const scale = maxEdge / Math.max(width, height);
    return {
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale)),
    };
}

function downscaleDimensions(width: number, height: number): { width: number; height: number } {
    return {
        width: Math.max(MIN_IMAGE_EDGE_PX, Math.round(width * DOWNSCALE_RATIO)),
        height: Math.max(MIN_IMAGE_EDGE_PX, Math.round(height * DOWNSCALE_RATIO)),
    };
}

function bufferToBase64(bytes: ArrayBuffer): string {
    const chunkSize = 0x8000;
    const view = new Uint8Array(bytes);
    let output = '';

    for (let offset = 0; offset < view.length; offset += chunkSize) {
        const slice = view.subarray(offset, offset + chunkSize);
        output += String.fromCharCode(...slice);
    }

    return btoa(output);
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

async function canvasToBlob(
    canvas: OffscreenCanvas,
    mimeType: 'image/jpeg' | 'image/png',
    quality?: number
): Promise<Blob> {
    return canvas.convertToBlob({
        type: mimeType,
        ...(quality !== undefined ? { quality } : {}),
    });
}

async function finalizePreparedAttachment(
    blob: Blob,
    width: number,
    height: number,
    clientId: string
): Promise<CompressionSuccessMessage['attachment'] & { byteSize: number }> {
    const buffer = await blob.arrayBuffer();
    const bytesBase64 = bufferToBase64(buffer);
    const sha256 = await sha256Hex(buffer);
    const mimeType = readImageMimeType(blob.type);
    if (!mimeType) {
        throw new Error('Image compression produced an unsupported image type.');
    }

    return {
        clientId,
        mimeType,
        bytesBase64,
        width,
        height,
        sha256,
        byteSize: blob.size,
    };
}

async function compressImage(file: File, clientId: string): Promise<CompressionSuccessMessage> {
    if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
        throw new Error('Image compression worker is unavailable.');
    }

    const imageBitmap = await createImageBitmap(file);

    try {
        let dimensions = fitDimensions(imageBitmap.width, imageBitmap.height, MAX_IMAGE_EDGE_PX);
        const initialCanvas = new OffscreenCanvas(dimensions.width, dimensions.height);
        const initialContext = initialCanvas.getContext('2d');
        if (!initialContext) {
            throw new Error('Image compression worker could not acquire a 2D canvas context.');
        }

        initialContext.drawImage(imageBitmap, 0, 0, dimensions.width, dimensions.height);
        const initialImageData = initialContext.getImageData(0, 0, dimensions.width, dimensions.height);
        const preservePng = initialImageData.data.some((value, index) => index % 4 === 3 && value !== 255);

        for (;;) {
            const canvas = new OffscreenCanvas(dimensions.width, dimensions.height);
            const context = canvas.getContext('2d');
            if (!context) {
                throw new Error('Image compression worker could not acquire a 2D canvas context.');
            }

            context.drawImage(imageBitmap, 0, 0, dimensions.width, dimensions.height);

            if (preservePng) {
                const pngBlob = await canvasToBlob(canvas, 'image/png');
                if (pngBlob.size <= MAX_COMPRESSED_IMAGE_BYTES) {
                    const prepared = await finalizePreparedAttachment(pngBlob, dimensions.width, dimensions.height, clientId);
                    return {
                        requestId: '',
                        status: 'success',
                        attachment: {
                            clientId: prepared.clientId,
                            mimeType: prepared.mimeType,
                            bytesBase64: prepared.bytesBase64,
                            width: prepared.width,
                            height: prepared.height,
                            sha256: prepared.sha256,
                        },
                        byteSize: prepared.byteSize,
                    };
                }
            } else {
                for (const quality of JPEG_QUALITY_STEPS) {
                    const jpegBlob = await canvasToBlob(canvas, 'image/jpeg', quality);
                    if (jpegBlob.size <= MAX_COMPRESSED_IMAGE_BYTES) {
                        const prepared = await finalizePreparedAttachment(jpegBlob, dimensions.width, dimensions.height, clientId);
                        return {
                            requestId: '',
                            status: 'success',
                            attachment: {
                                clientId: prepared.clientId,
                                mimeType: prepared.mimeType,
                                bytesBase64: prepared.bytesBase64,
                                width: prepared.width,
                                height: prepared.height,
                                sha256: prepared.sha256,
                            },
                            byteSize: prepared.byteSize,
                        };
                    }
                }
            }

            const nextDimensions = downscaleDimensions(dimensions.width, dimensions.height);
            if (nextDimensions.width === dimensions.width && nextDimensions.height === dimensions.height) {
                break;
            }
            if (dimensions.width <= MIN_IMAGE_EDGE_PX && dimensions.height <= MIN_IMAGE_EDGE_PX) {
                break;
            }

            dimensions = nextDimensions;
        }
    } finally {
        imageBitmap.close();
    }

    throw new Error(`"${file.name}" could not be compressed below 1.5 MB.`);
}

self.onmessage = (event: MessageEvent<CompressionRequestMessage>) => {
    const { requestId, clientId, file } = event.data;

    void compressImage(file, clientId)
        .then((result) => {
            const message: CompressionSuccessMessage = {
                ...result,
                requestId,
            };
            self.postMessage(message);
        })
        .catch((error: unknown) => {
            const message: CompressionErrorMessage = {
                requestId,
                status: 'error',
                message: error instanceof Error ? error.message : 'Image compression failed.',
            };
            self.postMessage(message);
        });
};
