import { useState } from 'react';

import type { ChangedFilesSectionProps } from '@/web/components/conversation/panels/diffCheckpointPanel/changedFilesSection';
import type { CheckpointMaintenanceActionsProps } from '@/web/components/conversation/panels/diffCheckpointPanel/checkpointMaintenanceActions';
import {
    buildDiffPatchPreviewQueryInput,
    useCheckpointDiffSelectionState,
} from '@/web/components/conversation/panels/diffCheckpointPanel/useCheckpointDiffSelectionState';
import { useCheckpointMaintenanceController } from '@/web/components/conversation/panels/diffCheckpointPanel/useCheckpointMaintenanceController';
import { useCheckpointMilestoneController } from '@/web/components/conversation/panels/diffCheckpointPanel/useCheckpointMilestoneController';
import { useCheckpointRollbackController } from '@/web/components/conversation/panels/diffCheckpointPanel/useCheckpointRollbackController';
import { trpc } from '@/web/trpc/client';

import type { CheckpointRecord, DiffRecord } from '@/app/backend/persistence/types';

import type { CheckpointStorageSummary } from '@/shared/contracts';

export interface DiffCheckpointPanelProps {
    profileId: string;
    selectedRunId?: CheckpointRecord['runId'];
    selectedSessionId?: CheckpointRecord['sessionId'];
    diffs: DiffRecord[];
    checkpoints: CheckpointRecord[];
    checkpointStorage?: CheckpointStorageSummary;
    disabled: boolean;
}

export { buildDiffPatchPreviewQueryInput };

export function useDiffCheckpointPanelController({
    profileId,
    selectedRunId,
    selectedSessionId,
    diffs,
    checkpoints,
    checkpointStorage,
    disabled,
}: DiffCheckpointPanelProps) {
    const utils = trpc.useUtils();
    const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>(undefined);
    const invalidateCheckpointList = () => {
        if (!selectedSessionId) {
            return Promise.resolve();
        }

        return utils.checkpoint.list.invalidate({
            profileId,
            sessionId: selectedSessionId,
        });
    };
    const invalidateCleanupPreview = () => utils.checkpoint.previewCleanup.invalidate();

    const diffSelectionState = useCheckpointDiffSelectionState({
        profileId,
        diffs,
    });
    const rollbackController = useCheckpointRollbackController({
        profileId,
        invalidateCheckpointList,
        setFeedbackMessage,
    });
    const milestoneController = useCheckpointMilestoneController({
        profileId,
        selectedRunId,
        invalidateCheckpointList,
        setFeedbackMessage,
    });
    const maintenanceController = useCheckpointMaintenanceController({
        profileId,
        selectedSessionId,
        checkpoints,
        invalidateCheckpointList,
        invalidateCleanupPreview,
        setFeedbackMessage,
    });

    const changedFilesSectionProps: ChangedFilesSectionProps | undefined = diffSelectionState.selectedDiff
        ? {
              selectedDiff: diffSelectionState.selectedDiff,
              resolvedSelectedPath: diffSelectionState.resolvedSelectedPath,
              milestonesOnly: maintenanceController.milestonesOnly,
              checkpointsCount: checkpoints.length,
              cleanupPreviewOpen: maintenanceController.cleanupPreviewOpen,
              onToggleMilestonesOnly: maintenanceController.onToggleMilestonesOnly,
              onToggleCleanupPreview: maintenanceController.onToggleCleanupPreview,
              onPrefetchPatch: diffSelectionState.onPrefetchPatch,
              onSelectPath: diffSelectionState.onSelectPath,
          }
        : undefined;

    const maintenanceActionsProps: CheckpointMaintenanceActionsProps = {
        visibleCheckpoints: maintenanceController.visibleCheckpoints,
        checkpointStorage,
        selectedSessionId,
        disabled,
        cleanupPreviewOpen: maintenanceController.cleanupPreviewOpen,
        forceCompactPending: maintenanceController.forceCompactPending,
        applyCleanupPending: maintenanceController.applyCleanupPending,
        rollbackPending: rollbackController.rollbackPending,
        revertChangesetPending: rollbackController.revertChangesetPending,
        promoteMilestonePending: milestoneController.promoteMilestonePending,
        renameMilestonePending: milestoneController.renameMilestonePending,
        deleteMilestonePending: milestoneController.deleteMilestonePending,
        confirmRollbackId: rollbackController.confirmRollbackId,
        rollbackTargetId: rollbackController.rollbackTargetId,
        milestoneDrafts: milestoneController.milestoneDrafts,
        profileId,
        onToggleCheckpointActions: rollbackController.onToggleCheckpointActions,
        onCloseCheckpointActions: rollbackController.onCloseCheckpointActions,
        onMilestoneDraftChange: milestoneController.onMilestoneDraftChange,
        onRestoreCheckpoint: rollbackController.onRestoreCheckpoint,
        onRevertChangeset: rollbackController.onRevertChangeset,
        onPromoteMilestone: milestoneController.onPromoteMilestone,
        onRenameMilestone: milestoneController.onRenameMilestone,
        onDeleteMilestone: milestoneController.onDeleteMilestone,
        onToggleCleanupPreview: maintenanceController.onToggleCleanupPreview,
        onApplyCleanup: maintenanceController.onApplyCleanup,
        onForceCompact: maintenanceController.onForceCompact,
    };

    return {
        selectedDiff: diffSelectionState.selectedDiff,
        feedbackMessage,
        milestoneTitle: milestoneController.milestoneTitle,
        isSavingMilestone: milestoneController.isSavingMilestone,
        onMilestoneTitleChange: milestoneController.onMilestoneTitleChange,
        onSaveMilestone: milestoneController.onSaveMilestone,
        changedFilesSectionProps,
        maintenanceActionsProps,
        diffPatchPreviewProps: {
            selectedDiff: diffSelectionState.selectedDiff,
            resolvedSelectedPath: diffSelectionState.resolvedSelectedPath,
            patchMarkdown: diffSelectionState.patchMarkdown,
            isLoadingPatch: diffSelectionState.isLoadingPatch,
            isRefreshingPatch: diffSelectionState.isRefreshingPatch,
            canOpenPath: diffSelectionState.canOpenPath,
            isOpeningPath: diffSelectionState.isOpeningPath,
            onOpenPath: diffSelectionState.onOpenPath,
        },
    };
}
