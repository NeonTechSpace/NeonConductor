import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('tokenizerRuntime', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
    });

    it('lazily initializes once and encodes text successfully', async () => {
        const initSpy = vi.fn(() => Promise.resolve());
        const encodeSpy = vi.fn(() => Uint32Array.from([1, 2, 3]));
        const freeSpy = vi.fn();
        const getEncodingSpy = vi.fn(() => ({
            encode: encodeSpy,
            free: freeSpy,
        }));

        vi.doMock('node:fs/promises', () => ({
            readFile: vi.fn(() => Promise.resolve(Uint8Array.from([0, 97, 115, 109]))),
        }));
        vi.doMock('tiktoken/init', () => ({
            get_encoding: getEncodingSpy,
            init: initSpy,
        }));
        vi.doMock('tiktoken/tiktoken_bg.wasm?url', () => ({
            default: './assets/mock-tiktoken.wasm',
        }));

        const tokenizerRuntime = await import('@/app/backend/runtime/services/context/tokenizerRuntime');
        tokenizerRuntime.resetTokenizerRuntimeForTests();

        const firstTokenCount = await tokenizerRuntime.countEncodedTextWithTokenizer({
            encodingName: 'cl100k_base',
            text: 'hello world',
        });
        const secondTokenCount = await tokenizerRuntime.countEncodedTextWithTokenizer({
            encodingName: 'cl100k_base',
            text: 'hello again',
        });

        expect(firstTokenCount.isOk()).toBe(true);
        expect(secondTokenCount.isOk()).toBe(true);
        expect(initSpy).toHaveBeenCalledTimes(1);
        expect(getEncodingSpy).toHaveBeenCalledTimes(2);
        expect(encodeSpy).toHaveBeenCalledTimes(2);
        expect(freeSpy).toHaveBeenCalledTimes(2);
        if (firstTokenCount.isErr()) {
            throw new Error(firstTokenCount.error.message);
        }
        expect(firstTokenCount.value).toBe(3);
    });

    it('returns a recoverable error when tokenizer initialization fails', async () => {
        vi.doMock('node:fs/promises', () => ({
            readFile: vi.fn(() => Promise.resolve(Uint8Array.from([0, 97, 115, 109]))),
        }));
        vi.doMock('tiktoken/init', () => ({
            get_encoding: vi.fn(),
            init: vi.fn(() => Promise.reject(new Error('failed to initialize wasm'))),
        }));
        vi.doMock('tiktoken/tiktoken_bg.wasm?url', () => ({
            default: './assets/mock-tiktoken.wasm',
        }));

        const tokenizerRuntime = await import('@/app/backend/runtime/services/context/tokenizerRuntime');
        tokenizerRuntime.resetTokenizerRuntimeForTests();

        const tokenCount = await tokenizerRuntime.countEncodedTextWithTokenizer({
            encodingName: 'cl100k_base',
            text: 'fallback me',
        });

        expect(tokenCount.isErr()).toBe(true);
        if (tokenCount.isOk()) {
            throw new Error('Expected tokenizer initialization to fail.');
        }
        expect(tokenCount.error.code).toBe('tokenizer_init_failed');
    });
});
