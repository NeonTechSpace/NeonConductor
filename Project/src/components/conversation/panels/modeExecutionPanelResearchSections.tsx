import { MarkdownContent } from '@/web/components/content/markdown/markdownContent';
import type {
    ModeExecutionPlanResearchArtifactState,
    ModeExecutionPlanView,
} from '@/web/components/conversation/panels/modeExecutionPanelState';
import { Button } from '@/web/components/ui/button';

import type { EntityId } from '@/shared/contracts';

interface PlanResearchSectionProps {
    researchState: ModeExecutionPlanResearchArtifactState;
    researchRequestDraft: string;
    selectedWorkerCount: number;
    isPlanMutating: boolean;
    onResearchRequestDraftChange: (next: string) => void;
    onSelectedWorkerCountChange: (next: number) => void;
    onStartResearchBatch: (promptMarkdown: string, workerCount: number) => void;
    onAbortResearchBatch: (researchBatchId: EntityId<'prb'>) => void;
    onSelectChildThread?: (threadId: EntityId<'thr'>) => void;
}

function readWorkerCountWarning(researchState: ModeExecutionPlanResearchArtifactState, selectedWorkerCount: number): string | undefined {
    const recommendedWorkerCount = researchState.capacity?.recommendedWorkerCount;
    if (!recommendedWorkerCount || selectedWorkerCount <= recommendedWorkerCount) {
        return undefined;
    }

    return 'Higher worker counts may compete for CPU and memory on this machine.';
}

function readWorkerSummary(worker: NonNullable<ModeExecutionPlanResearchArtifactState['activeBatch']>['workers'][number]): string {
    if (worker.resultSummaryMarkdown?.trim()) {
        return worker.resultSummaryMarkdown;
    }

    if (worker.errorMessage?.trim()) {
        return worker.errorMessage;
    }

    return worker.promptMarkdown;
}

