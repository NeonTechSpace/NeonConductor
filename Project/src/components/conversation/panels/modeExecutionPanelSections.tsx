import { MarkdownContent } from '@/web/components/content/markdown/markdownContent';
import {
    AdvancedPlanningArtifactSections,
    AdvancedPlanningEditor,
    type ModeExecutionAdvancedPlanningSnapshotDraft,
} from '@/web/components/conversation/panels/modeExecutionPanelAdvancedPlanning';
import {
    PlanEvidenceAttachmentsSection,
    PlanResearchSection,
} from '@/web/components/conversation/panels/modeExecutionPanelResearchSections';
import {
    PlanHistorySection,
    PlanRecoveryBannerSection,
    PlanVariantSwitcherSection,
} from '@/web/components/conversation/panels/modeExecutionPanelRecoverySections';
import type {
    ModeExecutionPlanArtifactState,
    ModeExecutionPlanResearchArtifactState,
    ModeExecutionPlanView,
} from '@/web/components/conversation/panels/modeExecutionPanelState';
import type { PlanningDepth } from '@/web/components/conversation/shell/planningDepth';
import { Button } from '@/web/components/ui/button';

import type { EntityId, OrchestratorExecutionStrategy } from '@/shared/contracts';

const STATUS_TONE_CLASSES: Record<ModeExecutionPlanArtifactState['statusTone'], string> = {
    neutral: 'border-border bg-background text-foreground',
    info: 'border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-300',
    success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
    warning: 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300',
    destructive: 'border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-300',
};

function readQuestionAnswerCopy(question: ModeExecutionPlanView['questions'][number]): string {
    const answer = question.answer?.trim();
    return answer && answer.length > 0 ? answer : 'No answer recorded yet.';
}

function readQuestionToneClass(question: ModeExecutionPlanView['questions'][number]): string {
    if (question.required && !(question.answer?.trim().length ?? 0)) {
        return 'border-amber-500/20 bg-amber-500/5';
    }

    if (question.required) {
        return 'border-border bg-background';
    }

    return 'border-border/70 bg-background/80';
}

function readItemStatusLabel(status: ModeExecutionPlanView['items'][number]['status']): string {
    switch (status) {
        case 'pending':
            return 'Pending';
        case 'running':
            return 'Running';
        case 'completed':
            return 'Completed';
        case 'failed':
            return 'Failed';
        case 'aborted':
            return 'Aborted';
    }
}

interface PlanArtifactStatusProps {
    artifactState: ModeExecutionPlanArtifactState;
}

