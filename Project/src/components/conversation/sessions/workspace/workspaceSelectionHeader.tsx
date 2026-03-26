import { Button } from '@/web/components/ui/button';

import type { RunRecord, SessionSummaryRecord } from '@/app/backend/persistence/types';

interface WorkspaceSelectionHeaderProps {
    sessions: SessionSummaryRecord[];
    runs: RunRecord[];
    selectedSession: SessionSummaryRecord | undefined;
    selectedRun: RunRecord | undefined;
    compactConnectionLabel?: string;
    routingBadge?: string;
    pendingPermissionCount: number;
    canCreateSession: boolean;
    isCreatingSession: boolean;
    isInspectorOpen: boolean;
    onCreateSession: () => void;
    onSelectSession: (sessionId: string) => void;
    onSelectRun: (runId: string) => void;
    onToggleInspector: () => void;
}

function formatRunStatus(run: RunRecord | undefined): string | undefined {
    return run ? run.status.replaceAll('_', ' ') : undefined;
}

export function WorkspaceSelectionHeader({
    selectedSession,
    selectedRun,
    compactConnectionLabel,
    routingBadge,
    pendingPermissionCount,
    isInspectorOpen,
    onToggleInspector,
}: WorkspaceSelectionHeaderProps) {
    const runStatus = selectedRun ? formatRunStatus(selectedRun) : undefined;
    const activeSummary = selectedSession
        ? `${String(selectedSession.turnCount)} turns${runStatus ? ` · ${runStatus}` : ''}`
        : 'Choose or create a thread to start working.';

    return (
        <div className='border-border/70 bg-card/20 border-b px-4 py-3'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='min-w-0'>
                    <p className='text-sm font-semibold'>{selectedSession ? 'Active thread' : 'Workspace overview'}</p>
                    <p className='text-muted-foreground mt-1 text-xs'>{activeSummary}</p>
                </div>

                <div className='flex flex-wrap items-center gap-2'>
                    {compactConnectionLabel ? (
                        <span className='border-border bg-background/70 text-muted-foreground rounded-full border px-3 py-1 text-xs'>
                            {compactConnectionLabel}
                        </span>
                    ) : null}
                    {routingBadge ? (
                        <span className='border-border bg-background/70 text-muted-foreground rounded-full border px-3 py-1 text-xs'>
                            {routingBadge}
                        </span>
                    ) : null}
                    {pendingPermissionCount > 0 ? (
                        <span className='rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200'>
                            {String(pendingPermissionCount)} approvals waiting
                        </span>
                    ) : null}
                    <Button
                        type='button'
                        size='sm'
                        variant={isInspectorOpen ? 'secondary' : 'outline'}
                        onClick={onToggleInspector}>
                        {isInspectorOpen ? 'Hide Inspector' : 'Show Inspector'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
