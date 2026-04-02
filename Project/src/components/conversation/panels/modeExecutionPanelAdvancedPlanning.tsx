import { MarkdownContent } from '@/web/components/content/markdown/markdownContent';
import type { PlanningDepth } from '@/web/components/conversation/shell/planningDepth';
import { Button } from '@/web/components/ui/button';

import type { PlanAdvancedSnapshotInput, PlanPhaseOutlineInput } from '@/shared/contracts';

export type ModeExecutionAdvancedPlanningPhaseDraft = PlanPhaseOutlineInput;
export type ModeExecutionAdvancedPlanningSnapshotDraft = PlanAdvancedSnapshotInput;

interface PlanningDepthToggleProps {
    selectedPlanningDepth: PlanningDepth;
    onPlanningDepthChange: (nextPlanningDepth: PlanningDepth) => void;
    disabled?: boolean;
}

export function PlanningDepthToggle({
    selectedPlanningDepth,
    onPlanningDepthChange,
    disabled,
}: PlanningDepthToggleProps) {
    return (
        <div className='border-border/70 bg-background/70 space-y-3 rounded-xl border p-3'>
            <div className='space-y-1'>
                <p className='text-sm font-semibold'>Planning depth</p>
                <p className='text-muted-foreground text-xs'>
                    Choose the initial planning lane before you submit the first plan prompt.
                </p>
            </div>
            <div className='grid gap-2 sm:grid-cols-2'>
                <button
                    type='button'
                    className={`rounded-xl border px-3 py-3 text-left transition ${
                        selectedPlanningDepth === 'simple'
                            ? 'border-sky-500/40 bg-sky-500/10'
                            : 'border-border/70 bg-background hover:border-border'
                    }`}
                    disabled={disabled}
                    aria-pressed={selectedPlanningDepth === 'simple'}
                    onClick={() => {
                        onPlanningDepthChange('simple');
                    }}>
                    <p className='text-sm font-semibold'>Simple planning</p>
                    <p className='text-muted-foreground mt-1 text-xs'>
                        Keep the compact planning loop with summary, questions, and ordered items.
                    </p>
                </button>
                <button
                    type='button'
                    className={`rounded-xl border px-3 py-3 text-left transition ${
                        selectedPlanningDepth === 'advanced'
                            ? 'border-emerald-500/40 bg-emerald-500/10'
                            : 'border-border/70 bg-background hover:border-border'
                    }`}
                    disabled={disabled}
                    aria-pressed={selectedPlanningDepth === 'advanced'}
                    onClick={() => {
                        onPlanningDepthChange('advanced');
                    }}>
                    <p className='text-sm font-semibold'>Advanced planning</p>
                    <p className='text-muted-foreground mt-1 text-xs'>
                        Add evidence, observations, root cause, and a structured phase outline.
                    </p>
                </button>
            </div>
        </div>
    );
}

function readPhaseMoveDisabledReason(direction: 'up' | 'down', sequence: number, total: number): boolean {
    if (direction === 'up') {
        return sequence === 1;
    }

    return sequence === total;
}

interface AdvancedPlanningArtifactSectionsProps {
    snapshot: ModeExecutionAdvancedPlanningSnapshotDraft;
}

export function AdvancedPlanningArtifactSections({ snapshot }: AdvancedPlanningArtifactSectionsProps) {
    return (
        <div className='space-y-3'>
            <section className='space-y-2'>
                <div>
                    <p className='text-sm font-semibold'>Observations</p>
                    <p className='text-muted-foreground text-xs'>
                        Capture stable observations before the plan moves into phase detail work.
                    </p>
                </div>
                <div className='border-border bg-background rounded-xl border p-3'>
                    <MarkdownContent markdown={snapshot.observationsMarkdown} className='space-y-2' />
                </div>
            </section>
            <section className='space-y-2'>
                <div>
                    <p className='text-sm font-semibold'>Root Cause</p>
                    <p className='text-muted-foreground text-xs'>
                        Use this section to record the structural cause behind the plan.
                    </p>
                </div>
                <div className='border-border bg-background rounded-xl border p-3'>
                    <MarkdownContent markdown={snapshot.rootCauseMarkdown} className='space-y-2' />
                </div>
            </section>
            <section className='space-y-2'>
                <div>
                    <p className='text-sm font-semibold'>Roadmap</p>
                    <p className='text-muted-foreground text-xs'>
                        Keep the approved high-level roadmap visible while phase detail expands underneath it.
                    </p>
                </div>
                <div className='space-y-2'>
                    {snapshot.phases.map((phase) => (
                        <article key={phase.id} className='border-border/70 bg-background rounded-xl border p-3'>
                            <div className='mb-2 flex items-center justify-between gap-3'>
                                <p className='text-xs font-semibold'>
                                    {String(phase.sequence)}. {phase.title}
                                </p>
                                <span className='border-border/70 rounded-full border px-2 py-0.5 text-[11px]'>
                                    Structured
                                </span>
                            </div>
                            <div className='space-y-2 text-xs'>
                                <div className='space-y-1'>
                                    <p className='text-muted-foreground text-[11px] font-medium uppercase'>
                                        Phase goal
                                    </p>
                                    <MarkdownContent markdown={phase.goalMarkdown} className='space-y-2' />
                                </div>
                                <div className='space-y-1'>
                                    <p className='text-muted-foreground text-[11px] font-medium uppercase'>
                                        Exit criteria
                                    </p>
                                    <MarkdownContent markdown={phase.exitCriteriaMarkdown} className='space-y-2' />
                                </div>
                            </div>
                        </article>
                    ))}
                </div>
            </section>
        </div>
    );
}

