import { err, ok, type Result } from 'neverthrow';

import { compressComposerImageInWorker } from '@/web/components/conversation/hooks/composerImageCompressionClient';
import {
    composerImageCompressionError,
    type ComposerImageCompressionError,
} from '@/web/components/conversation/hooks/composerImageCompressionErrors';

import { readImageMimeType } from '@/app/shared/imageMimeType';

import type { ComposerImageAttachmentInput } from '@/shared/contracts';

const MAX_IMAGE_EDGE_PX = 2048;
const MAX_COMPRESSED_IMAGE_BYTES = 1_500_000;
const JPEG_QUALITY_STEPS = [0.82, 0.74, 0.66, 0.58, 0.5, 0.42] as const;
const DOWNSCALE_RATIO = 0.85;
const MIN_IMAGE_EDGE_PX = 512;

export const MAX_COMPOSER_TOTAL_IMAGE_BYTES = 6_000_000;

export type ComposerPendingImageStatus = 'queued' | 'compressing' | 'ready' | 'failed';

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

type PreparedComposerImageAttachmentResult = Result<PreparedComposerImageAttachment, ComposerImageCompressionError>;
type DrawableImageSource = ImageBitmap | HTMLImageElement;

interface LoadedDrawableImage {
    source: DrawableImageSource;
    width: number;
    height: number;
    release: () => void;
}

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

function createCanvasUnavailableError(message: string): ComposerImageCompressionError {
    return composerImageCompressionError('canvas_unavailable', message);
}

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

