import { Button } from '@/web/components/ui/button';

interface CheckpointMilestoneActionsProps {
    selectedRunId: string | undefined;
    disabled: boolean;
    milestoneTitle: string;
    feedbackMessage: string | undefined;
    isSavingMilestone: boolean;
    onMilestoneTitleChange: (value: string) => void;
    onSaveMilestone: () => void;
}

export function CheckpointMilestoneActions({
    selectedRunId,
    disabled,
    milestoneTitle,
    feedbackMessage,
    isSavingMilestone,
    onMilestoneTitleChange,
    onSaveMilestone,
}: CheckpointMilestoneActionsProps) {
    return (
        <>
            {selectedRunId ? (
                <div className='border-border bg-background/60 mt-3 rounded-xl border p-3'>
                    <p className='text-sm font-medium'>Save Milestone</p>
                    <p className='text-muted-foreground mt-1 text-xs'>
                        Save the currently selected run checkpoint as a named milestone. Milestones are retained until
                        explicitly deleted.
                    </p>
                    <div className='mt-3 flex flex-wrap gap-2'>
                        <input
                            type='text'
                            value={milestoneTitle}
                            onChange={(event) => {
                                onMilestoneTitleChange(event.target.value);
                            }}
                            placeholder='Milestone title'
                            className='border-border bg-background min-h-11 min-w-[16rem] flex-1 rounded-md border px-3 text-sm'
                        />
                        <Button
                            type='button'
                            className='h-11'
                            disabled={disabled || milestoneTitle.trim().length === 0 || isSavingMilestone}
                            onClick={onSaveMilestone}>
                            {isSavingMilestone ? 'Saving…' : 'Save Milestone'}
                        </Button>
                    </div>
                </div>
            ) : null}
            {feedbackMessage ? (
                <div
                    aria-live='polite'
                    className='border-destructive/20 bg-destructive/10 text-destructive mt-3 rounded-xl border px-3 py-2 text-xs'>
                    {feedbackMessage}
                </div>
            ) : null}
        </>
    );
}
