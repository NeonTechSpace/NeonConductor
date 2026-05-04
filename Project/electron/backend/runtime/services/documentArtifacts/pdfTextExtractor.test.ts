import { describe, expect, it, vi } from 'vitest';

describe('PDF text extraction startup boundary', () => {
    it('loads the document artifact service without requiring DOMMatrix at module startup', async () => {
        const globals = globalThis as Record<string, unknown>;
        const previousDOMMatrix = globals.DOMMatrix;
        delete globals.DOMMatrix;
        vi.resetModules();

        try {
            const serviceModule = await import('@/app/backend/runtime/services/documentArtifacts/service');
            expect(serviceModule.documentArtifactService).toBeDefined();
            expect(globals.DOMMatrix).toBeUndefined();
        } finally {
            if (previousDOMMatrix) {
                globals.DOMMatrix = previousDOMMatrix;
            } else {
                delete globals.DOMMatrix;
            }
        }
    });
});
