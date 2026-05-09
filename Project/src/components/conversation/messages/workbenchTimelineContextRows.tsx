import { WorkbenchRowShell } from '@/web/components/conversation/messages/workbenchRowPrimitives';
import { formatDiffLineDelta, formatDiffStatusLabel } from '@/web/components/conversation/panels/workbenchDiffModel';
import { WorkbenchDiffSummaryRow } from '@/web/components/conversation/panels/workbenchDiffRows';
import { WorkbenchApprovalRow } from '@/web/components/conversation/panels/workbenchApprovalRow';
import { QueuedRunReviewSummary } from '@/web/components/conversation/panels/queuedRunReviewSummary';
import { WorkbenchExecutionReceiptRow } from '@/web/components/conversation/panels/workbenchExecutionReceiptRow';
import type { WorkspaceInspectorSectionId } from '@/web/components/conversation/sessions/workspaceShellModel';
import { Button } from '@/web/components/ui/button';

import type { WorkbenchTimelineContextItem } from '@/web/components/conversation/messages/workbenchTimelineModel';
import type { PermissionRecord } from '@/app/backend/persistence/types';

type PermissionResolution = 'deny' | 'allow_once' | 'allow_profile' | 'allow_workspace';

interface WorkbenchTimelineContextRowsProps {
    items: WorkbenchTimelineContextItem[];
    isResolvingPermission?: boolean;
    onResolvePermission?: (
        requestId: PermissionRecord['id'],
        resolution: PermissionResolution,
        selectedApprovalResource?: string
    ) => void;
    onOpenInspectorSection?: (sectionId: WorkspaceInspectorSectionId) => void;
}

function InspectorButton({
    item,
    onOpenInspectorSection,
}: {
    item: WorkbenchTimelineContextItem;
    onOpenInspectorSection?: ((sectionId: WorkspaceInspectorSectionId) => void) | undefined;
}) {
    if (!item.inspectorSectionId || !onOpenInspectorSection) {
        return null;
    }

    return (
        <Button
            type='button'
            variant='ghost'
            size='sm'
            className='h-7 px-2 text-[11px]'
            onClick={() => {
                if (item.inspectorSectionId) {
                    onOpenInspectorSection(item.inspectorSectionId);
                }
            }}>
            Open details
        </Button>
    );
}

function WorkbenchRunStateRow({
    item,
    onOpenInspectorSection,
}: {
    item: Extract<WorkbenchTimelineContextItem, { kind: 'run_state' }>;
    onOpenInspectorSection?: ((sectionId: WorkspaceInspectorSectionId) => void) | undefined;
}) {
    return (
        <WorkbenchRowShell
            id={item.id}
            icon={item.icon}
            severity={item.severity}
            title={item.title}
            summary={item.summary}
            defaultCollapsed={item.defaultCollapsed}
            isRunning={item.status === 'running'}
            meta={<InspectorButton item={item} onOpenInspectorSection={onOpenInspectorSection} />}>
            <div className='space-y-1'>
                <p>Status: {item.run.status}</p>
                {item.run.errorMessage ? <p className='text-muted-foreground'>{item.run.errorMessage}</p> : null}
                <p className='text-muted-foreground'>{item.run.prompt}</p>
            </div>
        </WorkbenchRowShell>
    );
}

function WorkbenchPlanStepRow({
    item,
    onOpenInspectorSection,
}: {
    item: Extract<WorkbenchTimelineContextItem, { kind: 'plan_step' }>;
    onOpenInspectorSection?: ((sectionId: WorkspaceInspectorSectionId) => void) | undefined;
}) {
    return (
        <WorkbenchRowShell
            id={item.id}
            icon={item.icon}
            severity={item.severity}
            title={item.title}
            summary={item.summary}
            defaultCollapsed={item.defaultCollapsed}
            isRunning={item.status === 'running'}
            meta={<InspectorButton item={item} onOpenInspectorSection={onOpenInspectorSection} />}>
            <div className='space-y-1'>
                <p className='font-medium'>Status: {item.planItemStatus.replaceAll('_', ' ')}</p>
                <p className='text-muted-foreground whitespace-pre-wrap'>{item.description}</p>
            </div>
        </WorkbenchRowShell>
    );
}

