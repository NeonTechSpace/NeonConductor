import type {
    RunContextStripItem,
    RunContextStripModel,
} from '@/web/components/conversation/sessions/workspaceShellModel';
import type { WorkspaceScope } from '@/web/components/conversation/sessions/workspace/workspacePanelModel';

import type { RunRecord, SessionSummaryRecord } from '@/app/backend/persistence/types';

import type { EntityId, TopLevelTab } from '@/shared/contracts';

export interface SelectedThreadContext {
    threadId: EntityId<'thr'>;
    rootThreadId: string;
    topLevelTab: TopLevelTab;
    title: string;
    parentThreadId?: string;
}

export interface BuildRunContextStripInput {
    workspaceScope: WorkspaceScope;
    executionPreset: 'privacy' | 'standard' | 'yolo';
    pendingPermissionCount: number;
    selectedSession: SessionSummaryRecord | undefined;
    selectedRun: RunRecord | undefined;
    selectedThreadContext?: SelectedThreadContext;
}

function formatStatus(value: string): string {
    return value.replaceAll('_', ' ');
}

function formatPreset(value: BuildRunContextStripInput['executionPreset']): string {
    if (value === 'yolo') {
        return 'YOLO';
    }

    return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function pluralize(count: number, singular: string, plural: string): string {
    return count === 1 ? singular : plural;
}

function buildWorkspaceItem(workspaceScope: WorkspaceScope): RunContextStripItem {
    if (workspaceScope.kind === 'detached') {
        return {
            id: 'workspace',
            label: 'Workspace',
            value: 'Detached',
            detail: 'No workspace root selected',
            tone: 'muted',
            inspectorSectionId: 'workspace-status',
            ariaLabel: 'Workspace: detached. No workspace root selected.',
        };
    }

    if (workspaceScope.kind === 'workspace_unresolved') {
        return {
            id: 'workspace',
            label: 'Workspace',
            value: 'Unresolved workspace',
            detail: workspaceScope.label,
            tone: 'attention',
            inspectorSectionId: 'execution-environment',
            ariaLabel: `Workspace: unresolved workspace. ${workspaceScope.label}.`,
        };
    }

    if (workspaceScope.kind === 'sandbox') {
        return {
            id: 'workspace',
            label: 'Workspace',
            value: workspaceScope.baseWorkspaceLabel,
            detail: `Sandbox ${workspaceScope.label}`,
            tone: 'default',
            inspectorSectionId: 'execution-environment',
            ariaLabel: `Workspace: ${workspaceScope.baseWorkspaceLabel}. Sandbox ${workspaceScope.label}.`,
        };
    }

    return {
        id: 'workspace',
        label: 'Workspace',
        value: workspaceScope.label,
        detail: workspaceScope.absolutePath,
        tone: 'default',
        inspectorSectionId: 'execution-environment',
        ariaLabel: `Workspace: ${workspaceScope.label}. ${workspaceScope.absolutePath}.`,
    };
}

function buildExecutionRootItem(workspaceScope: WorkspaceScope): RunContextStripItem {
    if (workspaceScope.kind === 'detached') {
        return {
            id: 'execution-root',
            label: 'Execution root',
            value: 'No filesystem root',
            detail: 'Runs stay detached',
            tone: 'muted',
            inspectorSectionId: 'workspace-status',
            ariaLabel: 'Execution root: no filesystem root. Runs stay detached.',
        };
    }

    if (workspaceScope.kind === 'workspace_unresolved') {
        return {
            id: 'execution-root',
            label: 'Execution root',
            value: 'Root unavailable',
            detail: 'Workspace root must be restored',
            tone: 'attention',
            inspectorSectionId: 'execution-environment',
            ariaLabel: 'Execution root: unavailable. Workspace root must be restored.',
        };
    }

    if (workspaceScope.kind === 'sandbox') {
        return {
            id: 'execution-root',
            label: 'Execution root',
            value: 'Managed sandbox',
            detail: workspaceScope.absolutePath,
            tone: 'success',
            inspectorSectionId: 'execution-environment',
            ariaLabel: `Execution root: managed sandbox. ${workspaceScope.absolutePath}.`,
        };
    }

    if (workspaceScope.executionEnvironmentMode === 'new_sandbox') {
        return {
            id: 'execution-root',
            label: 'Execution root',
            value: 'Scheduled sandbox',
            detail: `From ${workspaceScope.absolutePath}`,
            tone: 'default',
            inspectorSectionId: 'execution-environment',
            ariaLabel: `Execution root: scheduled sandbox from ${workspaceScope.absolutePath}.`,
        };
    }

    return {
        id: 'execution-root',
        label: 'Execution root',
        value: 'Local workspace',
        detail: workspaceScope.absolutePath,
        tone: 'default',
        inspectorSectionId: 'execution-environment',
        ariaLabel: `Execution root: local workspace. ${workspaceScope.absolutePath}.`,
    };
}

function buildAuthorityItem(input: BuildRunContextStripInput): RunContextStripItem {
    const preset = formatPreset(input.executionPreset);
    if (input.pendingPermissionCount > 0) {
        const approvalLabel = pluralize(input.pendingPermissionCount, 'approval', 'approvals');
        return {
            id: 'authority',
            label: 'Authority',
            value: `${String(input.pendingPermissionCount)} ${approvalLabel} waiting`,
            detail: `${preset} preset; review required`,
            tone: 'attention',
            inspectorSectionId: 'pending-permissions',
            ariaLabel: `Authority: ${String(input.pendingPermissionCount)} ${approvalLabel} waiting. ${preset} preset; review required.`,
        };
    }

    const posture =
        input.workspaceScope.kind === 'detached'
            ? 'detached, no filesystem authority'
            : input.workspaceScope.kind === 'workspace_unresolved'
              ? 'fails closed until workspace root resolves'
              : input.workspaceScope.kind === 'sandbox'
                ? 'managed sandbox authority'
                : input.workspaceScope.executionEnvironmentMode === 'new_sandbox'
                  ? 'sandbox scheduled on run start'
                  : 'local workspace authority';

    return {
        id: 'authority',
        label: 'Authority',
        value: `${preset} preset`,
        detail: posture,
        tone: input.workspaceScope.kind === 'workspace_unresolved' ? 'attention' : 'default',
        inspectorSectionId: 'workspace-status',
        ariaLabel: `Authority: ${preset} preset. ${posture}.`,
    };
}

function buildBranchWorktreeItem(input: BuildRunContextStripInput): RunContextStripItem {
    const threadKind = input.selectedThreadContext?.parentThreadId ? 'Branched thread' : 'Root thread';
    const value = input.selectedThreadContext ? threadKind : 'No selected thread';
    const worktree =
        input.workspaceScope.kind === 'detached'
            ? 'no workspace worktree'
            : input.workspaceScope.kind === 'workspace_unresolved'
              ? `${input.workspaceScope.executionEnvironmentMode.replaceAll('_', ' ')} worktree unresolved`
              : input.workspaceScope.kind === 'sandbox'
                ? 'managed sandbox worktree'
                : input.workspaceScope.executionEnvironmentMode === 'new_sandbox'
                  ? 'new sandbox worktree scheduled'
                  : 'local workspace worktree';

    return {
        id: 'branch-worktree',
        label: 'Branch / worktree',
        value,
        detail: worktree,
        tone: input.workspaceScope.kind === 'workspace_unresolved' ? 'attention' : 'muted',
        inspectorSectionId: 'execution-environment',
        ariaLabel: `Branch and worktree: ${value}. ${worktree}. Live Git and Jujutsu status is not inspected in this view.`,
    };
}

function buildRunItem(input: BuildRunContextStripInput): RunContextStripItem {
    if (input.selectedRun) {
        const status = formatStatus(input.selectedRun.status);
        return {
            id: 'run',
            label: 'Run',
            value: status,
            detail: `Selected run ${input.selectedRun.id}`,
            tone:
                input.selectedRun.status === 'running'
                    ? 'success'
                    : input.selectedRun.status === 'error'
                      ? 'attention'
                      : 'default',
            inspectorSectionId: 'workspace-status',
            ariaLabel: `Run: ${status}. Selected run ${input.selectedRun.id}.`,
        };
    }

    if (input.selectedSession) {
        const status = formatStatus(input.selectedSession.runStatus);
        return {
            id: 'run',
            label: 'Run',
            value: status,
            detail: `Session has ${String(input.selectedSession.turnCount)} turns`,
            tone: input.selectedSession.runStatus === 'running' ? 'success' : 'default',
            inspectorSectionId: 'workspace-status',
            ariaLabel: `Run: ${status}. Session has ${String(input.selectedSession.turnCount)} turns.`,
        };
    }

    return {
        id: 'run',
        label: 'Run',
        value: 'No active run',
        detail: 'Choose or create a thread',
        tone: 'muted',
        inspectorSectionId: 'workspace-status',
        ariaLabel: 'Run: no active run. Choose or create a thread.',
    };
}

export function buildRunContextStrip(input: BuildRunContextStripInput): RunContextStripModel {
    return {
        items: [
            buildWorkspaceItem(input.workspaceScope),
            buildExecutionRootItem(input.workspaceScope),
            buildAuthorityItem(input),
            buildBranchWorktreeItem(input),
            buildRunItem(input),
        ],
    };
}
