import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import type { DocumentArtifactPageWrite } from '@/app/backend/persistence/stores/conversation/attachments/documentArtifactStore';

const MAX_EXTRACTED_PAGES = 200;
const PDF_EXTRACTION_TIMEOUT_MS = 15_000;

type PdfJsModule = {
    getDocument: (input: PdfDocumentInitParameters) => PdfLoadingTask;
};

type PdfDocumentInitParameters = {
    data: Uint8Array;
    disableFontFace: boolean;
    useSystemFonts: boolean;
    useWorkerFetch: boolean;
    useWasm: boolean;
    isOffscreenCanvasSupported: boolean;
    isImageDecoderSupported: boolean;
    stopAtErrors: boolean;
};

type PdfLoadingTask = {
    promise: Promise<PdfDocument>;
    destroy: () => Promise<void> | void;
};

type PdfDocument = {
    numPages: number;
    getPage: (pageNumber: number) => Promise<PdfPage>;
    destroy: () => Promise<void>;
};

type PdfPage = {
    getTextContent: (input: { disableNormalization: boolean }) => Promise<{ items: unknown[] }>;
    cleanup: () => void;
};

class TextOnlyDOMMatrix {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;

    constructor(init?: Iterable<number>) {
        const values = init ? Array.from(init) : [];
        this.a = values[0] ?? 1;
        this.b = values[1] ?? 0;
        this.c = values[2] ?? 0;
        this.d = values[3] ?? 1;
        this.e = values[4] ?? 0;
        this.f = values[5] ?? 0;
    }

    translate(x = 0, y = 0): TextOnlyDOMMatrix {
        return new TextOnlyDOMMatrix([this.a, this.b, this.c, this.d, this.e + x, this.f + y]);
    }

    scale(scaleX = 1, scaleY = scaleX): TextOnlyDOMMatrix {
        return new TextOnlyDOMMatrix([
            this.a * scaleX,
            this.b * scaleX,
            this.c * scaleY,
            this.d * scaleY,
            this.e,
            this.f,
        ]);
    }

    multiplySelf(other: TextOnlyDOMMatrix): TextOnlyDOMMatrix {
        const a = this.a * other.a + this.c * other.b;
        const b = this.b * other.a + this.d * other.b;
        const c = this.a * other.c + this.c * other.d;
        const d = this.b * other.c + this.d * other.d;
        const e = this.a * other.e + this.c * other.f + this.e;
        const f = this.b * other.e + this.d * other.f + this.f;
        this.a = a;
        this.b = b;
        this.c = c;
        this.d = d;
        this.e = e;
        this.f = f;
        return this;
    }

    preMultiplySelf(other: TextOnlyDOMMatrix): TextOnlyDOMMatrix {
        const next = new TextOnlyDOMMatrix([other.a, other.b, other.c, other.d, other.e, other.f]).multiplySelf(this);
        this.a = next.a;
        this.b = next.b;
        this.c = next.c;
        this.d = next.d;
        this.e = next.e;
        this.f = next.f;
        return this;
    }

    invertSelf(): TextOnlyDOMMatrix {
        const determinant = this.a * this.d - this.b * this.c;
        if (determinant === 0) {
            this.a = Number.NaN;
            this.b = Number.NaN;
            this.c = Number.NaN;
            this.d = Number.NaN;
            this.e = Number.NaN;
            this.f = Number.NaN;
            return this;
        }
        const a = this.d / determinant;
        const b = -this.b / determinant;
        const c = -this.c / determinant;
        const d = this.a / determinant;
        const e = (this.c * this.f - this.d * this.e) / determinant;
        const f = (this.b * this.e - this.a * this.f) / determinant;
        this.a = a;
        this.b = b;
        this.c = c;
        this.d = d;
        this.e = e;
        this.f = f;
        return this;
    }
}

function installPdfTextExtractionGlobals(): void {
    const globals = globalThis as Record<string, unknown>;
    globals.DOMMatrix ??= TextOnlyDOMMatrix;
}

async function loadPdfJs(): Promise<PdfJsModule> {
    installPdfTextExtractionGlobals();
    return import('pdfjs-dist/legacy/build/pdf.mjs') as Promise<PdfJsModule>;
}

function sha256Hex(bytes: Uint8Array | string): string {
    return createHash('sha256').update(bytes).digest('hex');
}

function estimateTextTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

function countUtf8Bytes(text: string): number {
    return Buffer.byteLength(text, 'utf8');
}

function normalizePdfText(text: string): string {
    return text
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function readTextContentItemText(item: unknown): string {
    if (!item || typeof item !== 'object') {
        return '';
    }
    const text = (item as { str?: unknown }).str;
    return typeof text === 'string' ? text : '';
}

async function withTimeout<T>(input: { promise: Promise<T>; timeoutMs: number; onTimeout?: () => void }): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            input.promise,
            new Promise<never>((_, reject) => {
                timeout = setTimeout(() => {
                    input.onTimeout?.();
                    reject(new Error('PDF extraction timed out.'));
                }, input.timeoutMs);
            }),
        ]);
    } finally {
        if (timeout) {
            clearTimeout(timeout);
        }
    }
}

export async function extractPdfPages(bytes: Uint8Array): Promise<{
    pageCount: number;
    pages: DocumentArtifactPageWrite[];
}> {
    const { getDocument } = await loadPdfJs();
    const loadingTask = getDocument({
        data: Uint8Array.from(bytes),
        disableFontFace: true,
        useSystemFonts: false,
        useWorkerFetch: false,
        useWasm: false,
        isOffscreenCanvasSupported: false,
        isImageDecoderSupported: false,
        stopAtErrors: false,
    });

    const pdf = await withTimeout({
        promise: loadingTask.promise,
        timeoutMs: PDF_EXTRACTION_TIMEOUT_MS,
        onTimeout: () => {
            void loadingTask.destroy();
        },
    });

    try {
        const pageCount = pdf.numPages;
        const pages: DocumentArtifactPageWrite[] = [];
        const pagesToExtract = Math.min(pageCount, MAX_EXTRACTED_PAGES);
        for (let pageNumber = 1; pageNumber <= pagesToExtract; pageNumber += 1) {
            const page = await pdf.getPage(pageNumber);
            const textContent = await page.getTextContent({
                disableNormalization: false,
            });
            const text = normalizePdfText(textContent.items.map(readTextContentItemText).filter(Boolean).join(' '));
            const textByteSize = countUtf8Bytes(text);
            pages.push({
                pageNumber,
                textContent: text,
                ...(text.length > 0 ? { textSha256: sha256Hex(text) } : {}),
                textByteSize,
                estimatedTokenCount: estimateTextTokens(text),
            });
            page.cleanup();
        }
        return { pageCount, pages };
    } finally {
        await pdf.destroy();
        await loadingTask.destroy();
    }
}