export function PlanResearchSection({
    researchState,
    researchRequestDraft,
    selectedWorkerCount,
    isPlanMutating,
    onResearchRequestDraftChange,
    onSelectedWorkerCountChange,
    onStartResearchBatch,
    onAbortResearchBatch,
    onSelectChildThread,
}: PlanResearchSectionProps) {
    const isBusy = isPlanMutating || researchState.hasRunningResearchBatch;
    const workerCountWarning = readWorkerCountWarning(researchState, selectedWorkerCount);
    const activeBatch = researchState.activeBatch;

    return (
        <section className='space-y-3'>
            <div>
                <p className='text-sm font-semibold'>Research</p>
                <p className='text-muted-foreground text-xs'>
                    Launch bounded read-only planner workers when the current advanced revision needs more evidence.
                </p>
            </div>

            {researchState.recommendation?.recommended ? (
                <div className='border-amber-500/25 bg-amber-500/10 rounded-xl border p-3 text-xs'>
                    <div className='flex flex-wrap items-center gap-2'>
                        <span className='font-medium'>Research recommended</span>
                        <span className='border-amber-500/25 rounded-full border px-2 py-0.5 uppercase'>
                            {researchState.recommendation.priority}
                        </span>
                    </div>
                    <ul className='mt-2 list-disc space-y-1 pl-4'>
                        {researchState.recommendation.reasons.map((reason) => (
                            <li key={reason}>{reason}</li>
                        ))}
                    </ul>
                </div>
            ) : null}

            <div className='border-border/70 bg-background rounded-xl border p-3'>
                <div className='grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]'>
                    <div className='space-y-2'>
                        <label className='space-y-1'>
                            <span className='text-xs font-medium'>Research request</span>
                            <textarea
                                rows={6}
                                className='border-border bg-background w-full rounded-md border p-2 text-xs'
                                value={researchRequestDraft}
                                disabled={isBusy}
                                onChange={(event) => {
                                    onResearchRequestDraftChange(event.target.value);
                                }}
                            />
                        </label>
                    </div>

                    <div className='space-y-3'>
                        <label className='space-y-1'>
                            <span className='text-xs font-medium'>Worker count</span>
                            <input
                                type='number'
                                min={1}
                                max={researchState.capacity?.hardMaxWorkerCount ?? 1}
                                className='border-border bg-background h-9 w-full rounded-md border px-2 text-xs'
                                value={selectedWorkerCount}
                                disabled={isBusy}
                                onChange={(event) => {
                                    const nextValue = Number.parseInt(event.target.value, 10);
                                    onSelectedWorkerCountChange(Number.isNaN(nextValue) ? 1 : nextValue);
                                }}
                            />
                        </label>

                        {researchState.capacity ? (
                            <div className='border-border/70 bg-background/80 rounded-lg border px-3 py-2 text-[11px]'>
                                <p className='font-medium'>
                                    Recommended: {String(researchState.capacity.recommendedWorkerCount)} worker
                                    {researchState.capacity.recommendedWorkerCount === 1 ? '' : 's'} on this machine
                                </p>
                                <p className='text-muted-foreground mt-1'>
                                    Allowed range: 1 to {String(researchState.capacity.hardMaxWorkerCount)} workers on{' '}
                                    {String(researchState.capacity.availableParallelism)} available parallel slots.
                                </p>
                            </div>
                        ) : null}

                        {workerCountWarning ? (
                            <p className='text-amber-700 dark:text-amber-300 text-[11px]'>{workerCountWarning}</p>
                        ) : null}

                        <div className='flex flex-wrap gap-2'>
                            <Button
                                type='button'
                                size='sm'
                                disabled={
                                    isBusy ||
                                    !researchState.canStartResearch ||
                                    researchRequestDraft.trim().length === 0
                                }
                                onClick={() => {
                                    onStartResearchBatch(researchRequestDraft.trim(), selectedWorkerCount);
                                }}>
                                Start Research
                            </Button>
                            {activeBatch ? (
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='outline'
                                    disabled={isPlanMutating || !researchState.canAbortActiveResearchBatch}
                                    onClick={() => {
                                        onAbortResearchBatch(activeBatch.id);
                                    }}>
                                    Abort Batch
                                </Button>
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>

            {researchState.currentRevisionBatches.length > 0 ? (
                <div className='space-y-2'>
                    <p className='text-muted-foreground text-[11px] tracking-wide uppercase'>Current revision batches</p>
                    <div className='space-y-2'>
                        {researchState.currentRevisionBatches.map((batch) => (
                            <article key={batch.id} className='border-border/70 bg-background rounded-xl border p-3'>
                                <div className='flex flex-wrap items-start justify-between gap-3'>
                                    <div className='space-y-1'>
                                        <p className='text-sm font-medium'>Batch {batch.id}</p>
                                        <p className='text-muted-foreground text-[11px]'>
                                            {batch.status} · requested {String(batch.requestedWorkerCount)} worker
                                            {batch.requestedWorkerCount === 1 ? '' : 's'}
                                        </p>
                                    </div>
                                    <div className='flex flex-wrap gap-2 text-[11px]'>
                                        <span className='border-border/70 rounded-full border px-2 py-0.5'>
                                            Recommended {String(batch.recommendedWorkerCount)}
                                        </span>
                                        <span className='border-border/70 rounded-full border px-2 py-0.5'>
                                            Max {String(batch.hardMaxWorkerCount)}
                                        </span>
                                    </div>
                                </div>
                                <div className='mt-3 space-y-2'>
                                    {batch.workers.map((worker) => (
                                        <div key={worker.id} className='border-border/70 bg-background/80 rounded-lg border p-3 text-xs'>
                                            <div className='flex flex-wrap items-start justify-between gap-2'>
                                                <div className='space-y-1'>
                                                    <p className='font-medium'>{worker.label}</p>
                                                    <p className='text-muted-foreground text-[11px]'>{worker.status}</p>
                                                </div>
                                                {worker.childThreadId ? (
                                                    <Button
                                                        type='button'
                                                        size='sm'
                                                        variant='ghost'
                                                        onClick={() => {
                                                            if (worker.childThreadId) {
                                                                onSelectChildThread?.(worker.childThreadId);
                                                            }
                                                        }}>
                                                        Open worker lane
                                                    </Button>
                                                ) : null}
                                            </div>
                                            <div className='mt-2 space-y-2'>
                                                <MarkdownContent markdown={readWorkerSummary(worker)} className='space-y-2' />
                                                {worker.childSessionId || worker.activeRunId || worker.runId ? (
                                                    <div className='text-muted-foreground flex flex-wrap gap-2 text-[11px]'>
                                                        {worker.childSessionId ? (
                                                            <span className='border-border/70 rounded-full border px-2 py-0.5'>
                                                                Session {worker.childSessionId}
                                                            </span>
                                                        ) : null}
                                                        {worker.activeRunId ? (
                                                            <span className='rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-700'>
                                                                Active run {worker.activeRunId}
                                                            </span>
                                                        ) : null}
                                                        {worker.runId ? (
                                                            <span className='border-border/70 rounded-full border px-2 py-0.5'>
                                                                Final run {worker.runId}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </article>
                        ))}
                    </div>
                </div>
            ) : (
                <p className='text-muted-foreground text-xs'>
                    No planner research batches have been launched for the current revision yet.
                </p>
            )}

            {researchState.historicalBatches.length > 0 ? (
                <div className='space-y-2'>
                    <p className='text-muted-foreground text-[11px] tracking-wide uppercase'>Historical batches</p>
                    <div className='space-y-2'>
                        {researchState.historicalBatches.map((batch) => (
                            <div key={batch.id} className='border-border/70 bg-background rounded-xl border px-3 py-2 text-xs'>
                                <p className='font-medium'>Batch {batch.id}</p>
                                <p className='text-muted-foreground text-[11px]'>
                                    Revision {batch.planRevisionId} · {batch.status} · {String(batch.requestedWorkerCount)} workers
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
        </section>
    );
}

interface PlanEvidenceAttachmentsSectionProps {
    plan: ModeExecutionPlanView;
    researchState: ModeExecutionPlanResearchArtifactState;
    isPlanMutating: boolean;
    onInsertIntoEvidenceDraft: (attachmentId: EntityId<'pea'>) => void;
    onSelectChildThread?: (threadId: EntityId<'thr'>) => void;
}

export function PlanEvidenceAttachmentsSection({
    plan,
    researchState,
    isPlanMutating,
    onInsertIntoEvidenceDraft,
    onSelectChildThread,
}: PlanEvidenceAttachmentsSectionProps) {
    if (researchState.evidenceAttachments.length === 0) {
        return (
            <section className='space-y-2'>
                <div>
                    <p className='text-sm font-semibold'>Evidence Attachments</p>
                    <p className='text-muted-foreground text-xs'>
                        Successful planner workers create immutable evidence attachments on the current revision.
                    </p>
                </div>
                <p className='text-muted-foreground text-xs'>No evidence attachments are attached to this revision yet.</p>
            </section>
        );
    }

    return (
        <section className='space-y-2'>
            <div>
                <p className='text-sm font-semibold'>Evidence Attachments</p>
                <p className='text-muted-foreground text-xs'>
                    Attachments stay immutable and separate from the user-authored evidence synthesis draft.
                </p>
            </div>
            <div className='space-y-2'>
                {researchState.evidenceAttachments.map((attachment) => (
                    <article key={attachment.id} className='border-border/70 bg-background rounded-xl border p-3 text-xs'>
                        <div className='flex flex-wrap items-start justify-between gap-3'>
                            <div className='space-y-1'>
                                <p className='font-medium'>{attachment.label}</p>
                                <div className='text-muted-foreground flex flex-wrap gap-2 text-[11px]'>
                                    <span className='border-border/70 rounded-full border px-2 py-0.5'>
                                        Worker {attachment.researchWorkerId}
                                    </span>
                                    <span className='border-border/70 rounded-full border px-2 py-0.5'>
                                        Batch {attachment.researchBatchId}
                                    </span>
                                    <span className='border-border/70 rounded-full border px-2 py-0.5'>
                                        Attached {attachment.createdAt}
                                    </span>
                                    {attachment.childSessionId ? (
                                        <span className='border-border/70 rounded-full border px-2 py-0.5'>
                                            Session {attachment.childSessionId}
                                        </span>
                                    ) : null}
                                </div>
                            </div>
                            <div className='flex flex-wrap gap-2'>
                                {attachment.childThreadId ? (
                                    <Button
                                        type='button'
                                        size='sm'
                                        variant='ghost'
                                        onClick={() => {
                                            if (attachment.childThreadId) {
                                                onSelectChildThread?.(attachment.childThreadId);
                                            }
                                        }}>
                                        Open worker lane
                                    </Button>
                                ) : null}
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='outline'
                                    disabled={isPlanMutating || plan.planningDepth !== 'advanced'}
                                    onClick={() => {
                                        onInsertIntoEvidenceDraft(attachment.id);
                                    }}>
                                    Insert Into Evidence Draft
                                </Button>
                            </div>
                        </div>
                        <div className='mt-3 space-y-2'>
                            <MarkdownContent markdown={attachment.summaryMarkdown} className='space-y-2' />
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}
