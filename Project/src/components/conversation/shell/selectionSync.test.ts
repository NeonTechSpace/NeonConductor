import { describe, expect, it } from 'vitest';

import { buildConversationSelectionSyncPatch } from '@/web/components/conversation/shell/selectionSync';

describe('conversation selection sync patch', () => {
    it('repairs stale persisted thread, session, and run selection using the resolved shell selection', () => {
        const patch = buildConversationSelectionSyncPatch({
            selectedThreadId: 'thr_stale',
            threadSelection: {
                resolvedThreadId: 'thr_current',
                shouldSelectFallbackThread: true,
                shouldClearSelection: false,
            },
            sessionSelection: {
                resolvedSessionId: 'sess_current',
                resolvedRunId: 'run_current',
                shouldUpdateSessionSelection: true,
                shouldUpdateRunSelection: true,
            },
        });

        expect(patch).toEqual({
            selectedThreadId: 'thr_current',
            selectedSessionId: 'sess_current',
            selectedRunId: 'run_current',
        });
    });

    it('returns no patch when the persisted selection is already valid', () => {
        const patch = buildConversationSelectionSyncPatch({
            selectedThreadId: 'thr_current',
            threadSelection: {
                resolvedThreadId: 'thr_current',
                shouldSelectFallbackThread: false,
                shouldClearSelection: false,
            },
            sessionSelection: {
                resolvedSessionId: 'sess_current',
                resolvedRunId: 'run_current',
                shouldUpdateSessionSelection: false,
                shouldUpdateRunSelection: false,
            },
        });

        expect(patch).toBeUndefined();
    });
});
