import type { ToolRecord } from '@/app/backend/persistence/types';

export interface ToolOutputEntry {
    path: string;
    kind: 'file' | 'directory';
}

export interface ToolExecutionPolicy {
    effective: 'ask' | 'allow' | 'deny';
    source: string;
}

export interface ToolExecutionFailure {
    code: 'invalid_args' | 'not_implemented' | 'execution_failed';
    message: string;
}

export type ToolExecutionOutput = Record<string, unknown>;

export type ToolInvocationOutcome =
    | {
          kind: 'executed';
          toolId: string;
          output: ToolExecutionOutput;
          at: string;
          policy: ToolExecutionPolicy;
      }
    | {
          kind: 'approval_required';
          toolId: string;
          message: string;
          args: Record<string, unknown>;
          at: string;
          requestId: string;
          policy: ToolExecutionPolicy;
      }
    | {
          kind: 'denied';
          toolId: string;
          message: string;
          args: Record<string, unknown>;
          at: string;
          policy: ToolExecutionPolicy;
          reason:
              | 'policy_denied'
              | 'detached_scope'
              | 'workspace_unresolved'
              | 'outside_workspace'
              | 'ignored_path';
      }
    | {
          kind: 'failed';
          toolId: string;
          message: string;
          args: Record<string, unknown>;
          at: string;
          error:
              | 'tool_not_found'
              | 'invalid_args'
              | 'not_implemented'
              | 'execution_failed';
          policy?: ToolExecutionPolicy;
      };

export type ToolBlockedInvocationOutcome = Extract<
    ToolInvocationOutcome,
    { kind: 'approval_required' | 'denied' }
>;

export type ToolDispatchInvocationOutcome = Extract<
    ToolInvocationOutcome,
    { kind: 'executed' | 'failed' }
>;

export type ToolExecutionResult =
    | {
          ok: true;
          toolId: string;
          output: ToolExecutionOutput;
          at: string;
          policy: ToolExecutionPolicy;
      }
    | {
          ok: false;
          toolId: string;
          error:
              | 'tool_not_found'
              | 'policy_denied'
              | 'permission_required'
              | 'invalid_args'
              | 'not_implemented'
              | 'execution_failed';
          message: string;
          args: Record<string, unknown>;
          at: string;
          policy?: ToolExecutionPolicy;
          requestId?: string;
      };

export interface ResolvedToolDefinition {
    tool: ToolRecord;
    resource: string;
    source: 'native' | 'mcp';
    mcpServerId?: string;
    mcpToolName?: string;
}
