import { WorkspaceRunContextStrip } from '@/web/components/conversation/sessions/workspace/workspaceRunContextStrip';
import type {
    RunContextStripModel,
    WorkspaceInspectorSectionId,
} from '@/web/components/conversation/sessions/workspaceShellModel';
import { Button } from '@/web/components/ui/button';

import type { RunRecord, SessionSummaryRecord } from '@/app/backend/persistence/types';

interface WorkspaceSelectionHeaderProps {
    sessions: SessionSummaryRecord[];
    runs: RunRecord[];
    selectedSession: SessionSummaryRecord | undefined;
    selectedRun: RunRecord | undefined;
    runContextStrip: RunContextStripModel;
    compactConnectionLabel?: string;
    routingBadge?: string;
    pendingPermissionCount: number;
    isInspectorOpen: boolean;
    onSelectSession: (sessionId: string) => void;
    onSelectRun: (runId: string) => void;
    onToggleInspector: () => void;
    onOpenInspectorSection: (sectionId: WorkspaceInspectorSectionId) => void;
    onAbortSessionRun?: () => void;
}

function formatRunStatus(run: RunRecord | undefined): string | undefined {
    return run ? run.status.replaceAll('_', ' ') : undefined;
}

function formatSessionLabel(session: SessionSummaryRecord): string {
    return `${String(session.turnCount)} turns · ${session.runStatus.replaceAll('_', ' ')}`;
}

function formatRunLabel(run: RunRecord): string {
    return run.status.replaceAll('_', ' ');
}

export function WorkspaceSelectionHeader({
    sessions,
    runs,
    selectedSession,
    selectedRun,
    runContextStrip,
    compactConnectionLabel,
    routingBadge,
    pendingPermissionCount,
    isInspectorOpen,
    onSelectSession,
    onSelectRun,
    onToggleInspector,
    onOpenInspectorSection,
    onAbortSessionRun,
}: WorkspaceSelectionHeaderProps) {
    const runStatus = selectedRun ? formatRunStatus(selectedRun) : undefined;
    const hasRunningSession = selectedSession?.runStatus === 'running';
    const activeSummary = selectedSession
        ? `${String(selectedSession.turnCount)} turns${runStatus ? ` · ${runStatus}` : ''}`
        : 'Choose or create a thread to start working.';

    return (
        <div className='border-border/70 bg-card/30 rounded-[28px] border px-4 py-3 shadow-sm'>
            <div className='flex flex-wrap items-start justify-between gap-4'>
                <div className='min-w-0 flex-1 space-y-2'>
                    <div className='flex flex-wrap items-center gap-2'>
                        <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.16em] uppercase'>
                            Workspace selection
                        </p>
                        {compactConnectionLabel ? (
                            <span className='border-border bg-background/70 text-muted-foreground rounded-full border px-3 py-1 text-xs tabular-nums'>
                                {compactConnectionLabel}
                            </span>
                        ) : null}
                        {routingBadge ? (
                            <span className='border-border bg-background/70 text-muted-foreground rounded-full border px-3 py-1 text-xs'>
                                {routingBadge}
                            </span>
                        ) : null}
                        {pendingPermissionCount > 0 ? (
                            <span className='rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200 tabular-nums'>
                                {String(pendingPermissionCount)} approvals waiting
                            </span>
                        ) : null}
                    </div>

                    <div className='space-y-1'>
                        <p className='text-sm font-semibold'>
                            {selectedSession ? 'Selected thread' : 'Workspace overview'}
                        </p>
                        <p className='text-muted-foreground text-xs'>{activeSummary}</p>
                    </div>

                    <WorkspaceRunContextStrip model={runContextStrip} onOpenInspectorSection={onOpenInspectorSection} />

                    <div className='grid gap-3 md:grid-cols-[minmax(0,1.25fr)_minmax(0,0.85fr)]'>
                        <label className='space-y-1.5'>
                            <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                                Thread
                            </span>
                            <select
                                aria-label='Select thread'
                                className='border-border bg-background/80 h-11 w-full rounded-2xl border px-3 text-sm tabular-nums'
                                value={selectedSession?.id ?? ''}
                                disabled={sessions.length === 0}
                                onChange={(event) => {
                                    const nextSessionId = event.target.value;
                                    if (!nextSessionId) {
                                        return;
                                    }

                                    onSelectSession(nextSessionId);
                                }}>
                                <option value=''>Choose thread</option>
                                {sessions.map((session) => (
                                    <option key={session.id} value={session.id}>
                                        {formatSessionLabel(session)}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className='space-y-1.5'>
                            <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                                Run
                            </span>
                            <select
                                aria-label='Select run'
                                className='border-border bg-background/80 h-11 w-full rounded-2xl border px-3 text-sm'
                                value={selectedRun?.id ?? ''}
                                disabled={runs.length === 0}
                                onChange={(event) => {
                                    const nextRunId = event.target.value;
                                    if (!nextRunId) {
                                        return;
                                    }

                                    onSelectRun(nextRunId);
                                }}>
                                <option value=''>Latest run</option>
                                {runs.map((run) => (
                                    <option key={run.id} value={run.id}>
                                        {formatRunLabel(run)}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                </div>

                <div className='flex shrink-0 items-start gap-2'>
                    {hasRunningSession ? (
                        <Button
                            type='button'
                            size='sm'
                            variant='destructive'
                            className='min-h-11 rounded-full'
                            disabled={!onAbortSessionRun}
                            onClick={onAbortSessionRun}>
                            Stop Run
                        </Button>
                    ) : null}
                    <Button
                        type='button'
                        size='sm'
                        variant={isInspectorOpen ? 'secondary' : 'outline'}
                        className='min-h-11 rounded-full'
                        onClick={onToggleInspector}>
                        {isInspectorOpen ? 'Hide Inspector' : 'Show Inspector'}
                    </Button>
                </div>
            </div>
        </div>
    );
}
