import type { ResolvedWorkspaceContext, RunContractExecutionTargetSummary } from '@/shared/contracts';

export function buildRunContractExecutionTargetSummary(
    workspaceContext: ResolvedWorkspaceContext | undefined
): RunContractExecutionTargetSummary {
    if (!workspaceContext || workspaceContext.kind === 'detached') {
        return {
            kind: 'detached',
            label: 'Detached',
            materializationState: 'not_required',
        };
    }

    if (workspaceContext.kind === 'workspace_unresolved') {
        return {
            kind: workspaceContext.executionEnvironmentMode === 'new_sandbox' ? 'scheduled_sandbox' : 'workspace',
            label: workspaceContext.label,
            materializationState:
                workspaceContext.executionEnvironmentMode === 'new_sandbox' ? 'scheduled_on_start' : 'not_required',
            workspaceFingerprint: workspaceContext.workspaceFingerprint,
        };
    }

    if (workspaceContext.kind === 'workspace') {
        return {
            kind: workspaceContext.executionEnvironmentMode === 'new_sandbox' ? 'scheduled_sandbox' : 'workspace',
            label:
                workspaceContext.executionEnvironmentMode === 'new_sandbox'
                    ? `Managed sandbox from ${workspaceContext.label}`
                    : workspaceContext.label,
            materializationState:
                workspaceContext.executionEnvironmentMode === 'new_sandbox' ? 'scheduled_on_start' : 'not_required',
            workspaceFingerprint: workspaceContext.workspaceFingerprint,
            workspaceLabel: workspaceContext.label,
            workspacePath: workspaceContext.absolutePath,
            absolutePath: workspaceContext.absolutePath,
        };
    }

    return {
        kind: 'sandbox',
        label: workspaceContext.label,
        materializationState: 'materialized',
        workspaceFingerprint: workspaceContext.workspaceFingerprint,
        absolutePath: workspaceContext.absolutePath,
        workspaceLabel: workspaceContext.baseWorkspace.label,
        workspacePath: workspaceContext.baseWorkspace.absolutePath,
        sandboxId: workspaceContext.sandbox.id,
        sandboxStatus: workspaceContext.sandbox.status,
    };
}

export function formatRunContractExecutionTargetSummary(
    target: RunContractExecutionTargetSummary | undefined
): string {
    if (!target) {
        return 'Execution target unavailable';
    }

    switch (target.kind) {
        case 'detached':
            return 'Detached: no filesystem target';
        case 'workspace':
            return target.absolutePath ? `Local workspace: ${target.absolutePath}` : `Local workspace: ${target.label}`;
        case 'scheduled_sandbox':
            return target.workspacePath
                ? `Managed sandbox scheduled from ${target.workspacePath}`
                : `Managed sandbox scheduled from ${target.label}`;
        case 'sandbox':
            return target.absolutePath ? `Managed sandbox: ${target.absolutePath}` : `Managed sandbox: ${target.label}`;
    }
}
