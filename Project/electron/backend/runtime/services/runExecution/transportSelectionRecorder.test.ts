import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recordTransportSelectionIfChanged } from '@/app/backend/runtime/services/runExecution/transportSelectionRecorder';

const { emitTransportSelectionEventMock, updateRuntimeMetadataMock } = vi.hoisted(() => ({
    emitTransportSelectionEventMock: vi.fn(),
    updateRuntimeMetadataMock: vi.fn(),
}));

vi.mock('@/app/backend/persistence/stores', () => ({
    runStore: {
        updateRuntimeMetadata: updateRuntimeMetadataMock,
    },
}));

vi.mock('@/app/backend/runtime/services/runExecution/eventing', () => ({
    emitTransportSelectionEvent: emitTransportSelectionEventMock,
}));

describe('recordTransportSelectionIfChanged', () => {
    beforeEach(() => {
        emitTransportSelectionEventMock.mockReset();
        updateRuntimeMetadataMock.mockReset();
    });

    it('does nothing when the selection does not change', async () => {
        const currentSelection = {
            requested: 'openai_chat_completions' as const,
            selected: 'openai_chat_completions' as const,
            degraded: false,
        };

        const result = await recordTransportSelectionIfChanged({
            profileId: 'profile_default',
            sessionId: 'sess_alpha',
            runId: 'run_alpha',
            currentSelection,
            nextSelection: currentSelection,
        });

        expect(result).toEqual(currentSelection);
        expect(updateRuntimeMetadataMock).not.toHaveBeenCalled();
        expect(emitTransportSelectionEventMock).not.toHaveBeenCalled();
    });

    it('persists and emits when the selection changes', async () => {
        updateRuntimeMetadataMock.mockResolvedValue({
            id: 'run_alpha',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });

        const result = await recordTransportSelectionIfChanged({
            profileId: 'profile_default',
            sessionId: 'sess_alpha',
            runId: 'run_alpha',
            currentSelection: {
                requested: 'openai_chat_completions',
                selected: 'openai_chat_completions',
                degraded: false,
            },
            nextSelection: {
                requested: 'openai_responses',
                selected: 'openai_responses',
                degraded: true,
                degradedReason: 'fallback',
            },
        });

        expect(result).toEqual({
            requested: 'openai_responses',
            selected: 'openai_responses',
            degraded: true,
            degradedReason: 'fallback',
        });
        expect(updateRuntimeMetadataMock).toHaveBeenCalledWith('run_alpha', {
            transportSelected: 'openai_responses',
            transportDegradedReason: 'fallback',
        });
        expect(emitTransportSelectionEventMock).toHaveBeenCalledTimes(1);
    });
});
