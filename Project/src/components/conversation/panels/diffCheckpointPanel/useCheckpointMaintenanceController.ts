import { useState } from 'react';

import {
    describeCleanupFeedback,
    describeCompactionFeedback,
    filterVisibleCheckpoints,
} from '@/web/components/conversation/panels/diffCheckpointPanelState';
import { trpc } from '@/web/trpc/client';

import type { CheckpointRecord } from '@/app/backend/persistence/types';

interface CheckpointMaintenanceControllerInput {
    profileId: string;
    selectedSessionId: CheckpointRecord['sessionId'] | undefined;
    checkpoints: CheckpointRecord[];
    invalidateCheckpointList: () => Promise<void>;
    invalidateCleanupPreview: () => Promise<void>;
    setFeedbackMessage: (message: string | undefined) => void;
}

export function useCheckpointMaintenanceController({
    profileId,
    selectedSessionId,
    checkpoints,
    invalidateCheckpointList,
    invalidateCleanupPreview,
    setFeedbackMessage,
}: CheckpointMaintenanceControllerInput) {
    const [milestonesOnly, setMilestonesOnly] = useState(false);
    const [cleanupPreviewOpen, setCleanupPreviewOpen] = useState(false);
    const applyCleanupMutation = trpc.checkpoint.applyCleanup.useMutation({
        onSuccess: async (result) => {
            setFeedbackMessage(describeCleanupFeedback(result));
            if (result.cleanedUp) {
                await Promise.all([invalidateCheckpointList(), invalidateCleanupPreview()]);
            }
        },
        onError: (error) => {
            setFeedbackMessage(error.message);
        },
    });
    const forceCompactMutation = trpc.checkpoint.forceCompact.useMutation({
        onSuccess: async (result) => {
            setFeedbackMessage(describeCompactionFeedback(result));
            await invalidateCheckpointList();
        },
        onError: (error) => {
            setFeedbackMessage(error.message);
        },
    });

    async function handleApplyCleanup() {
        if (!selectedSessionId) {
            return;
        }

        setFeedbackMessage(undefined);
        try {
            await applyCleanupMutation.mutateAsync({
                profileId,
                sessionId: selectedSessionId,
                confirm: true,
            });
        } catch {
            return;
        }
    }

    async function handleForceCompact() {
        if (!selectedSessionId) {
            return;
        }

        setFeedbackMessage(undefined);
        try {
            await forceCompactMutation.mutateAsync({
                profileId,
                sessionId: selectedSessionId,
                confirm: true,
            });
        } catch {
            return;
        }
    }

    return {
        visibleCheckpoints: filterVisibleCheckpoints(checkpoints, milestonesOnly),
        milestonesOnly,
        cleanupPreviewOpen,
        applyCleanupPending: applyCleanupMutation.isPending,
        forceCompactPending: forceCompactMutation.isPending,
        onToggleMilestonesOnly: () => {
            setMilestonesOnly((current) => !current);
        },
        onToggleCleanupPreview: () => {
            if (!selectedSessionId) {
                return;
            }

            setCleanupPreviewOpen((current) => !current);
        },
        onApplyCleanup: () => {
            void handleApplyCleanup();
        },
        onForceCompact: () => {
            void handleForceCompact();
        },
    };
}
