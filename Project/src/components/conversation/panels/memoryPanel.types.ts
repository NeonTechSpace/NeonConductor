import type {
    MemoryProjectionStatusResult,
    MemoryScanProjectionEditsResult,
    EntityId,
    MemoryApplyReviewActionInput,
    MemoryReviewActionKind,
    MemoryReviewDetailsResult,
    RetrievedMemorySummary,
    TopLevelTab,
} from '@/shared/contracts';

export type MemoryPanelFeedbackTone = 'info' | 'error' | 'success';
export type MemoryReviewDialogMode = 'review' | MemoryReviewActionKind;

export interface MemoryPanelProps {
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    workspaceFingerprint?: string;
    sandboxId?: EntityId<'sb'>;
    threadId?: EntityId<'thr'>;
    runId?: EntityId<'run'>;
    retrievedMemory?: RetrievedMemorySummary;
}

export interface MemoryPanelViewModel {
    contextLabel: string;
    canonicalMemoryNote: string;
    includeBroaderScopes: boolean;
    projectionRoots: MemoryProjectionStatusResult['paths'];
    projectionStatus: MemoryProjectionStatusResult | undefined;
    isProjectionRefreshing: boolean;
    isReviewRefreshing: boolean;
    retrievedMemoryIdSet: Set<string>;
    retrievedSection: {
        records: RetrievedMemorySummary['records'];
        count: number;
        emptyMessage: string;
    };
    projectedSection: {
        records: MemoryProjectionStatusResult['projectedMemories'];
        count: number;
        emptyMessage: string;
    };
    reviewSection: {
        proposals: MemoryScanProjectionEditsResult['proposals'];
        parseErrors: MemoryScanProjectionEditsResult['parseErrors'];
        proposalCount: number;
        parseErrorCount: number;
    };
}

export interface MemoryPanelController {
    viewModel: MemoryPanelViewModel;
    feedbackMessage: string | undefined;
    feedbackTone: MemoryPanelFeedbackTone;
    clearFeedback: () => void;
    setIncludeBroaderScopes: (value: boolean) => void;
    isSyncingProjection: boolean;
    isRescanningProjectionEdits: boolean;
    isApplyingProjectionEdit: boolean;
    isReviewDetailsLoading: boolean;
    isApplyingReviewAction: boolean;
    reviewDialog:
        | {
              mode: MemoryReviewDialogMode;
              memoryId: EntityId<'mem'>;
              details?: MemoryReviewDetailsResult;
          }
        | undefined;
    onRescanProjectionEdits: () => Promise<void>;
    onSyncProjection: () => void;
    onOpenMemoryReview: (input: { memoryId: EntityId<'mem'>; mode: MemoryReviewDialogMode }) => void;
    onCloseMemoryReview: () => void;
    onApplyMemoryReviewAction: (
        input:
            | Omit<Extract<MemoryApplyReviewActionInput, { action: 'update' }>, 'profileId' | 'memoryId' | 'expectedUpdatedAt'>
            | Omit<Extract<MemoryApplyReviewActionInput, { action: 'supersede' }>, 'profileId' | 'memoryId' | 'expectedUpdatedAt'>
            | Omit<Extract<MemoryApplyReviewActionInput, { action: 'forget' }>, 'profileId' | 'memoryId' | 'expectedUpdatedAt'>
    ) => void;
    onApplyProjectionEdit: (input: {
        memoryId: EntityId<'mem'>;
        observedContentHash: string;
        decision: 'accept' | 'reject';
    }) => void;
}

export interface MemoryPanelViewModelInput {
    topLevelTab: TopLevelTab;
    modeKey: string;
    includeBroaderScopes: boolean;
    projectionStatus: MemoryProjectionStatusResult | undefined;
    projectionStatusIsFetching: boolean;
    scanProjectionEdits: MemoryScanProjectionEditsResult | undefined;
    scanProjectionEditsIsFetching: boolean;
    retrievedMemory?: RetrievedMemorySummary;
}
