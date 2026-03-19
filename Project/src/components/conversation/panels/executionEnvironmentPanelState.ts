export type EnvironmentDraft = 'local' | 'new_sandbox' | 'sandbox';

export type ExecutionEnvironmentScope =
    | {
          kind: 'detached';
      }
    | {
          kind: 'workspace';
          label: string;
          absolutePath: string;
          executionEnvironmentMode: 'local' | 'new_sandbox';
      }
    | {
          kind: 'sandbox';
          label: string;
          absolutePath: string;
          baseWorkspaceLabel: string;
          baseWorkspacePath: string;
          sandboxId: string;
      };

export interface ExecutionEnvironmentDraftState {
    scopeKey: string;
    draftMode: EnvironmentDraft;
    selectedSandboxId: string;
}

export function getExecutionEnvironmentScopeKey(input: ExecutionEnvironmentScope): string {
    if (input.kind === 'detached') {
        return 'detached';
    }

    if (input.kind === 'sandbox') {
        return `sandbox:${input.sandboxId}:${input.absolutePath}`;
    }

    return `workspace:${input.absolutePath}:${input.executionEnvironmentMode}`;
}

export function resolveExecutionEnvironmentDraftState(input: {
    workspaceScope: ExecutionEnvironmentScope;
    draftState: ExecutionEnvironmentDraftState | undefined;
}): ExecutionEnvironmentDraftState {
    const scopeKey = getExecutionEnvironmentScopeKey(input.workspaceScope);
    if (input.draftState?.scopeKey === scopeKey) {
        return input.draftState;
    }

    if (input.workspaceScope.kind === 'sandbox') {
        return {
            scopeKey,
            draftMode: 'sandbox',
            selectedSandboxId: input.workspaceScope.sandboxId,
        };
    }

    if (input.workspaceScope.kind === 'workspace') {
        return {
            scopeKey,
            draftMode: input.workspaceScope.executionEnvironmentMode,
            selectedSandboxId: '',
        };
    }

    return {
        scopeKey,
        draftMode: 'local',
        selectedSandboxId: '',
    };
}
