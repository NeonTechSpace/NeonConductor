import { describe, expect, it } from 'vitest';

import {
    interpretBranchWorkflowExecutionStatus,
    shouldUseBranchWorkflowChooser,
} from '@/web/components/conversation/hooks/useConversationShellBranchWorkflowFlow';

describe('shouldUseBranchWorkflowChooser', () => {
    it('only enables the chooser for workspace-bound agent and orchestrator threads', () => {
        expect(
            shouldUseBranchWorkflowChooser({
                topLevelTab: 'agent',
                selectedThread: {
                    id: 'thr_agent' as `thr_${string}`,
                    profileId: 'profile_default',
                    conversationId: 'conv_agent',
                    title: 'Agent thread',
                    topLevelTab: 'agent',
                    rootThreadId: 'thr_agent' as `thr_${string}`,
                    isFavorite: false,
                    executionEnvironmentMode: 'local',
                    scope: 'workspace',
                    workspaceFingerprint: 'ws_agent',
                    anchorKind: 'workspace',
                    anchorId: 'ws_agent',
                    sessionCount: 1,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            })
        ).toBe(true);

        expect(
            shouldUseBranchWorkflowChooser({
                topLevelTab: 'chat',
                selectedThread: {
                    id: 'thr_chat' as `thr_${string}`,
                    profileId: 'profile_default',
                    conversationId: 'conv_chat',
                    title: 'Chat thread',
                    topLevelTab: 'chat',
                    rootThreadId: 'thr_chat' as `thr_${string}`,
                    isFavorite: false,
                    executionEnvironmentMode: 'local',
                    scope: 'workspace',
                    workspaceFingerprint: 'ws_chat',
                    anchorKind: 'workspace',
                    anchorId: 'ws_chat',
                    sessionCount: 1,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            })
        ).toBe(false);

        expect(
            shouldUseBranchWorkflowChooser({
                topLevelTab: 'agent',
                selectedThread: {
                    id: 'thr_detached' as `thr_${string}`,
                    profileId: 'profile_default',
                    conversationId: 'conv_detached',
                    title: 'Detached thread',
                    topLevelTab: 'agent',
                    rootThreadId: 'thr_detached' as `thr_${string}`,
                    isFavorite: false,
                    executionEnvironmentMode: 'local',
                    scope: 'detached',
                    anchorKind: 'playground',
                    sessionCount: 1,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            })
        ).toBe(false);
    });

    it('turns branch workflow execution results into explicit branch feedback', () => {
        expect(interpretBranchWorkflowExecutionStatus({ status: 'not_requested' })).toEqual({
            message: undefined,
            shouldInvalidatePendingPermissions: false,
        });

        expect(interpretBranchWorkflowExecutionStatus({ status: 'succeeded' })).toEqual({
            message: undefined,
            shouldInvalidatePendingPermissions: false,
        });

        expect(
            interpretBranchWorkflowExecutionStatus({
                status: 'approval_required',
                requestId: 'perm_123',
                message: 'Approval required for npm publish.',
            })
        ).toEqual({
            message: 'Branch created. Approval required for npm publish.',
            shouldInvalidatePendingPermissions: true,
        });

        expect(
            interpretBranchWorkflowExecutionStatus({
                status: 'failed',
                message: 'pnpm install exited with 1',
            })
        ).toEqual({
            message: 'Branch created, but the branch workflow failed: pnpm install exited with 1',
            shouldInvalidatePendingPermissions: false,
        });
    });
});
