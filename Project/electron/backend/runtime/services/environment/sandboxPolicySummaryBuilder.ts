import type {
    SandboxDiagnostic,
    SandboxFilesystemPolicyKind,
    SandboxFilesystemPolicySummary,
    SandboxNetworkPolicySummary,
    SandboxPolicySummary,
    WorkspaceEnvironmentSnapshot,
} from '@/app/backend/runtime/contracts/types/runtime';
import type { ResolvedWorkspaceContext } from '@/app/backend/runtime/contracts/types/sandbox';

function buildFilesystemPolicy(input: {
    workspaceRootPath?: string;
    baseWorkspaceRootPath?: string;
    workspaceContext?: ResolvedWorkspaceContext;
}): SandboxFilesystemPolicySummary {
    if (input.workspaceContext?.kind === 'sandbox') {
        return {
            kind: 'managed_sandbox',
            effectiveRootLabel: input.workspaceContext.label,
            effectiveRootPath: input.workspaceContext.absolutePath,
            writable: true,
            baseWorkspacePath: input.workspaceContext.baseWorkspace.absolutePath,
            managedByNeon: true,
            failClosedOnMissingTarget: true,
        };
    }

    if (
        input.workspaceContext?.kind === 'workspace' &&
        input.workspaceContext.executionEnvironmentMode === 'new_sandbox'
    ) {
        return {
            kind: 'scheduled_managed_sandbox',
            effectiveRootLabel: input.workspaceContext.label,
            effectiveRootPath: input.workspaceContext.absolutePath,
            writable: true,
            managedByNeon: true,
            failClosedOnMissingTarget: true,
        };
    }

    if (input.workspaceContext?.kind === 'workspace' || input.workspaceRootPath) {
        const effectiveRootPath =
            input.workspaceContext?.kind === 'workspace'
                ? input.workspaceContext.absolutePath
                : input.workspaceRootPath;
        return {
            kind: 'local_workspace',
            effectiveRootLabel:
                input.workspaceContext?.kind === 'workspace' ? input.workspaceContext.label : 'Workspace',
            ...(effectiveRootPath ? { effectiveRootPath } : {}),
            writable: true,
            managedByNeon: false,
            failClosedOnMissingTarget: false,
        };
    }

    return {
        kind: 'detached',
        effectiveRootLabel: 'Detached',
        writable: false,
        managedByNeon: false,
        failClosedOnMissingTarget: true,
    };
}

function buildNetworkPolicy(): SandboxNetworkPolicySummary {
    return {
        kind: 'not_restricted',
        restricted: false,
        reviewRequired: false,
        blockedNetworkVisible: false,
        reason: 'Neon does not apply native network restriction in the current managed sandbox implementation.',
    };
}

function buildDiagnostics(input: {
    platform: WorkspaceEnvironmentSnapshot['platform'];
    filesystem: SandboxFilesystemPolicySummary;
    network: SandboxNetworkPolicySummary;
}): SandboxDiagnostic[] {
    const diagnostics: SandboxDiagnostic[] = [];

    diagnostics.push({
        code: 'native_process_sandbox_unavailable',
        severity:
            input.filesystem.kind === 'managed_sandbox' || input.filesystem.kind === 'scheduled_managed_sandbox'
                ? 'warning'
                : 'info',
        message:
            'Native OS process sandbox enforcement is not implemented in this alpha slice; Neon relies on explicit execution roots and approval policy.',
        failClosed: false,
    });

    if (input.platform === 'win32') {
        diagnostics.push({
            code: 'windows_managed_directory_only',
            severity: 'info',
            message:
                'Windows runs currently use ordinary managed workspace or sandbox directories, not restricted-token or WFP native enforcement.',
            failClosed: false,
        });
        diagnostics.push({
            code: 'wsl_not_detected',
            severity: 'info',
            message:
                'WSL/native Linux sandbox helper detection is not part of this slice; use the displayed Windows execution root as authority.',
            failClosed: false,
        });
    }

    if (input.filesystem.kind === 'scheduled_managed_sandbox') {
        diagnostics.push({
            code: 'managed_sandbox_scheduled',
            severity: 'info',
            message: 'A managed sandbox is scheduled and must materialize successfully at run start.',
            failClosed: true,
        });
    }

    if (input.network.kind === 'not_restricted') {
        diagnostics.push({
            code: 'network_not_restricted',
            severity: 'info',
            message: input.network.reason,
            failClosed: false,
        });
    }

    return diagnostics;
}

export function buildSandboxPolicySummary(input: {
    platform: WorkspaceEnvironmentSnapshot['platform'];
    workspaceRootPath?: string;
    baseWorkspaceRootPath?: string;
    workspaceContext?: ResolvedWorkspaceContext;
    filesystemKind?: SandboxFilesystemPolicyKind;
}): SandboxPolicySummary {
    const filesystemBase = buildFilesystemPolicy({
        ...(input.workspaceRootPath ? { workspaceRootPath: input.workspaceRootPath } : {}),
        ...(input.baseWorkspaceRootPath ? { baseWorkspaceRootPath: input.baseWorkspaceRootPath } : {}),
        ...(input.workspaceContext ? { workspaceContext: input.workspaceContext } : {}),
    });
    const filesystem: SandboxFilesystemPolicySummary = input.filesystemKind
        ? { ...filesystemBase, kind: input.filesystemKind }
        : filesystemBase;
    const network = buildNetworkPolicy();

    return {
        filesystem,
        network,
        process: {
            state: 'unsupported',
            platform: input.platform,
            mechanism: 'managed_directory',
            nativeEnforcement: false,
            reason: 'Native process sandbox helpers are future work; current authority comes from execution-root resolution, managed directories, and approval policy.',
        },
        diagnostics: buildDiagnostics({
            platform: input.platform,
            filesystem,
            network,
        }),
    };
}
