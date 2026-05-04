import type { SessionOutboxEntry } from '@/shared/contracts';

export function formatQueuedAttachmentSummary(entry: SessionOutboxEntry): string {
    if (entry.attachmentIds.length === 0) {
        return 'No attachments';
    }
    return `${String(entry.attachmentIds.length)} attachment${entry.attachmentIds.length === 1 ? '' : 's'}`;
}

export function formatQueuedBrowserContextSummary(entry: SessionOutboxEntry): string {
    if (!entry.browserContextSummary) {
        return 'No browser context';
    }
    return `${String(entry.browserContextSummary.commentCount)} comments · ${String(entry.browserContextSummary.selectedElementCount)} elements · ${String(entry.browserContextSummary.designerDraftCount)} designer`;
}

export function formatQueuedExecutionTargetSummary(entry: SessionOutboxEntry): string {
    const target = entry.latestRunContract?.executionTarget;
    if (!target) {
        return 'Execution target unavailable';
    }

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

    return target.absolutePath ? `Managed sandbox: ${target.absolutePath}` : `Managed sandbox: ${target.label}`;
}

export function getQueuedDynamicContributors(entry: SessionOutboxEntry) {
    return (
        entry.latestRunContract?.preparedContext.contributors.filter(
            (contributor) => contributor.kind === 'dynamic_skill_context'
        ) ?? []
    );
}
