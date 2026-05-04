import { formatWorkbenchElapsedMs } from '@/web/components/conversation/messages/workbenchRowFormatting';
import { WorkbenchRowShell } from '@/web/components/conversation/messages/workbenchRowPrimitives';
import type {
    WorkbenchTimelineIconToken,
    WorkbenchTimelineItemSeverity,
    WorkbenchTimelineItemStatus,
} from '@/web/components/conversation/messages/workbenchTimelineModel';

export interface WorkbenchStatusRowItem {
    workbenchItemId: string;
    code: 'received' | 'stalled' | 'failed_before_output';
    label: string;
    status: WorkbenchTimelineItemStatus;
    severity: WorkbenchTimelineItemSeverity;
    icon: WorkbenchTimelineIconToken;
    title: string;
    defaultCollapsed: boolean;
    summary?: string;
    elapsedMs?: number;
}

function statusLabel(status: WorkbenchTimelineItemStatus): string {
    if (status === 'running') {
        return 'Running';
    }
    if (status === 'pending') {
        return 'Pending';
    }
    if (status === 'failed') {
        return 'Failed';
    }
    if (status === 'sending') {
        return 'Sending';
    }
    return 'Completed';
}

export function WorkbenchStatusRow({ item }: { item: WorkbenchStatusRowItem }) {
    const isRunning = item.status === 'running' || item.status === 'pending' || item.status === 'sending';

    return (
        <WorkbenchRowShell
            id={item.workbenchItemId}
            icon={item.icon}
            severity={item.severity}
            title={item.title}
            summary={item.label}
            defaultCollapsed={item.defaultCollapsed}
            isRunning={isRunning}
            meta={item.elapsedMs !== undefined ? <span>{formatWorkbenchElapsedMs(item.elapsedMs)}</span> : null}>
            <dl className='grid gap-1 sm:grid-cols-[auto_1fr]'>
                <dt className='font-medium opacity-75'>Status</dt>
                <dd>{statusLabel(item.status)}</dd>
                <dt className='font-medium opacity-75'>Summary</dt>
                <dd>{item.summary ?? item.label}</dd>
                {item.elapsedMs !== undefined ? (
                    <>
                        <dt className='font-medium opacity-75'>Elapsed</dt>
                        <dd>{formatWorkbenchElapsedMs(item.elapsedMs)}</dd>
                    </>
                ) : null}
            </dl>
        </WorkbenchRowShell>
    );
}
