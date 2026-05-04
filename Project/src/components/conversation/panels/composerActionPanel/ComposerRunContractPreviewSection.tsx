import { skipToken } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { OperatorDiagnosticList } from '@/web/components/ui/operatorDiagnosticList';
import {
    buildRunContractPreviewDiagnostics,
    buildRunContractUnavailableDiagnostic,
} from '@/web/lib/operatorDiagnostics';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { BrowserContextSummary, RunContractPreview } from '@/shared/contracts';

interface ComposerRunContractPreviewSectionProps {
    preview?: RunContractPreview;
    profileId: string;
    browserContextSummary?: BrowserContextSummary;
    isLoading: boolean;
    unavailableMessage?: string;
    waitingForAttachments?: boolean;
}

function renderTrustSummary(preview: RunContractPreview): string {
    const trustedInstructions = preview.trustSummary.contributorCountByTrustLevel.trusted_instruction;
    const userInputs = preview.trustSummary.contributorCountByTrustLevel.user_input;
    const workspaceContent = preview.trustSummary.contributorCountByTrustLevel.workspace_content;
    const promotedFacts = preview.trustSummary.contributorCountByTrustLevel.promoted_fact;
    return `${String(trustedInstructions)} trusted, ${String(userInputs)} user, ${String(workspaceContent)} workspace, ${String(promotedFacts)} promoted`;
}

function formatDocumentSelection(preview: RunContractPreview): string {
    const documents = preview.documentSummary ?? [];
    if (documents.length === 0) {
        return 'No PDF document context selected.';
    }

    const selectedTokens = documents.reduce((total, document) => total + document.selectedTokenCount, 0);
    const omittedPages = documents.reduce((total, document) => total + document.omittedPageCount, 0);
    return `${String(documents.length)} PDF${documents.length === 1 ? '' : 's'} · ${String(selectedTokens)} selected tokens · ${String(omittedPages)} omitted pages`;
}

function formatDocumentPageRanges(document: NonNullable<RunContractPreview['documentSummary']>[number]): string {
    if (document.selectedPageRanges.length === 0) {
        return document.blockedReason ? document.blockedReason.replaceAll('_', ' ') : 'No pages selected';
    }
    return document.selectedPageRanges
        .map((range) =>
            range.startPage === range.endPage
                ? `p. ${String(range.startPage)}`
                : `pp. ${String(range.startPage)}-${String(range.endPage)}`
        )
        .join(', ');
}

function formatExecutionTarget(preview: RunContractPreview): string {
    const target = preview.executionTarget;
    if (target.kind === 'detached') {
        return 'Detached: no filesystem target';
    }
    if (target.kind === 'workspace') {
        return target.absolutePath ? `Local workspace: ${target.absolutePath}` : `Local workspace: ${target.label}`;
    }
    if (target.kind === 'scheduled_sandbox') {
        return target.workspacePath
            ? `Managed sandbox scheduled from ${target.workspacePath}`
            : `Managed sandbox scheduled from ${target.label}`;
    }
    if (target.kind === 'research_checkout') {
        return target.absolutePath ? `Research checkout: ${target.absolutePath}` : target.label;
    }
    return target.absolutePath ? `Managed sandbox: ${target.absolutePath}` : `Managed sandbox: ${target.label}`;
}