function WorkbenchFileChangeTimelineRow({
    item,
    onOpenInspectorSection,
}: {
    item: Extract<WorkbenchTimelineContextItem, { kind: 'file_change' }>;
    onOpenInspectorSection?: ((sectionId: WorkspaceInspectorSectionId) => void) | undefined;
}) {
    return (
        <WorkbenchRowShell
            id={item.id}
            icon={item.icon}
            severity={item.severity}
            title={item.title}
            summary={formatDiffStatusLabel(item.file.status)}
            defaultCollapsed={item.defaultCollapsed}
            meta={<InspectorButton item={item} onOpenInspectorSection={onOpenInspectorSection} />}>
            <p>
                {[
                    formatDiffLineDelta('added', item.file.addedLines),
                    formatDiffLineDelta('deleted', item.file.deletedLines),
                ]
                    .filter((value): value is string => Boolean(value))
                    .join(' · ') || 'No textual line stats'}
            </p>
        </WorkbenchRowShell>
    );
}

function WorkbenchCompactionTimelineRow({
    item,
    onOpenInspectorSection,
}: {
    item: Extract<WorkbenchTimelineContextItem, { kind: 'compaction' }>;
    onOpenInspectorSection?: ((sectionId: WorkspaceInspectorSectionId) => void) | undefined;
}) {
    const checkpoint = item.receipt.contract.preparedContext.digest.checkpoints.post_compaction_reseed;

    return (
        <WorkbenchRowShell
            id={item.id}
            icon={item.icon}
            severity={item.severity}
            title={item.title}
            summary={item.summary}
            defaultCollapsed={item.defaultCollapsed}
            meta={<InspectorButton item={item} onOpenInspectorSection={onOpenInspectorSection} />}>
            <div className='space-y-1'>
                <p>Post-compaction reseed: {checkpoint.active ? 'active' : 'inactive'}</p>
                <p className='text-muted-foreground'>Digest: {checkpoint.digest}</p>
            </div>
        </WorkbenchRowShell>
    );
}

export function WorkbenchTimelineContextRows({
    items,
    isResolvingPermission = false,
    onResolvePermission,
    onOpenInspectorSection,
}: WorkbenchTimelineContextRowsProps) {
    if (items.length === 0) {
        return null;
    }

    return (
        <div className='space-y-2' aria-label='Run timeline context'>
            {items.map((item) => {
                if (item.kind === 'approval') {
                    return onResolvePermission ? (
                        <WorkbenchApprovalRow
                            key={item.id}
                            request={item.request}
                            {...(item.workspaceInfo ? { workspaceInfo: item.workspaceInfo } : {})}
                            busy={isResolvingPermission}
                            onResolve={onResolvePermission}
                        />
                    ) : (
                        <WorkbenchRowShell
                            key={item.id}
                            id={item.id}
                            icon={item.icon}
                            severity={item.severity}
                            title={item.title}
                            summary={item.summary}
                            defaultCollapsed={item.defaultCollapsed}
                            meta={<InspectorButton item={item} onOpenInspectorSection={onOpenInspectorSection} />}>
                            <p>{item.request.resource}</p>
                        </WorkbenchRowShell>
                    );
                }

                if (item.kind === 'diff') {
                    return <WorkbenchDiffSummaryRow key={item.id} overview={item.overview} />;
                }

                if (item.kind === 'file_change') {
                    return (
                        <WorkbenchFileChangeTimelineRow
                            key={item.id}
                            item={item}
                            onOpenInspectorSection={onOpenInspectorSection}
                        />
                    );
                }

                if (item.kind === 'plan_step') {
                    return (
                        <WorkbenchPlanStepRow
                            key={item.id}
                            item={item}
                            onOpenInspectorSection={onOpenInspectorSection}
                        />
                    );
                }

                if (item.kind === 'queued_followup') {
                    return (
                        <WorkbenchRowShell
                            key={item.id}
                            id={item.id}
                            icon={item.icon}
                            severity={item.severity}
                            title={item.title}
                            summary={item.summary}
                            defaultCollapsed={item.defaultCollapsed}
                            meta={<InspectorButton item={item} onOpenInspectorSection={onOpenInspectorSection} />}>
                            <QueuedRunReviewSummary entry={item.entry} />
                        </WorkbenchRowShell>
                    );
                }

                if (item.kind === 'execution_receipt') {
                    return <WorkbenchExecutionReceiptRow key={item.id} receipt={item.receipt} />;
                }

                if (item.kind === 'compaction') {
                    return (
                        <WorkbenchCompactionTimelineRow
                            key={item.id}
                            item={item}
                            onOpenInspectorSection={onOpenInspectorSection}
                        />
                    );
                }

                return (
                    <WorkbenchRunStateRow key={item.id} item={item} onOpenInspectorSection={onOpenInspectorSection} />
                );
            })}
        </div>
    );
}
