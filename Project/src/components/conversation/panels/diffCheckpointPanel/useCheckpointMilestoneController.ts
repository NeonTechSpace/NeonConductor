import { useState } from 'react';

import {
    describeMilestoneDeleteFeedback,
    describeMilestonePromoteFeedback,
    describeMilestoneRenameFeedback,
    describeMilestoneSaveFeedback,
} from '@/web/components/conversation/panels/diffCheckpointPanelState';
import { trpc } from '@/web/trpc/client';

import type { CheckpointRecord } from '@/app/backend/persistence/types';

interface CheckpointMilestoneControllerInput {
    profileId: string;
    selectedRunId: CheckpointRecord['runId'] | undefined;
    invalidateCheckpointList: () => Promise<void>;
    setFeedbackMessage: (message: string | undefined) => void;
}

function removeMilestoneDraft(
    current: Record<string, string>,
    checkpoint: Pick<CheckpointRecord, 'id'> | undefined
): Record<string, string> {
    if (!checkpoint) {
        return current;
    }

    return Object.fromEntries(Object.entries(current).filter(([checkpointId]) => checkpointId !== checkpoint.id));
}

export function useCheckpointMilestoneController({
    profileId,
    selectedRunId,
    invalidateCheckpointList,
    setFeedbackMessage,
}: CheckpointMilestoneControllerInput) {
    const [milestoneTitle, setMilestoneTitle] = useState('');
    const [milestoneDrafts, setMilestoneDrafts] = useState<Record<string, string>>({});
    const createMilestoneMutation = trpc.checkpoint.create.useMutation({
        onSuccess: async (result) => {
            setFeedbackMessage(describeMilestoneSaveFeedback(result));
            if (result.created) {
                setMilestoneTitle('');
                await invalidateCheckpointList();
            }
        },
        onError: (error) => {
            setFeedbackMessage(error.message);
        },
    });
    const promoteMilestoneMutation = trpc.checkpoint.promoteToMilestone.useMutation({
        onSuccess: async (result) => {
            setFeedbackMessage(describeMilestonePromoteFeedback(result));
            if (result.promoted) {
                setMilestoneDrafts((current) => removeMilestoneDraft(current, result.checkpoint));
                await invalidateCheckpointList();
            }
        },
        onError: (error) => {
            setFeedbackMessage(error.message);
        },
    });
    const renameMilestoneMutation = trpc.checkpoint.renameMilestone.useMutation({
        onSuccess: async (result) => {
            setFeedbackMessage(describeMilestoneRenameFeedback(result));
            if (result.renamed) {
                setMilestoneDrafts((current) => removeMilestoneDraft(current, result.checkpoint));
                await invalidateCheckpointList();
            }
        },
        onError: (error) => {
            setFeedbackMessage(error.message);
        },
    });
    const deleteMilestoneMutation = trpc.checkpoint.deleteMilestone.useMutation({
        onSuccess: async (result) => {
            setFeedbackMessage(describeMilestoneDeleteFeedback(result));
            if (result.deleted) {
                await invalidateCheckpointList();
            }
        },
        onError: (error) => {
            setFeedbackMessage(error.message);
        },
    });

    async function handleSaveMilestone() {
        if (!selectedRunId || milestoneTitle.trim().length === 0) {
            return;
        }

        setFeedbackMessage(undefined);
        try {
            await createMilestoneMutation.mutateAsync({
                profileId,
                runId: selectedRunId,
                milestoneTitle: milestoneTitle.trim(),
            });
        } catch {
            return;
        }
    }

    async function handlePromoteMilestone(checkpointId: CheckpointRecord['id'], title: string) {
        if (title.length === 0) {
            return;
        }

        setFeedbackMessage(undefined);
        try {
            await promoteMilestoneMutation.mutateAsync({
                profileId,
                checkpointId,
                milestoneTitle: title,
            });
        } catch {
            return;
        }
    }

    async function handleRenameMilestone(checkpointId: CheckpointRecord['id'], title: string) {
        if (title.length === 0) {
            return;
        }

        setFeedbackMessage(undefined);
        try {
            await renameMilestoneMutation.mutateAsync({
                profileId,
                checkpointId,
                milestoneTitle: title,
            });
        } catch {
            return;
        }
    }

    async function handleDeleteMilestone(checkpointId: CheckpointRecord['id']) {
        setFeedbackMessage(undefined);
        try {
            await deleteMilestoneMutation.mutateAsync({
                profileId,
                checkpointId,
                confirm: true,
            });
        } catch {
            return;
        }
    }

    return {
        milestoneTitle,
        milestoneDrafts,
        isSavingMilestone: createMilestoneMutation.isPending,
        promoteMilestonePending: promoteMilestoneMutation.isPending,
        renameMilestonePending: renameMilestoneMutation.isPending,
        deleteMilestonePending: deleteMilestoneMutation.isPending,
        onMilestoneTitleChange: setMilestoneTitle,
        onMilestoneDraftChange: (checkpointId: CheckpointRecord['id'], value: string) => {
            setMilestoneDrafts((current) => ({
                ...current,
                [checkpointId]: value,
            }));
        },
        onSaveMilestone: () => {
            void handleSaveMilestone();
        },
        onPromoteMilestone: (checkpointId: CheckpointRecord['id'], title: string) => {
            void handlePromoteMilestone(checkpointId, title);
        },
        onRenameMilestone: (checkpointId: CheckpointRecord['id'], title: string) => {
            void handleRenameMilestone(checkpointId, title);
        },
        onDeleteMilestone: (checkpointId: CheckpointRecord['id']) => {
            void handleDeleteMilestone(checkpointId);
        },
    };
}
