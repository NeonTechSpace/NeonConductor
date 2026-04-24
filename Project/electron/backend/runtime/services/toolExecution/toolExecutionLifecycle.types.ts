import type { ResolvedExecutionRoot } from '@/app/backend/runtime/contracts';
import type { ExecuteCodeApprovalContext } from '@/app/backend/runtime/services/toolExecution/executeCodeApproval';
import type { ShellApprovalContext } from '@/app/backend/runtime/services/toolExecution/shellApproval';
import type {
    ResolvedToolDefinition,
    ToolBlockedInvocationOutcome,
    ToolDispatchInvocationOutcome,
    ToolExecutionPolicy,
} from '@/app/backend/runtime/services/toolExecution/types';

export interface ToolResolvedWorkspacePath {
    absolutePath: string;
    workspaceRootPath: string;
}

export interface ToolResolvedExecutionPath {
    absolutePath: string;
    executionRootPath: string;
}

export interface ToolRequestContext {
    at: string;
    args: Record<string, unknown>;
    executionArgs: Record<string, unknown>;
    definition: ResolvedToolDefinition;
    shellApprovalContext: ShellApprovalContext | null;
    executeCodeApprovalContext?: ExecuteCodeApprovalContext | null;
    executionRoot?: ResolvedExecutionRoot;
    executionRootRequirement?: 'not_required' | 'resolved' | 'detached_scope' | 'unresolved';
    resolvedExecutionPath?: ToolResolvedExecutionPath;
    workspaceFingerprint?: string;
    workspaceLabel?: string;
    workspaceRootPath?: string;
    workspaceRequirement?: 'not_required' | 'resolved' | 'detached_scope' | 'workspace_unresolved';
    resolvedWorkspacePath?: ToolResolvedWorkspacePath;
}

export interface AllowedToolInvocation {
    kind: 'allow';
    resource: string;
    policy: ToolExecutionPolicy;
}

export type ToolBoundaryDecisionResult = ToolBlockedInvocationOutcome | null;

export type ToolApprovalDecisionResult = AllowedToolInvocation | ToolBlockedInvocationOutcome;

export type ToolDispatchExecutionResult = ToolDispatchInvocationOutcome;