function RepoWorkflowPreviewSection({ preview, profileId }: { preview: RunContractPreview; profileId: string }) {
    const researchTarget = preview.researchTarget;
    const checkoutRecordId = researchTarget?.checkoutRecordId;
    const [commitMessage, setCommitMessage] = useState('');
    const [prTitle, setPrTitle] = useState('');
    const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
    const utils = trpc.useUtils();
    const commitPreviewQuery = trpc.runtime.previewRepoCommit.useQuery(
        checkoutRecordId
            ? {
                  profileId,
                  researchCheckoutRecordId: checkoutRecordId,
                  message: commitMessage || 'repo workflow preview',
                  selectedPaths,
              }
            : skipToken,
        PROGRESSIVE_QUERY_OPTIONS
    );
    const pushPreviewQuery = trpc.runtime.previewRepoPush.useQuery(
        checkoutRecordId
            ? {
                  profileId,
                  researchCheckoutRecordId: checkoutRecordId,
              }
            : skipToken,
        PROGRESSIVE_QUERY_OPTIONS
    );
    const applyCommitMutation = trpc.runtime.applyRepoCommit.useMutation({
        onSuccess: () => {
            void utils.runtime.previewRepoCommit.invalidate();
            void utils.runtime.previewRepoPush.invalidate();
        },
    });
    const applyPushMutation = trpc.runtime.applyRepoPush.useMutation({
        onSuccess: () => {
            void utils.runtime.previewRepoPush.invalidate();
        },
    });
    const generateDraftMutation = trpc.runtime.generateRepoTextDraft.useMutation({
        onSuccess: (result) => {
            if (result.available && result.text) {
                if (result.draftKind === 'commit_message') {
                    setCommitMessage(result.text);
                } else {
                    setPrTitle(result.text);
                }
            }
        },
    });

    useEffect(() => {
        setSelectedPaths([]);
    }, [checkoutRecordId]);

    if (!researchTarget || !checkoutRecordId) {
        return null;
    }

    const commitPreview = commitPreviewQuery.data;
    const pushPreview = pushPreviewQuery.data;
    const files = commitPreview?.changeSummary.files ?? [];
    const activeSelectedPaths = selectedPaths.length > 0 ? selectedPaths : files.map((file) => file.relativePath);
    const commitDisabled =
        !commitPreview?.available ||
        !commitPreview.expectedCommitDigest ||
        commitMessage.trim().length === 0 ||
        applyCommitMutation.isPending;
    const pushDisabled = !pushPreview?.available || !pushPreview.expectedPushDigest || applyPushMutation.isPending;

    return (
        <div className='rounded-xl border px-3 py-2 sm:col-span-2'>
            <div className='mb-2 flex items-start justify-between gap-3'>
                <div>
                    <p className='text-muted-foreground'>Repo Workflow</p>
                    <p className='font-medium'>
                        {researchTarget.locator.name} · {researchTarget.mutationGuardrail.intent}
                    </p>
                </div>
                <span className='text-muted-foreground rounded-full border px-2 py-1 text-[11px]'>
                    {researchTarget.mutationGuardrail.outcome.replaceAll('_', ' ')}
                </span>
            </div>
            <p className='text-muted-foreground mb-2'>{researchTarget.mutationGuardrail.reason}</p>
            {files.length > 0 ? (
                <div className='mb-2 max-h-36 overflow-auto rounded-md border'>
                    {files.map((file) => (
                        <label
                            key={file.relativePath}
                            className='flex items-center gap-2 border-b px-2 py-1 last:border-b-0'>
                            <input
                                type='checkbox'
                                disabled={!file.selectable}
                                checked={activeSelectedPaths.includes(file.relativePath)}
                                onChange={(event) => {
                                    const next = new Set(activeSelectedPaths);
                                    if (event.target.checked) {
                                        next.add(file.relativePath);
                                    } else {
                                        next.delete(file.relativePath);
                                    }
                                    setSelectedPaths([...next].sort((left, right) => left.localeCompare(right)));
                                }}
                            />
                            <span className='text-muted-foreground w-20 shrink-0'>{file.status}</span>
                            <span className='truncate'>{file.relativePath}</span>
                        </label>
                    ))}
                </div>
            ) : (
                <p className='text-muted-foreground mb-2'>No changed files reported for commit preview.</p>
            )}
            <div className='grid gap-2 md:grid-cols-2'>
                <label className='space-y-1'>
                    <span className='text-muted-foreground'>Commit message</span>
                    <input
                        className='border-input bg-background h-9 w-full rounded-md border px-3'
                        value={commitMessage}
                        onChange={(event) => {
                            setCommitMessage(event.target.value);
                        }}
                    />
                </label>
                <label className='space-y-1'>
                    <span className='text-muted-foreground'>PR title draft</span>
                    <input
                        className='border-input bg-background h-9 w-full rounded-md border px-3'
                        value={prTitle}
                        onChange={(event) => {
                            setPrTitle(event.target.value);
                        }}
                    />
                </label>
            </div>
            <div className='mt-2 flex flex-wrap gap-2'>
                <button
                    type='button'
                    className='rounded-md border px-2 py-1'
                    disabled={generateDraftMutation.isPending}
                    onClick={() => {
                        generateDraftMutation.mutate({
                            profileId,
                            researchCheckoutRecordId: checkoutRecordId,
                            message: commitMessage || 'repo workflow draft',
                            selectedPaths: activeSelectedPaths,
                            draftKind: 'commit_message',
                            providerId: preview.steeringSnapshot.providerId,
                            modelId: preview.steeringSnapshot.modelId,
                        });
                    }}>
                    Generate commit
                </button>
                <button
                    type='button'
                    className='rounded-md border px-2 py-1'
                    disabled={generateDraftMutation.isPending}
                    onClick={() => {
                        generateDraftMutation.mutate({
                            profileId,
                            researchCheckoutRecordId: checkoutRecordId,
                            message: prTitle || commitMessage || 'repo workflow draft',
                            selectedPaths: activeSelectedPaths,
                            draftKind: 'pr_title',
                            providerId: preview.steeringSnapshot.providerId,
                            modelId: preview.steeringSnapshot.modelId,
                        });
                    }}>
                    Generate PR title
                </button>
                <button
                    type='button'
                    className='rounded-md border px-2 py-1'
                    disabled={commitDisabled}
                    onClick={() => {
                        if (commitPreview?.expectedCommitDigest) {
                            applyCommitMutation.mutate({
                                profileId,
                                researchCheckoutRecordId: checkoutRecordId,
                                message: commitMessage,
                                selectedPaths: activeSelectedPaths,
                                expectedCommitDigest: commitPreview.expectedCommitDigest,
                            });
                        }
                    }}>
                    Commit selected
                </button>
                <button
                    type='button'
                    className='rounded-md border px-2 py-1'
                    disabled={pushDisabled}
                    onClick={() => {
                        if (pushPreview?.expectedPushDigest) {
                            applyPushMutation.mutate({
                                profileId,
                                researchCheckoutRecordId: checkoutRecordId,
                                expectedPushDigest: pushPreview.expectedPushDigest,
                            });
                        }
                    }}>
                    Push
                </button>
            </div>
            <p className='text-muted-foreground mt-2'>
                Commit: {commitPreview?.guardrail.reason ?? 'Preview unavailable.'}
                {' · '}
                Push: {pushPreview?.guardrail.reason ?? 'Preview unavailable.'}
            </p>
        </div>
    );
}