interface AdvancedPlanningEditorProps {
    snapshot: ModeExecutionAdvancedPlanningSnapshotDraft;
    isPlanMutating: boolean;
    onSnapshotChange: (nextSnapshot: ModeExecutionAdvancedPlanningSnapshotDraft) => void;
}

export function AdvancedPlanningEditor({
    snapshot,
    isPlanMutating,
    onSnapshotChange,
}: AdvancedPlanningEditorProps) {
    function updatePhase(phaseId: string, updater: (current: ModeExecutionAdvancedPlanningPhaseDraft) => ModeExecutionAdvancedPlanningPhaseDraft) {
        onSnapshotChange({
            ...snapshot,
            phases: snapshot.phases.map((phase) => (phase.id === phaseId ? updater(phase) : phase)),
        });
    }

    function reorderPhase(phaseId: string, direction: 'up' | 'down') {
        const phaseIndex = snapshot.phases.findIndex((phase) => phase.id === phaseId);
        if (phaseIndex < 0) {
            return;
        }
        const nextIndex = direction === 'up' ? phaseIndex - 1 : phaseIndex + 1;
        if (nextIndex < 0 || nextIndex >= snapshot.phases.length) {
            return;
        }

        const nextPhases = [...snapshot.phases];
        const [movedPhase] = nextPhases.splice(phaseIndex, 1);
        if (!movedPhase) {
            return;
        }
        nextPhases.splice(nextIndex, 0, movedPhase);
        onSnapshotChange({
            ...snapshot,
            phases: nextPhases.map((phase, index) => ({
                ...phase,
                sequence: index + 1,
            })),
        });
    }

    function addPhase() {
        const nextSequence = snapshot.phases.length + 1;
        onSnapshotChange({
            ...snapshot,
            phases: [
                ...snapshot.phases,
                {
                    id: `phase_${String(Date.now())}_${String(nextSequence)}`,
                    sequence: nextSequence,
                    title: `Phase ${String(nextSequence)}`,
                    goalMarkdown: 'Describe the goal for this phase.',
                    exitCriteriaMarkdown: 'Describe what should be true before moving on.',
                },
            ],
        });
    }

    function removePhase(phaseId: string) {
        onSnapshotChange({
            ...snapshot,
            phases: snapshot.phases
                .filter((phase) => phase.id !== phaseId)
                .map((phase, index) => ({
                    ...phase,
                    sequence: index + 1,
                })),
        });
    }

    return (
        <div className='space-y-3'>
            <section className='space-y-2'>
                <div>
                    <p className='text-sm font-semibold'>Evidence</p>
                    <p className='text-muted-foreground text-xs'>
                        Keep the evidence trail grounded in the live plan artifact.
                    </p>
                </div>
                <textarea
                    rows={8}
                    className='border-border bg-background w-full rounded-md border p-2 text-xs'
                    value={snapshot.evidenceMarkdown}
                    disabled={isPlanMutating}
                    onChange={(event) => {
                        onSnapshotChange({
                            ...snapshot,
                            evidenceMarkdown: event.target.value,
                        });
                    }}
                />
            </section>
            <section className='space-y-2'>
                <div>
                    <p className='text-sm font-semibold'>Observations</p>
                    <p className='text-muted-foreground text-xs'>
                        Capture stable observations before you refine the phase outline.
                    </p>
                </div>
                <textarea
                    rows={6}
                    className='border-border bg-background w-full rounded-md border p-2 text-xs'
                    value={snapshot.observationsMarkdown}
                    disabled={isPlanMutating}
                    onChange={(event) => {
                        onSnapshotChange({
                            ...snapshot,
                            observationsMarkdown: event.target.value,
                        });
                    }}
                />
            </section>
            <section className='space-y-2'>
                <div>
                    <p className='text-sm font-semibold'>Root Cause</p>
                    <p className='text-muted-foreground text-xs'>
                        Keep the root-cause note explicit and avoid pretending it is already solved.
                    </p>
                </div>
                <textarea
                    rows={6}
                    className='border-border bg-background w-full rounded-md border p-2 text-xs'
                    value={snapshot.rootCauseMarkdown}
                    disabled={isPlanMutating}
                    onChange={(event) => {
                        onSnapshotChange({
                            ...snapshot,
                            rootCauseMarkdown: event.target.value,
                        });
                    }}
                />
            </section>
            <section className='space-y-2'>
                <div className='flex items-center justify-between gap-3'>
                    <div>
                        <p className='text-sm font-semibold'>Roadmap</p>
                        <p className='text-muted-foreground text-xs'>
                            Add, remove, and reorder the approved high-level phases without turning this into a
                            worker workflow.
                        </p>
                    </div>
                    <Button type='button' size='sm' variant='outline' disabled={isPlanMutating} onClick={addPhase}>
                        Add phase
                    </Button>
                </div>
                <div className='space-y-2'>
                    {snapshot.phases.map((phase) => {
                        const totalPhases = snapshot.phases.length;
                        return (
                            <article key={phase.id} className='border-border/70 bg-background rounded-xl border p-3'>
                                <div className='mb-3 flex items-center justify-between gap-3'>
                                    <div className='space-y-1'>
                                        <p className='text-xs font-semibold'>
                                            {String(phase.sequence)}. {phase.title}
                                        </p>
                                        <p className='text-muted-foreground text-[11px]'>
                                            Sequence is kept in render order.
                                        </p>
                                    </div>
                                    <div className='flex flex-wrap gap-2'>
                                        <Button
                                            type='button'
                                            size='sm'
                                            variant='ghost'
                                            disabled={isPlanMutating || readPhaseMoveDisabledReason('up', phase.sequence, totalPhases)}
                                            onClick={() => {
                                                reorderPhase(phase.id, 'up');
                                            }}>
                                            Up
                                        </Button>
                                        <Button
                                            type='button'
                                            size='sm'
                                            variant='ghost'
                                            disabled={
                                                isPlanMutating ||
                                                readPhaseMoveDisabledReason('down', phase.sequence, totalPhases)
                                            }
                                            onClick={() => {
                                                reorderPhase(phase.id, 'down');
                                            }}>
                                            Down
                                        </Button>
                                        <Button
                                            type='button'
                                            size='sm'
                                            variant='ghost'
                                            disabled={isPlanMutating}
                                            onClick={() => {
                                                removePhase(phase.id);
                                            }}>
                                            Remove
                                        </Button>
                                    </div>
                                </div>
                                <div className='space-y-3 text-xs'>
                                    <div className='space-y-1'>
                                        <p className='text-muted-foreground text-[11px] font-medium uppercase'>Title</p>
                                        <input
                                            className='border-border bg-background h-8 w-full rounded-md border px-2 text-xs'
                                            value={phase.title}
                                            disabled={isPlanMutating}
                                            onChange={(event) => {
                                                updatePhase(phase.id, (current) => ({
                                                    ...current,
                                                    title: event.target.value,
                                                }));
                                            }}
                                        />
                                    </div>
                                    <div className='space-y-1'>
                                        <p className='text-muted-foreground text-[11px] font-medium uppercase'>
                                            Phase goal
                                        </p>
                                        <textarea
                                            rows={4}
                                            className='border-border bg-background w-full rounded-md border p-2 text-xs'
                                            value={phase.goalMarkdown}
                                            disabled={isPlanMutating}
                                            onChange={(event) => {
                                                updatePhase(phase.id, (current) => ({
                                                    ...current,
                                                    goalMarkdown: event.target.value,
                                                }));
                                            }}
                                        />
                                    </div>
                                    <div className='space-y-1'>
                                        <p className='text-muted-foreground text-[11px] font-medium uppercase'>
                                            Exit criteria
                                        </p>
                                        <textarea
                                            rows={4}
                                            className='border-border bg-background w-full rounded-md border p-2 text-xs'
                                            value={phase.exitCriteriaMarkdown}
                                            disabled={isPlanMutating}
                                            onChange={(event) => {
                                                updatePhase(phase.id, (current) => ({
                                                    ...current,
                                                    exitCriteriaMarkdown: event.target.value,
                                                }));
                                            }}
                                        />
                                    </div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