function PlanArtifactStatusSection({ artifactState }: PlanArtifactStatusProps) {
    return (
        <div className='space-y-2'>
            <div className='flex flex-wrap items-center gap-2'>
                <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE_CLASSES[artifactState.statusTone]}`}>
                    {artifactState.statusLabel}
                </span>
                {artifactState.planningDepth === 'advanced' ? (
                    <span className='border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium'>
                        Advanced planning
                    </span>
                ) : null}
                <span className='text-muted-foreground text-xs'>
                    Current revision: <span className='font-medium'>{artifactState.revisionLabel}</span>
                </span>
            </div>
            <div className='flex flex-wrap gap-2 text-xs'>
                <span className='border-border/70 bg-background rounded-full border px-2 py-0.5'>
                    Current variant: <span className='font-medium'>{artifactState.currentVariantLabel}</span>
                </span>
                {artifactState.approvedVariantLabel ? (
                    <span className='border-border/70 bg-background rounded-full border px-2 py-0.5'>
                        Approved variant: <span className='font-medium'>{artifactState.approvedVariantLabel}</span>
                    </span>
                ) : null}
            </div>
            <p className='text-muted-foreground text-xs'>{artifactState.statusDescription}</p>
            <p className='text-muted-foreground text-xs'>{artifactState.revisionComparisonLabel}</p>
            <p className='text-muted-foreground text-xs'>{artifactState.variantComparisonLabel}</p>
            {artifactState.approvedRevisionLabel ? (
                <p className='text-xs'>
                    Last approved revision: <span className='font-medium'>{artifactState.approvedRevisionLabel}</span>
                </p>
            ) : null}
            {artifactState.readyToImplement ? (
                <p className='text-xs font-medium text-emerald-700 dark:text-emerald-300'>
                    This approved plan is ready to implement.
                </p>
            ) : null}
        </div>
    );
}

interface PlanArtifactSummaryProps {
    plan: ModeExecutionPlanView;
}

function PlanArtifactSummarySection({ plan }: PlanArtifactSummaryProps) {
    return (
        <section className='space-y-2'>
            <div>
                <p className='text-sm font-semibold'>Summary</p>
                <p className='text-muted-foreground text-xs'>
                    The current revision summary is shown without editing controls.
                </p>
            </div>
            <div className='border-border bg-background rounded-xl border p-3'>
                <MarkdownContent markdown={plan.summaryMarkdown} className='space-y-3' />
            </div>
        </section>
    );
}

interface PlanArtifactQuestionsProps {
    plan: ModeExecutionPlanView;
    isEditable: boolean;
    answerByQuestionId: Record<string, string>;
    isPlanMutating: boolean;
    onQuestionAnswerDraftChange: (planId: ModeExecutionPlanView['id'], questionId: string, answer: string) => void;
    onAnswerQuestion: (planId: ModeExecutionPlanView['id'], questionId: string, answer: string) => void;
}

function PlanArtifactQuestionsSection({
    plan,
    isEditable,
    answerByQuestionId,
    isPlanMutating,
    onQuestionAnswerDraftChange,
    onAnswerQuestion,
}: PlanArtifactQuestionsProps) {
    return (
        <section className='space-y-2'>
            <div>
                <p className='text-sm font-semibold'>Questions</p>
                <p className='text-muted-foreground text-xs'>
                    {isEditable
                        ? 'Required answers stay editable until the plan moves past intake.'
                        : 'These intake answers are preserved for review alongside the revision history.'}
                </p>
            </div>
            <div className='space-y-2'>
                {plan.questions.map((question) => {
                    const draftAnswer = answerByQuestionId[question.id] ?? question.answer ?? '';
                    const hasAnswer = draftAnswer.trim().length > 0;
                    return (
                        <article
                            key={question.id}
                            className={`space-y-2 rounded-xl border p-3 ${readQuestionToneClass(question)}`}>
                            <div className='flex flex-wrap items-center gap-2'>
                                <span className='text-muted-foreground text-[11px] tracking-wide uppercase'>
                                    {question.category.replace('_', ' ')}
                                </span>
                                <span className='border-border/70 rounded-full border px-2 py-0.5 text-[11px]'>
                                    {question.required ? 'Required' : 'Optional'}
                                </span>
                                {hasAnswer ? (
                                    <span className='rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-300'>
                                        Answered
                                    </span>
                                ) : (
                                    <span className='border-border/70 text-muted-foreground rounded-full border px-2 py-0.5 text-[11px]'>
                                        Unanswered
                                    </span>
                                )}
                            </div>
                            <p className='text-xs font-medium'>{question.question}</p>
                            {question.helpText ? (
                                <p className='text-muted-foreground text-[11px]'>{question.helpText}</p>
                            ) : null}
                            {isEditable ? (
                                <div className='flex gap-2'>
                                    <input
                                        className='border-border bg-background h-8 flex-1 rounded-md border px-2 text-xs'
                                        value={answerByQuestionId[question.id] ?? ''}
                                        placeholder={question.placeholderText}
                                        onChange={(event) => {
                                            onQuestionAnswerDraftChange(plan.id, question.id, event.target.value);
                                        }}
                                    />
                                    <Button
                                        type='button'
                                        size='sm'
                                        variant='outline'
                                        disabled={isPlanMutating || draftAnswer.trim().length === 0}
                                        onClick={() => {
                                            const trimmedAnswer = draftAnswer.trim();
                                            if (!trimmedAnswer) {
                                                return;
                                            }
                                            onAnswerQuestion(plan.id, question.id, trimmedAnswer);
                                        }}>
                                        Save Answer
                                    </Button>
                                </div>
                            ) : (
                                <div className='border-border/70 bg-background rounded-lg border px-3 py-2 text-xs'>
                                    {hasAnswer ? (
                                        <p>{readQuestionAnswerCopy(question)}</p>
                                    ) : (
                                        <p className='text-muted-foreground'>{readQuestionAnswerCopy(question)}</p>
                                    )}
                                </div>
                            )}
                        </article>
                    );
                })}
            </div>
        </section>
    );
}

interface PlanArtifactEvidenceProps {
    advancedSnapshot: ModeExecutionAdvancedPlanningSnapshotDraft;
}

function PlanArtifactEvidenceSection({ advancedSnapshot }: PlanArtifactEvidenceProps) {
    return (
        <section className='space-y-2'>
            <div>
                <p className='text-sm font-semibold'>Evidence</p>
                <p className='text-muted-foreground text-xs'>
                    This section keeps the advanced evidence scaffold next to the active revision.
                </p>
            </div>
            <div className='border-border bg-background rounded-xl border p-3'>
                <MarkdownContent markdown={advancedSnapshot.evidenceMarkdown} className='space-y-2' />
            </div>
        </section>
    );
}

interface PlanArtifactItemsProps {
    plan: ModeExecutionPlanView;
}

function PlanArtifactItemsSection({ plan }: PlanArtifactItemsProps) {
    return (
        <section className='space-y-2'>
            <div>
                <p className='text-sm font-semibold'>Ordered Items</p>
                <p className='text-muted-foreground text-xs'>
                    The live plan items remain visible as the current revision’s ordered implementation list.
                </p>
            </div>
            <div className='space-y-2'>
                {plan.items.map((item) => (
                    <article
                        key={item.id}
                        className='border-border/70 bg-background rounded-xl border px-3 py-3 text-xs'>
                        <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
                            <p className='font-medium'>
                                {String(item.sequence)}. {item.description}
                            </p>
                            <span className='border-border/70 rounded-full border px-2 py-0.5 text-[11px]'>
                                {readItemStatusLabel(item.status)}
                            </span>
                        </div>
                        {item.runId || item.errorMessage ? (
                            <div className='text-muted-foreground flex flex-wrap gap-2 text-[11px]'>
                                {item.runId ? (
                                    <span className='rounded-full border px-2 py-0.5'>Run {item.runId}</span>
                                ) : null}
                                {item.errorMessage ? (
                                    <span className='rounded-full border px-2 py-0.5'>{item.errorMessage}</span>
                                ) : null}
                            </div>
                        ) : null}
                    </article>
                ))}
            </div>
        </section>
    );
}

interface PlanArtifactActionBarProps {
    artifactState: ModeExecutionPlanArtifactState;
    isPlanMutating: boolean;
    selectedExecutionStrategy: OrchestratorExecutionStrategy;
    canConfigureExecutionStrategy: boolean;
    onExecutionStrategyChange: (executionStrategy: OrchestratorExecutionStrategy) => void;
    onUpgradeToAdvancedPlanning: () => void;
    onGenerateDraft: () => void;
    onEnterEditMode: () => void;
    onCancelPlan: () => void;
    onApprovePlan: () => void;
    onImplementPlan: () => void;
}

function PlanArtifactActionBar({
    artifactState,
    isPlanMutating,
    selectedExecutionStrategy,
    canConfigureExecutionStrategy,
    onExecutionStrategyChange,
    onUpgradeToAdvancedPlanning,
    onGenerateDraft,
    onEnterEditMode,
    onCancelPlan,
    onApprovePlan,
    onImplementPlan,
}: PlanArtifactActionBarProps) {
    return (
        <div className='flex flex-wrap gap-2'>
            {canConfigureExecutionStrategy ? (
                <div className='border-border/70 bg-background/70 flex items-center gap-2 rounded-xl border p-1 text-xs'>
                    <span className='px-2 font-medium'>Strategy</span>
                    <Button
                        type='button'
                        size='sm'
                        variant={selectedExecutionStrategy === 'delegate' ? 'default' : 'ghost'}
                        disabled={isPlanMutating}
                        onClick={() => {
                            onExecutionStrategyChange('delegate');
                        }}>
                        Delegate
                    </Button>
                    <Button
                        type='button'
                        size='sm'
                        variant={selectedExecutionStrategy === 'parallel' ? 'default' : 'ghost'}
                        disabled={isPlanMutating}
                        onClick={() => {
                            onExecutionStrategyChange('parallel');
                        }}>
                        Parallel
                    </Button>
                </div>
            ) : null}
            {artifactState.canGenerateDraft ? (
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={isPlanMutating}
                    onClick={() => {
                        onGenerateDraft();
                    }}>
                    Generate Draft
                </Button>
            ) : null}
            {artifactState.canEnterAdvancedPlanning ? (
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={isPlanMutating}
                    onClick={() => {
                        onUpgradeToAdvancedPlanning();
                    }}>
                    Upgrade to Advanced Planning
                </Button>
            ) : null}
            {artifactState.canRevise ? (
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={isPlanMutating}
                    onClick={() => {
                        onEnterEditMode();
                    }}>
                    Revise
                </Button>
            ) : null}
            {artifactState.canApprove ? (
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={isPlanMutating}
                    onClick={() => {
                        onApprovePlan();
                    }}>
                    Approve
                </Button>
            ) : null}
            {artifactState.canImplement ? (
                <Button
                    type='button'
                    size='sm'
                    disabled={isPlanMutating}
                    onClick={() => {
                        onImplementPlan();
                    }}>
                    Implement
                </Button>
            ) : null}
            {artifactState.canCancel ? (
                <Button
                    type='button'
                    size='sm'
                    variant='ghost'
                    disabled={isPlanMutating}
                    onClick={() => {
                        onCancelPlan();
                    }}>
                    Cancel
                </Button>
            ) : null}
        </div>
    );
}

interface PlanEditModeProps {
    summaryDraft: string;
    itemsDraft: string;
    planningDepth: PlanningDepth;
    advancedSnapshot?: ModeExecutionAdvancedPlanningSnapshotDraft;
    isPlanMutating: boolean;
    onSummaryDraftChange: (next: string) => void;
    onItemsDraftChange: (next: string) => void;
    onAdvancedSnapshotChange?: (next: ModeExecutionAdvancedPlanningSnapshotDraft) => void;
    onSaveDraft: () => void;
    onDiscardEdits: () => void;
}

function PlanEditMode({
    summaryDraft,
    itemsDraft,
    planningDepth,
    advancedSnapshot,
    isPlanMutating,
    onSummaryDraftChange,
    onItemsDraftChange,
    onAdvancedSnapshotChange,
    onSaveDraft,
    onDiscardEdits,
}: PlanEditModeProps) {
    return (
        <div className='space-y-3'>
            <div>
                <p className='text-sm font-semibold'>Edit View</p>
                <p className='text-muted-foreground text-xs'>
                    Revise the current plan revision, then save a new immutable draft.
                </p>
            </div>
            <div className='space-y-1'>
                <p className='text-xs font-medium'>Plan Summary</p>
                <textarea
                    rows={6}
                    className='border-border bg-background w-full rounded-md border p-2 text-xs'
                    value={summaryDraft}
                    onChange={(event) => {
                        onSummaryDraftChange(event.target.value);
                    }}
                />
            </div>
            <div className='space-y-1'>
                <p className='text-xs font-medium'>Plan Items (one per line)</p>
                <textarea
                    rows={6}
                    className='border-border bg-background w-full rounded-md border p-2 text-xs'
                    value={itemsDraft}
                    onChange={(event) => {
                        onItemsDraftChange(event.target.value);
                    }}
                />
                <p className='text-muted-foreground text-[11px]'>
                    The save action will persist a new revision and return to the structured artifact view.
                </p>
            </div>
            {planningDepth === 'advanced' && advancedSnapshot && onAdvancedSnapshotChange ? (
                <AdvancedPlanningEditor
                    snapshot={advancedSnapshot}
                    isPlanMutating={isPlanMutating}
                    onSnapshotChange={onAdvancedSnapshotChange}
                />
            ) : null}
            <div className='flex flex-wrap gap-2'>
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    disabled={isPlanMutating}
                    onClick={() => {
                        onSaveDraft();
                    }}>
                    Save Draft
                </Button>
                <Button
                    type='button'
                    size='sm'
                    variant='ghost'
                    disabled={isPlanMutating}
                    onClick={() => {
                        onDiscardEdits();
                    }}>
                    Discard Edits
                </Button>
            </div>
        </div>
    );
}

interface PlanArtifactViewProps {
    plan: ModeExecutionPlanView;
    artifactState: ModeExecutionPlanArtifactState;
    answerByQuestionId: Record<string, string>;
    planningDepth: PlanningDepth;
    advancedSnapshot?: ModeExecutionAdvancedPlanningSnapshotDraft;
    isPlanMutating: boolean;
    canConfigureExecutionStrategy: boolean;
    selectedExecutionStrategy: OrchestratorExecutionStrategy;
    onExecutionStrategyChange: (executionStrategy: OrchestratorExecutionStrategy) => void;
    researchState?: ModeExecutionPlanResearchArtifactState;
    researchRequestDraft: string;
    selectedResearchWorkerCount: number;
    onUpgradeToAdvancedPlanning: () => void;
    onQuestionAnswerDraftChange: (planId: ModeExecutionPlanView['id'], questionId: string, answer: string) => void;
    onAnswerQuestion: (planId: ModeExecutionPlanView['id'], questionId: string, answer: string) => void;
    onResearchRequestDraftChange: (next: string) => void;
    onSelectedResearchWorkerCountChange: (next: number) => void;
    onStartResearchBatch: (promptMarkdown: string, workerCount: number) => void;
    onAbortResearchBatch: (researchBatchId: EntityId<'prb'>) => void;
    onInsertEvidenceAttachmentToDraft: (attachmentId: EntityId<'pea'>) => void;
    onGenerateDraft: () => void;
    onEnterEditMode: () => void;
    onCancelPlan: () => void;
    onApprovePlan: () => void;
    onImplementPlan: () => void;
    onSelectChildThread?: (threadId: EntityId<'thr'>) => void;
    onCreateVariant?: (planId: ModeExecutionPlanView['id'], revisionId: EntityId<'prev'>) => void;
    onActivateVariant?: (planId: ModeExecutionPlanView['id'], variantId: EntityId<'pvar'>) => void;
    onResumeFromRevision?: (planId: ModeExecutionPlanView['id'], revisionId: EntityId<'prev'>) => void;
    onViewFollowUp?: (planId: ModeExecutionPlanView['id'], followUpId: EntityId<'pfu'>) => void;
    onResolveFollowUp?: (planId: ModeExecutionPlanView['id'], followUpId: EntityId<'pfu'>) => void;
}

export function PlanArtifactView({
    plan,
    artifactState,
    answerByQuestionId,
    planningDepth,
    advancedSnapshot,
    isPlanMutating,
    canConfigureExecutionStrategy,
    selectedExecutionStrategy,
    onExecutionStrategyChange,
    researchState,
    researchRequestDraft,
    selectedResearchWorkerCount,
    onUpgradeToAdvancedPlanning,
    onQuestionAnswerDraftChange,
    onAnswerQuestion,
    onResearchRequestDraftChange,
    onSelectedResearchWorkerCountChange,
    onStartResearchBatch,
    onAbortResearchBatch,
    onInsertEvidenceAttachmentToDraft,
    onGenerateDraft,
    onEnterEditMode,
    onCancelPlan,
    onApprovePlan,
    onImplementPlan,
    onSelectChildThread,
    onCreateVariant,
    onActivateVariant,
    onResumeFromRevision,
    onViewFollowUp,
    onResolveFollowUp,
}: PlanArtifactViewProps) {
    const isInteractionLocked = isPlanMutating || artifactState.hasRunningResearchBatch;

    return (
        <div className='space-y-3'>
            <PlanArtifactStatusSection artifactState={artifactState} />
            <PlanRecoveryBannerSection
                plan={plan}
                artifactState={artifactState}
                isPlanMutating={isInteractionLocked}
                onEnterEditMode={onEnterEditMode}
                {...(onActivateVariant ? { onActivateVariant } : {})}
                {...(onResolveFollowUp ? { onResolveFollowUp } : {})}
            />
            <PlanVariantSwitcherSection
                plan={plan}
                artifactState={artifactState}
                isPlanMutating={isInteractionLocked}
                {...(onCreateVariant ? { onCreateVariant } : {})}
                {...(onActivateVariant ? { onActivateVariant } : {})}
            />
            <PlanArtifactSummarySection plan={plan} />
            <PlanArtifactQuestionsSection
                plan={plan}
                isEditable={artifactState.questionsEditable}
                answerByQuestionId={answerByQuestionId}
                isPlanMutating={isInteractionLocked}
                onQuestionAnswerDraftChange={onQuestionAnswerDraftChange}
                onAnswerQuestion={onAnswerQuestion}
            />
            {planningDepth === 'advanced' && advancedSnapshot ? (
                <>
                    <PlanArtifactEvidenceSection advancedSnapshot={advancedSnapshot} />
                    <AdvancedPlanningArtifactSections snapshot={advancedSnapshot} />
                    {researchState ? (
                        <>
                            <PlanResearchSection
                                researchState={researchState}
                                researchRequestDraft={researchRequestDraft}
                                selectedWorkerCount={selectedResearchWorkerCount}
                                isPlanMutating={isPlanMutating}
                                onResearchRequestDraftChange={onResearchRequestDraftChange}
                                onSelectedWorkerCountChange={onSelectedResearchWorkerCountChange}
                                onStartResearchBatch={onStartResearchBatch}
                                onAbortResearchBatch={onAbortResearchBatch}
                                {...(onSelectChildThread ? { onSelectChildThread } : {})}
                            />
                            <PlanEvidenceAttachmentsSection
                                plan={plan}
                                researchState={researchState}
                                isPlanMutating={isPlanMutating}
                                onInsertIntoEvidenceDraft={onInsertEvidenceAttachmentToDraft}
                                {...(onSelectChildThread ? { onSelectChildThread } : {})}
                            />
                        </>
                    ) : null}
                </>
            ) : null}
            <PlanArtifactItemsSection plan={plan} />
            <PlanHistorySection
                plan={plan}
                artifactState={artifactState}
                isPlanMutating={isInteractionLocked}
                {...(onCreateVariant ? { onCreateVariant } : {})}
                {...(onActivateVariant ? { onActivateVariant } : {})}
                {...(onResumeFromRevision ? { onResumeFromRevision } : {})}
                {...(onViewFollowUp ? { onViewFollowUp } : {})}
                {...(onResolveFollowUp ? { onResolveFollowUp } : {})}
            />
            <PlanArtifactActionBar
                artifactState={artifactState}
                isPlanMutating={isInteractionLocked}
                selectedExecutionStrategy={selectedExecutionStrategy}
                canConfigureExecutionStrategy={canConfigureExecutionStrategy}
                onExecutionStrategyChange={onExecutionStrategyChange}
                onUpgradeToAdvancedPlanning={onUpgradeToAdvancedPlanning}
                onGenerateDraft={onGenerateDraft}
                onEnterEditMode={onEnterEditMode}
                onCancelPlan={onCancelPlan}
                onApprovePlan={onApprovePlan}
                onImplementPlan={onImplementPlan}
            />
        </div>
    );
}

export function PlanEditView(props: PlanEditModeProps) {
    return <PlanEditMode {...props} />;
}
