import { compressComposerImageInWorker } from '@/web/components/conversation/hooks/composerImageCompressionClient';

import type { ComposerImageAttachmentInput } from '@/app/backend/runtime/contracts';
import { readImageMimeType } from '@/app/shared/imageMimeType';

const MAX_IMAGE_EDGE_PX = 2048;
const MAX_COMPRESSED_IMAGE_BYTES = 1_500_000;
const JPEG_QUALITY_STEPS = [0.82, 0.74, 0.66, 0.58, 0.5, 0.42] as const;
const DOWNSCALE_RATIO = 0.85;
const MIN_IMAGE_EDGE_PX = 512;

export const MAX_COMPOSER_IMAGE_COUNT = 4;
export const MAX_COMPOSER_TOTAL_IMAGE_BYTES = 6_000_000;

export type ComposerPendingImageStatus = 'compressing' | 'ready' | 'failed';

export interface ComposerPendingImage {
    clientId: string;
    fileName: string;
    sourceFile: File;
    previewUrl: string;
    status: ComposerPendingImageStatus;
    errorMessage?: string;
    attachment?: ComposerImageAttachmentInput;
    byteSize?: number;
}

export interface PreparedComposerImageAttachment {
    attachment: ComposerImageAttachmentInput;
    byteSize: number;
    previewUrl: string;
}

type DrawableImageSource = ImageBitmap | HTMLImageElement;

type CanvasSurface =
    | {
          kind: 'dom';
          canvas: HTMLCanvasElement;
          context: CanvasRenderingContext2D;
      }
    | {
          kind: 'offscreen';
          canvas: OffscreenCanvas;
          context: OffscreenCanvasRenderingContext2D;
      };

type ReadableCanvasContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function releaseCanvas(surface: CanvasSurface): void {
    surface.canvas.width = 0;
    surface.canvas.height = 0;
}

function revokePreviewUrl(previewUrl: string): void {
    if (previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
    }
}