async function loadImageElement(file: File): Promise<Result<HTMLImageElement, ComposerImageCompressionError>> {
    const objectUrl = URL.createObjectURL(file);

    try {
        const image = await new Promise<
            { status: 'success'; value: HTMLImageElement } | { status: 'error'; message: string }
        >((resolve) => {
            const element = new Image();
            element.onload = () => {
                resolve({
                    status: 'success',
                    value: element,
                });
            };
            element.onerror = () => {
                resolve({
                    status: 'error',
                    message: `Failed to decode image "${file.name}".`,
                });
            };
            element.src = objectUrl;
        });

        return image.status === 'success'
            ? ok(image.value)
            : err(composerImageCompressionError('decode_failed', image.message));
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

async function loadDrawableImage(file: File): Promise<Result<LoadedDrawableImage, ComposerImageCompressionError>> {
    if (typeof createImageBitmap === 'function') {
        try {
            const imageBitmap = await createImageBitmap(file);
            return ok({
                source: imageBitmap,
                width: imageBitmap.width,
                height: imageBitmap.height,
                release: () => {
                    imageBitmap.close();
                },
            });
        } catch (error) {
            return err(
                composerImageCompressionError(
                    'decode_failed',
                    error instanceof Error ? error.message : `Failed to decode image "${file.name}".`
                )
            );
        }
    }

    const imageResult = await loadImageElement(file);
    if (imageResult.isErr()) {
        return err(imageResult.error);
    }

    return ok({
        source: imageResult.value,
        width: imageResult.value.naturalWidth,
        height: imageResult.value.naturalHeight,
        release: () => {},
    });
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

function createCanvasSurface(width: number, height: number): Result<CanvasSurface, ComposerImageCompressionError> {
    if (typeof OffscreenCanvas !== 'undefined') {
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d');
        if (!context) {
            return err(
                createCanvasUnavailableError('Image compression could not acquire an offscreen 2D canvas context.')
            );
        }

        return ok({
            kind: 'offscreen',
            canvas,
            context,
        });
    }

    if (typeof document === 'undefined') {
        return err(createCanvasUnavailableError('Image compression could not acquire a DOM canvas context.'));
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
        return err(createCanvasUnavailableError('Image compression could not acquire a 2D canvas context.'));
    }

    return ok({
        kind: 'dom',
        canvas,
        context,
    });
}

function renderToCanvas(
    image: DrawableImageSource,
    width: number,
    height: number
): Result<CanvasSurface, ComposerImageCompressionError> {
    const surface = createCanvasSurface(width, height);
    if (surface.isErr()) {
        return err(surface.error);
    }

    surface.value.context.drawImage(image, 0, 0, width, height);
    return ok(surface.value);
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
): Promise<Result<Blob, ComposerImageCompressionError>> {
    try {
        if (surface.kind === 'offscreen') {
            return ok(
                await surface.canvas.convertToBlob({
                    type: mimeType,
                    ...(quality !== undefined ? { quality } : {}),
                })
            );
        }

        const blob = await new Promise<Blob | null>((resolve) => {
            surface.canvas.toBlob(resolve, mimeType, quality);
        });

        if (!blob) {
            return err(
                composerImageCompressionError('encode_failed', 'Image compression could not encode the canvas output.')
            );
        }

        return ok(blob);
    } catch (error) {
        return err(
            composerImageCompressionError(
                'encode_failed',
                error instanceof Error ? error.message : 'Image compression could not encode the canvas output.'
            )
        );
    }
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
): Promise<PreparedComposerImageAttachmentResult> {
    try {
        const buffer = await blob.arrayBuffer();
        const bytesBase64 = bufferToBase64(buffer);
        const sha256 = await sha256Hex(buffer);
        const mimeType = readImageMimeType(blob.type);
        if (!mimeType) {
            return err(
                composerImageCompressionError(
                    'unsupported_output_type',
                    'Image compression produced an unsupported image type.'
                )
            );
        }

        return ok({
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
        });
    } catch (error) {
        return err(
            composerImageCompressionError(
                'encode_failed',
                error instanceof Error ? error.message : 'Image compression failed.'
            )
        );
    }
}

async function prepareComposerImageAttachmentOnMainThread(
    file: File,
    clientId: string
): Promise<PreparedComposerImageAttachmentResult> {
    if (!file.type.startsWith('image/')) {
        return err(composerImageCompressionError('invalid_file_type', `"${file.name}" is not an image file.`));
    }

    const loadedImageResult = await loadDrawableImage(file);
    if (loadedImageResult.isErr()) {
        return err(loadedImageResult.error);
    }

    const loadedImage = loadedImageResult.value;

    try {
        let dimensions = fitDimensions(loadedImage.width, loadedImage.height, MAX_IMAGE_EDGE_PX);
        const initialRender = renderToCanvas(loadedImage.source, dimensions.width, dimensions.height);
        if (initialRender.isErr()) {
            return err(initialRender.error);
        }
        const preservePng = hasTransparentPixels(initialRender.value.context, dimensions.width, dimensions.height);
        releaseCanvas(initialRender.value);

        for (;;) {
            const surface = renderToCanvas(loadedImage.source, dimensions.width, dimensions.height);
            if (surface.isErr()) {
                return err(surface.error);
            }

            try {
                if (preservePng) {
                    const pngBlob = await canvasToBlob(surface.value, 'image/png');
                    if (pngBlob.isErr()) {
                        return err(pngBlob.error);
                    }
                    if (pngBlob.value.size <= MAX_COMPRESSED_IMAGE_BYTES) {
                        return await finalizePreparedAttachment(
                            pngBlob.value,
                            dimensions.width,
                            dimensions.height,
                            clientId
                        );
                    }
                } else {
                    for (const quality of JPEG_QUALITY_STEPS) {
                        const jpegBlob = await canvasToBlob(surface.value, 'image/jpeg', quality);
                        if (jpegBlob.isErr()) {
                            return err(jpegBlob.error);
                        }
                        if (jpegBlob.value.size <= MAX_COMPRESSED_IMAGE_BYTES) {
                            return await finalizePreparedAttachment(
                                jpegBlob.value,
                                dimensions.width,
                                dimensions.height,
                                clientId
                            );
                        }
                    }
                }
            } finally {
                releaseCanvas(surface.value);
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

    return err(
        composerImageCompressionError('size_limit_exceeded', `"${file.name}" could not be compressed below 1.5 MB.`)
    );
}

export async function prepareComposerImageAttachment(
    file: File,
    clientId: string
): Promise<PreparedComposerImageAttachmentResult> {
    if (typeof Worker === 'function') {
        const workerResult = await compressComposerImageInWorker(file, clientId);
        if (workerResult.isOk()) {
            return ok({
                attachment: workerResult.value.attachment,
                byteSize: workerResult.value.byteSize,
                previewUrl: createBlobPreviewUrl(workerResult.value.attachment),
            });
        }
        if (workerResult.error.code !== 'worker_unavailable') {
            return err(workerResult.error);
        }
    }

    return await prepareComposerImageAttachmentOnMainThread(file, clientId);
}

export function createPendingImage(file: File): ComposerPendingImage {
    return {
        clientId: crypto.randomUUID(),
        fileName: file.name,
        sourceFile: file,
        previewUrl: URL.createObjectURL(file),
        status: 'queued',
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
