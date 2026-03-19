import { describe, expect, it } from 'vitest';

import {
    getExecutionEnvironmentScopeKey,
    resolveExecutionEnvironmentDraftState,
} from '@/web/components/conversation/panels/executionEnvironmentPanelState';

describe('execution environment draft state', () => {
    it('keeps keyed drafts for the active scope and falls back to workspace defaults for a new scope', () => {
        const workspaceScope = {
            kind: 'workspace',
            label: 'Workspace',
            absolutePath: 'C:\\workspace',
            executionEnvironmentMode: 'new_sandbox',
        } as const;

        expect(
            resolveExecutionEnvironmentDraftState({
                workspaceScope: workspaceScope as never,
                draftState: {
                    scopeKey: getExecutionEnvironmentScopeKey(workspaceScope as never),
                    draftMode: 'sandbox',
                    selectedSandboxId: 'sb_1',
                },
            })
        ).toEqual({
            scopeKey: getExecutionEnvironmentScopeKey(workspaceScope as never),
            draftMode: 'sandbox',
            selectedSandboxId: 'sb_1',
        });

        expect(
            resolveExecutionEnvironmentDraftState({
                workspaceScope: {
                    ...workspaceScope,
                    absolutePath: 'C:\\workspace-2',
                } as never,
                draftState: {
                    scopeKey: getExecutionEnvironmentScopeKey(workspaceScope as never),
                    draftMode: 'sandbox',
                    selectedSandboxId: 'sb_1',
                },
            })
        ).toEqual({
            scopeKey: getExecutionEnvironmentScopeKey({
                ...workspaceScope,
                absolutePath: 'C:\\workspace-2',
            } as never),
            draftMode: 'new_sandbox',
            selectedSandboxId: '',
        });
    });
});
