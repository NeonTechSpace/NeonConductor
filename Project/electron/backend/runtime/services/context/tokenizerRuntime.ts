import { err, ok, type Result } from 'neverthrow';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { get_encoding, init, type TiktokenEncoding } from 'tiktoken/init';
import tiktokenWasmUrl from 'tiktoken/tiktoken_bg.wasm?url';

import { appLog } from '@/app/main/logging';

export type TokenizerEncodingName = TiktokenEncoding;

export interface TokenizerRuntimeError {
    code: 'tokenizer_init_failed' | 'tokenizer_encode_failed';
    message: string;
}

let tokenizerInitialization: Promise<Result<void, TokenizerRuntimeError>> | null = null;
let tokenizerInitFailureLogged = false;

function resolveTokenizerWasmFilePath(): string {
    const runtimeDirectory = path.dirname(fileURLToPath(import.meta.url));

    if (tiktokenWasmUrl.startsWith('file://')) {
        return fileURLToPath(tiktokenWasmUrl);
    }

    if (path.isAbsolute(tiktokenWasmUrl)) {
        return tiktokenWasmUrl;
    }

    if (tiktokenWasmUrl.startsWith('/')) {
        return path.resolve(runtimeDirectory, `.${tiktokenWasmUrl}`);
    }

    return path.resolve(runtimeDirectory, tiktokenWasmUrl);
}

async function loadTokenizerWasmBytes(): Promise<Uint8Array> {
    if (tiktokenWasmUrl.startsWith('data:')) {
        const base64Payload = tiktokenWasmUrl.split(',').at(1) ?? '';
        return Uint8Array.from(Buffer.from(base64Payload, 'base64'));
    }

    return readFile(resolveTokenizerWasmFilePath());
}

async function initializeTokenizerRuntime(): Promise<Result<void, TokenizerRuntimeError>> {
    try {
        const wasmBytes = await loadTokenizerWasmBytes();
        const webAssemblyApi = globalThis as typeof globalThis & {
            WebAssembly: {
                instantiate: (
                    bytes: Uint8Array,
                    imports?: Record<string, unknown>
                ) => Promise<{
                    instance: object;
                    module: object;
                }>;
            };
        };
        await init((imports) => webAssemblyApi.WebAssembly.instantiate(wasmBytes, imports));
        return ok(undefined);
    } catch (error) {
        const runtimeError: TokenizerRuntimeError = {
            code: 'tokenizer_init_failed',
            message: error instanceof Error ? error.message : 'Tokenizer runtime initialization failed.',
        };

        if (!tokenizerInitFailureLogged) {
            tokenizerInitFailureLogged = true;
            appLog.warn({
                tag: 'context.token-count',
                message: 'Tokenizer runtime initialization failed. Falling back to heuristic estimated token counting.',
                errorCode: runtimeError.code,
                error: runtimeError.message,
            });
        }

        return err(runtimeError);
    }
}

async function ensureTokenizerRuntime(): Promise<Result<void, TokenizerRuntimeError>> {
    if (!tokenizerInitialization) {
        tokenizerInitialization = initializeTokenizerRuntime();
    }

    return tokenizerInitialization;
}

export async function countEncodedTextWithTokenizer(input: {
    encodingName: TokenizerEncodingName;
    text: string;
}): Promise<Result<number, TokenizerRuntimeError>> {
    const tokenizerReady = await ensureTokenizerRuntime();
    if (tokenizerReady.isErr()) {
        return err(tokenizerReady.error);
    }

    try {
        const encoding = get_encoding(input.encodingName);
        try {
            return ok(encoding.encode(input.text).length);
        } finally {
            encoding.free();
        }
    } catch (error) {
        return err({
            code: 'tokenizer_encode_failed',
            message: error instanceof Error ? error.message : 'Tokenizer encoding failed.',
        });
    }
}

export function resetTokenizerRuntimeForTests(): void {
    tokenizerInitialization = null;
    tokenizerInitFailureLogged = false;
}