export function ComposerRunContractPreviewSection(input: ComposerRunContractPreviewSectionProps) {
    const browserContextSummary = input.preview?.browserContextSummary ?? input.browserContextSummary;
    const diagnostics = input.preview ? buildRunContractPreviewDiagnostics(input.preview) : [];
    const unavailableDiagnostic =
        !input.waitingForAttachments && input.unavailableMessage
            ? [buildRunContractUnavailableDiagnostic(input.unavailableMessage)]
            : [];

    return (
        <section className='border-border/60 bg-card/25 rounded-2xl border px-3 py-3'>
            <div className='mb-2 flex items-start justify-between gap-3'>
                <div>
                    <h3 className='text-sm font-semibold'>Run Contract Preview</h3>
                    <p className='text-muted-foreground text-xs'>
                        Current draft steering, prepared context, trust mix, and queue-compatibility signals.
                    </p>
                </div>
                <span className='text-muted-foreground rounded-full border px-2 py-1 text-[11px]'>
                    {input.isLoading
                        ? 'Refreshing'
                        : input.preview?.diffFromLastCompatible?.hasMaterialChanges
                          ? 'Changed'
                          : input.preview
                            ? 'Ready'
                            : 'Idle'}
                </span>
            </div>
            {input.waitingForAttachments ? (
                <p className='text-muted-foreground text-xs'>
                    Run contract preview waits until attached files finish preparing.
                </p>
            ) : null}
            <OperatorDiagnosticList diagnostics={unavailableDiagnostic} className='mb-2' compact />
            {!input.waitingForAttachments && !input.unavailableMessage && input.preview ? (
                <div className='space-y-2'>
                    <OperatorDiagnosticList diagnostics={diagnostics} compact />
                    <div className='grid gap-2 text-xs sm:grid-cols-2'>
                        <div className='rounded-xl border px-3 py-2'>
                            <p className='text-muted-foreground'>Target</p>
                            <p className='font-medium'>
                                {input.preview.steeringSnapshot.providerId} / {input.preview.steeringSnapshot.modelId}
                            </p>
                        </div>
                        <div className='rounded-xl border px-3 py-2'>
                            <p className='text-muted-foreground'>Cache</p>
                            <p className='font-medium'>{input.preview.cache.cacheabilityHint}</p>
                        </div>
                        <div className='rounded-xl border px-3 py-2 sm:col-span-2'>
                            <p className='text-muted-foreground'>Execution Target</p>
                            <p className='font-medium'>{formatExecutionTarget(input.preview)}</p>
                        </div>
                        <div className='rounded-xl border px-3 py-2'>
                            <p className='text-muted-foreground'>Prepared Context</p>
                            <p className='font-medium'>
                                {String(input.preview.preparedContext.activeContributorCount)} contributors
                            </p>
                        </div>
                        <div className='rounded-xl border px-3 py-2'>
                            <p className='text-muted-foreground'>Attachments</p>
                            <p className='font-medium'>
                                {String(input.preview.attachmentSummary.totalCount)} total
                                {input.preview.attachmentSummary.textFileAttachmentCount > 0
                                    ? `, ${String(input.preview.attachmentSummary.textFileAttachmentCount)} text`
                                    : ''}
                                {input.preview.attachmentSummary.imageAttachmentCount > 0
                                    ? `, ${String(input.preview.attachmentSummary.imageAttachmentCount)} images`
                                    : ''}
                                {(input.preview.attachmentSummary.documentAttachmentCount ?? 0) > 0
                                    ? `, ${String(input.preview.attachmentSummary.documentAttachmentCount)} PDFs`
                                    : ''}
                            </p>
                        </div>
                        {(input.preview.documentSummary?.length ?? 0) > 0 ? (
                            <div className='rounded-xl border px-3 py-2 sm:col-span-2'>
                                <p className='text-muted-foreground'>PDF Documents</p>
                                <p className='font-medium'>{formatDocumentSelection(input.preview)}</p>
                                <div className='mt-2 space-y-1'>
                                    {input.preview.documentSummary?.map((document) => (
                                        <p key={document.documentArtifactId} className='text-muted-foreground'>
                                            {document.fileName}: {formatDocumentPageRanges(document)} ·{' '}
                                            {String(document.selectedTokenCount)} tokens selected
                                        </p>
                                    ))}
                                </div>
                            </div>
                        ) : null}
                        <RepoWorkflowPreviewSection preview={input.preview} profileId={input.profileId} />
                        {browserContextSummary ? (
                            <div className='rounded-xl border px-3 py-2'>
                                <p className='text-muted-foreground'>Browser Context</p>
                                <p className='font-medium'>
                                    {String(browserContextSummary.commentCount)} comments,{' '}
                                    {String(browserContextSummary.selectedElementCount)} elements,{' '}
                                    {String(browserContextSummary.captureCount)} captures,{' '}
                                    {String(browserContextSummary.designerDraftCount)} designer drafts
                                </p>
                                <p className='text-muted-foreground mt-1'>
                                    Apply intent: {browserContextSummary.designerApplyIntentStatus.replaceAll('_', ' ')}
                                </p>
                            </div>
                        ) : null}
                        <div className='rounded-xl border px-3 py-2 sm:col-span-2'>
                            <p className='text-muted-foreground'>Trust Mix</p>
                            <p className='font-medium'>{renderTrustSummary(input.preview)}</p>
                        </div>
                        <div className='rounded-xl border px-3 py-2 sm:col-span-2'>
                            <p className='text-muted-foreground'>Dynamic Skill Expansion</p>
                            <p className='font-medium'>
                                {String(input.preview.dynamicExpansionSummary.resolvedCount)} resolved,{' '}
                                {String(input.preview.dynamicExpansionSummary.blockedCount)} blocked,{' '}
                                {String(input.preview.dynamicExpansionSummary.failedCount)} failed,{' '}
                                {String(input.preview.dynamicExpansionSummary.omittedCount)} omitted
                            </p>
                        </div>
                        {input.preview.diffFromLastCompatible ? (
                            <div className='rounded-xl border px-3 py-2 sm:col-span-2'>
                                <p className='text-muted-foreground'>Compatibility</p>
                                <p className='font-medium'>
                                    {input.preview.diffFromLastCompatible.hasMaterialChanges
                                        ? 'Material drift detected before execution.'
                                        : 'Compatible with the last accepted contract.'}
                                </p>
                                {input.preview.diffFromLastCompatible.items.length > 0 ? (
                                    <p className='text-muted-foreground mt-1'>
                                        {input.preview.diffFromLastCompatible.items
                                            .slice(0, 2)
                                            .map((item) => `${item.field}: ${item.reason}`)
                                            .join(' • ')}
                                    </p>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </section>
    );
}
