import {
    formatBootElapsedMs,
    getBootBlockingPrerequisiteLabel,
    type BootStatusSnapshot,
} from '@/app/shared/splashContract';

interface WorkspaceBootDiagnosticsPanelProps {
    status: BootStatusSnapshot;
}

export function WorkspaceBootDiagnosticsPanel({ status }: WorkspaceBootDiagnosticsPanelProps) {
    const blockingPrerequisiteLabel = status.blockingPrerequisite
        ? getBootBlockingPrerequisiteLabel(status.blockingPrerequisite)
        : undefined;

    return (
        <section className='border-warning/40 bg-warning/8 text-foreground mx-4 mt-4 rounded-xl border px-4 py-3'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='space-y-1'>
                    <p className='text-sm font-semibold'>{status.headline}</p>
                    <p className='text-muted-foreground text-sm'>{status.detail}</p>
                </div>
                <p className='text-muted-foreground text-xs uppercase tracking-[0.16em]'>
                    {status.isStuck ? 'Boot diagnostics' : 'Startup status'}
                </p>
            </div>
            <div className='text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs'>
                <span>Stage: {status.stage}</span>
                <span>Elapsed: {formatBootElapsedMs(status.elapsedMs)}</span>
                {blockingPrerequisiteLabel ? <span>Waiting on: {blockingPrerequisiteLabel}</span> : null}
            </div>
        </section>
    );
}
