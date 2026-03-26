import type { SelectionResolutionState } from '@/web/components/conversation/hooks/useSessionRunSelection';
import type { VisibleThreadSelectionResolution } from '@/web/components/conversation/hooks/useThreadSidebarState';

export interface ConversationSelectionSyncPatch {
    selectedThreadId?: string | undefined;
    selectedSessionId?: string | undefined;
    selectedRunId?: string | undefined;
}

export function buildConversationSelectionSyncPatch(input: {
    selectedThreadId: string | undefined;
    threadSelection: VisibleThreadSelectionResolution;
    sessionSelection: SelectionResolutionState;
}): ConversationSelectionSyncPatch | undefined {
    const patch: ConversationSelectionSyncPatch = {};

    if (input.selectedThreadId !== input.threadSelection.resolvedThreadId) {
        patch.selectedThreadId = input.threadSelection.resolvedThreadId;
    }

    if (input.sessionSelection.shouldUpdateSessionSelection) {
        patch.selectedSessionId = input.sessionSelection.resolvedSessionId;
    }

    if (input.sessionSelection.shouldUpdateRunSelection) {
        patch.selectedRunId = input.sessionSelection.resolvedRunId;
    }

    return Object.keys(patch).length > 0 ? patch : undefined;
}
