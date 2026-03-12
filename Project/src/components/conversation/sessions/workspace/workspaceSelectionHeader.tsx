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

function formatSessionOptionLabel(session: SessionSummaryRecord): string {
    const kindLabel = session.kind === 'worktree' ? 'Worktree' : session.kind === 'local' ? 'Workspace' : 'Playground';
    return `${kindLabel} · ${session.turnCount} turns`;
}

function formatRunOptionLabel(run: RunRecord): string {
    const timestamp = new Date(run.updatedAt);
    const timeLabel = Number.isNaN(timestamp.getTime()) ? run.id : timestamp.toLocaleTimeString();
    return `${run.status.replaceAll('_', ' ')} · ${timeLabel}`;
}

export function WorkspaceSelectionHeader({
    sessions,
    runs,
    selectedSession,
    selectedRun,
    compactConnectionLabel,
    routingBadge,
    pendingPermissionCount,
    canCreateSession,
    isCreatingSession,
    isInspectorOpen,
    onCreateSession,
    onSelectSession,
    onSelectRun,
    onToggleInspector,
}: WorkspaceSelectionHeaderProps) {
    return (
        <div className='border-border/70 bg-card/30 border-b px-4 py-4'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='min-w-0'>
                    <p className='text-sm font-semibold'>{selectedSession ? 'Conversation flow' : 'Workspace'}</p>
                    <p className='text-muted-foreground mt-1 text-xs'>
                        Transcript and composer stay primary. Session, run, and workspace detail stay compact until needed.
                    </p>
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
                    <Button type='button' size='sm' variant='outline' disabled={!canCreateSession || isCreatingSession} onClick={onCreateSession}>
                        New session
                    </Button>
                    <Button type='button' size='sm' variant={isInspectorOpen ? 'secondary' : 'outline'} onClick={onToggleInspector}>
                        {isInspectorOpen ? 'Hide Inspector' : 'Show Inspector'}
                    </Button>
                </div>
            </div>

            <div className='mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]'>
                <label className='space-y-1'>
                    <span className='text-muted-foreground block text-[11px] font-semibold tracking-[0.12em] uppercase'>
                        Session
                    </span>
                    <select
                        aria-label='Selected session'
                        value={selectedSession?.id ?? ''}
                        className='border-border bg-background h-10 w-full rounded-xl border px-3 text-sm'
                        onChange={(event) => {
                            onSelectSession(event.target.value);
                        }}
                        disabled={sessions.length === 0}>
                        {sessions.length === 0 ? <option value=''>No sessions</option> : null}
                        {sessions.map((session) => (
                            <option key={session.id} value={session.id}>
                                {formatSessionOptionLabel(session)}
                            </option>
                        ))}
                    </select>
                </label>

                <label className='space-y-1'>
                    <span className='text-muted-foreground block text-[11px] font-semibold tracking-[0.12em] uppercase'>
                        Run focus
                    </span>
                    <select
                        aria-label='Selected run'
                        value={selectedRun?.id ?? ''}
                        className='border-border bg-background h-10 w-full rounded-xl border px-3 text-sm'
                        onChange={(event) => {
                            onSelectRun(event.target.value);
                        }}
                        disabled={runs.length === 0}>
                        {runs.length === 0 ? <option value=''>No runs</option> : null}
                        {runs.map((run) => (
                            <option key={run.id} value={run.id}>
                                {formatRunOptionLabel(run)}
                            </option>
                        ))}
                    </select>
                </label>

                <div className='flex items-end justify-start xl:justify-end'>
                    <div className='text-muted-foreground border-border/70 bg-background/50 rounded-[1.25rem] border px-3 py-2 text-xs'>
                        {selectedSession ? `${String(selectedSession.turnCount)} turns · ${selectedSession.runStatus}` : 'No session selected'}
                    </div>
                </div>
            </div>
        </div>
    );
}