function decodeBase64Buffer(bytesBase64: string): ArrayBuffer {
    const binary = atob(bytesBase64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function createBlobPreviewUrl(attachment: ComposerImageAttachmentInput): string {
    const blob = new Blob([decodeBase64Buffer(attachment.bytesBase64)], { type: attachment.mimeType });
    return URL.createObjectURL(blob);
}

async function loadImageElement(file: File): Promise<HTMLImageElement> {
    const objectUrl = URL.createObjectURL(file);

    try {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const element = new Image();
            element.onload = () => {
                resolve(element);
            };
            element.onerror = () => {
                reject(new Error(`Failed to decode image "${file.name}".`));
            };
            element.src = objectUrl;
        });

        return image;
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

async function loadDrawableImage(file: File): Promise<{
    source: DrawableImageSource;
    width: number;
    height: number;
    release: () => void;
}> {
    if (typeof createImageBitmap === 'function') {
        const imageBitmap = await createImageBitmap(file);
        return {
            source: imageBitmap,
            width: imageBitmap.width,
            height: imageBitmap.height,
            release: () => {
                imageBitmap.close();
            },
        };
    }

    const image = await loadImageElement(file);
    return {
        source: image,
        width: image.naturalWidth,
        height: image.naturalHeight,
        release: () => {},
    };
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

function createCanvasSurface(width: number, height: number): CanvasSurface {
    if (typeof OffscreenCanvas !== 'undefined') {
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('Image compression could not acquire an offscreen 2D canvas context.');
        }

        return {
            kind: 'offscreen',
            canvas,
            context,
        };
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Image compression could not acquire a 2D canvas context.');
    }

    return {
        kind: 'dom',
        canvas,
        context,
    };
}

function renderToCanvas(
    image: DrawableImageSource,
    width: number,
    height: number
): CanvasSurface {
    const surface = createCanvasSurface(width, height);
    surface.context.drawImage(image, 0, 0, width, height);
    return surface;
}

function hasTransparentPixels(context: ReadableCanvasContext, width: number, height: number): boolean {
    const { data } = context.getImageData(0, 0, width, height);
    for (let index = 3; index < data.length; index += 4) {
        if (data[index] !== 255) {
            return true;
        }
    }

    return false;
}

async function canvasToBlob(
    surface: CanvasSurface,
    mimeType: 'image/jpeg' | 'image/png',
    quality?: number
): Promise<Blob> {
    if (surface.kind === 'offscreen') {
        return surface.canvas.convertToBlob({
            type: mimeType,
            ...(quality !== undefined ? { quality } : {}),
        });
    }

    const blob = await new Promise<Blob | null>((resolve) => {
        surface.canvas.toBlob(resolve, mimeType, quality);
    });

    if (!blob) {
        throw new Error('Image compression could not encode the canvas output.');
    }

    return blob;
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

async function finalizePreparedAttachment(
    blob: Blob,
    width: number,
    height: number,
    clientId: string
): Promise<PreparedComposerImageAttachment> {
    const buffer = await blob.arrayBuffer();
    const bytesBase64 = bufferToBase64(buffer);
    const sha256 = await sha256Hex(buffer);
    const mimeType = readImageMimeType(blob.type);
    if (!mimeType) {
        throw new Error('Image compression produced an unsupported image type.');
    }

    return {
        attachment: {
            clientId,
            mimeType,
            bytesBase64,
            width,
            height,
            sha256,
        },
        byteSize: blob.size,
        previewUrl: createBlobPreviewUrl({
            clientId,
            mimeType,
            bytesBase64,
            width,
            height,
            sha256,
        }),
    };
}

async function prepareComposerImageAttachmentOnMainThread(
    file: File,
    clientId: string
): Promise<PreparedComposerImageAttachment> {
    if (!file.type.startsWith('image/')) {
        throw new Error(`"${file.name}" is not an image file.`);
    }

    const loadedImage = await loadDrawableImage(file);

    try {
        let dimensions = fitDimensions(loadedImage.width, loadedImage.height, MAX_IMAGE_EDGE_PX);
        const initialRender = renderToCanvas(loadedImage.source, dimensions.width, dimensions.height);
        const preservePng = hasTransparentPixels(initialRender.context, dimensions.width, dimensions.height);
        releaseCanvas(initialRender);

        for (;;) {
            const surface = renderToCanvas(loadedImage.source, dimensions.width, dimensions.height);

            try {
                if (preservePng) {
                    const pngBlob = await canvasToBlob(surface, 'image/png');
                    if (pngBlob.size <= MAX_COMPRESSED_IMAGE_BYTES) {
                        return await finalizePreparedAttachment(pngBlob, dimensions.width, dimensions.height, clientId);
                    }
                } else {
                    for (const quality of JPEG_QUALITY_STEPS) {
                        const jpegBlob = await canvasToBlob(surface, 'image/jpeg', quality);
                        if (jpegBlob.size <= MAX_COMPRESSED_IMAGE_BYTES) {
                            return await finalizePreparedAttachment(
                                jpegBlob,
                                dimensions.width,
                                dimensions.height,
                                clientId
                            );
                        }
                    }
                }
            } finally {
                releaseCanvas(surface);
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
        loadedImage.release();
    }

    throw new Error(
        `"${file.name}" could not be compressed below 1.5 MB.`
    );
}

export async function prepareComposerImageAttachment(
    file: File,
    clientId: string
): Promise<PreparedComposerImageAttachment> {
    if (typeof Worker === 'function') {
        try {
            const response = await compressComposerImageInWorker(file, clientId);
            return {
                attachment: response.attachment,
                byteSize: response.byteSize,
                previewUrl: createBlobPreviewUrl(response.attachment),
            };
        } catch {
            // Fall back to the main thread path when workers or worker-side APIs are unavailable.
        }
    }

    return prepareComposerImageAttachmentOnMainThread(file, clientId);
}

export function createPendingImage(file: File): ComposerPendingImage {
    return {
        clientId: crypto.randomUUID(),
        fileName: file.name,
        sourceFile: file,
        previewUrl: URL.createObjectURL(file),
        status: 'compressing',
    };
}

export function releasePendingImageResources(image: ComposerPendingImage): void {
    revokePreviewUrl(image.previewUrl);
}

export function summarizeReadyImageBytes(images: ComposerPendingImage[], excludingClientId?: string): number {
    return images.reduce((total, image) => {
        if (image.clientId === excludingClientId || image.status !== 'ready') {
            return total;
        }

        return total + (image.byteSize ?? 0);
    }, 0);
}
