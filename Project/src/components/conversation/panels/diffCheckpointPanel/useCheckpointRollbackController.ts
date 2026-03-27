import { useState } from 'react';

import {
    describeRevertChangesetFeedback,
    describeRollbackFeedback,
} from '@/web/components/conversation/panels/diffCheckpointPanelState';
import { trpc } from '@/web/trpc/client';

import type { CheckpointRecord } from '@/app/backend/persistence/types';

interface CheckpointRollbackControllerInput {
    profileId: string;
    invalidateCheckpointList: () => Promise<void>;
    setFeedbackMessage: (message: string | undefined) => void;
}

export function useCheckpointRollbackController({
    profileId,
    invalidateCheckpointList,
    setFeedbackMessage,
}: CheckpointRollbackControllerInput) {
    const [confirmRollbackId, setConfirmRollbackId] = useState<CheckpointRecord['id'] | undefined>(undefined);
    const [rollbackTargetId, setRollbackTargetId] = useState<CheckpointRecord['id'] | undefined>(undefined);
    const rollbackMutation = trpc.checkpoint.rollback.useMutation({
        onSuccess: async (result) => {
            setFeedbackMessage(describeRollbackFeedback(result));
            if (result.rolledBack) {
                setConfirmRollbackId(undefined);
                await invalidateCheckpointList();
            }
        },
        onError: (error) => {
            setFeedbackMessage(error.message);
        },
        onSettled: () => {
            setRollbackTargetId(undefined);
        },
    });
    const revertChangesetMutation = trpc.checkpoint.revertChangeset.useMutation({
        onSuccess: async (result) => {
            setFeedbackMessage(describeRevertChangesetFeedback(result));
            if (result.reverted) {
                setConfirmRollbackId(undefined);
                await invalidateCheckpointList();
            }
        },
        onError: (error) => {
            setFeedbackMessage(error.message);
        },
        onSettled: () => {
            setRollbackTargetId(undefined);
        },
    });

    async function handleRestoreCheckpoint(checkpointId: CheckpointRecord['id']) {
        setRollbackTargetId(checkpointId);
        setFeedbackMessage(undefined);
        try {
            await rollbackMutation.mutateAsync({
                profileId,
                checkpointId,
                confirm: true,
            });
        } catch {
            return;
        }
    }

    async function handleRevertChangeset(checkpointId: CheckpointRecord['id']) {
        setRollbackTargetId(checkpointId);
        setFeedbackMessage(undefined);
        try {
            await revertChangesetMutation.mutateAsync({
                profileId,
                checkpointId,
                confirm: true,
            });
        } catch {
            return;
        }
    }

    return {
        confirmRollbackId,
        rollbackTargetId,
        rollbackPending: rollbackMutation.isPending,
        revertChangesetPending: revertChangesetMutation.isPending,
        onToggleCheckpointActions: (checkpointId: CheckpointRecord['id']) => {
            setFeedbackMessage(undefined);
            setConfirmRollbackId((current) => (current === checkpointId ? undefined : checkpointId));
        },
        onCloseCheckpointActions: () => {
            setConfirmRollbackId(undefined);
        },
        onRestoreCheckpoint: (checkpointId: CheckpointRecord['id']) => {
            void handleRestoreCheckpoint(checkpointId);
        },
        onRevertChangeset: (checkpointId: CheckpointRecord['id']) => {
            void handleRevertChangeset(checkpointId);
        },
    };
}
