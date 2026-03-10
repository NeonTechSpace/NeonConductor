import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    acquireMessageMediaObjectUrl,
    releaseMessageMediaObjectUrl,
} from '@/web/components/conversation/messages/messageMediaObjectUrlCache';

import type { SessionMessageMediaPayload } from '@/app/backend/runtime/contracts';

describe('messageMediaObjectUrlCache', () => {
    const originalCreateObjectUrl = URL.createObjectURL.bind(URL);
    const originalRevokeObjectUrl = URL.revokeObjectURL.bind(URL);
    const createObjectUrl = vi.fn(() => 'blob:test-url');
    const revokeObjectUrl = vi.fn();

    const payload: SessionMessageMediaPayload = {
        mimeType: 'image/png',
        bytes: new Uint8Array([1, 2, 3, 4]),
        byteSize: 4,
        width: 2,
        height: 2,
        sha256: 'sha-1',
    };

    beforeEach(() => {
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: createObjectUrl,
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            value: revokeObjectUrl,
        });
    });

    afterEach(() => {
        createObjectUrl.mockReset();
        revokeObjectUrl.mockReset();
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: originalCreateObjectUrl,
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            value: originalRevokeObjectUrl,
        });
    });

    it('reuses cached object urls until the final release', () => {
        const first = acquireMessageMediaObjectUrl('media_test', payload);
        const second = acquireMessageMediaObjectUrl('media_test', payload);

        expect(first).toBe('blob:test-url');
        expect(second).toBe('blob:test-url');
        expect(createObjectUrl).toHaveBeenCalledOnce();

        releaseMessageMediaObjectUrl('media_test', payload);
        expect(revokeObjectUrl).not.toHaveBeenCalled();

        releaseMessageMediaObjectUrl('media_test', payload);
        expect(revokeObjectUrl).toHaveBeenCalledWith('blob:test-url');
    });
});
