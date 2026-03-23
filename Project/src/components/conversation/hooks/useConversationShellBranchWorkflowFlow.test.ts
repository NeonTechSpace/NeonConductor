import { describe, expect, it } from 'vitest';

import { shouldUseWorkflowBranchChooser } from '@/web/components/conversation/hooks/useConversationShellBranchWorkflowFlow';

describe('shouldUseWorkflowBranchChooser', () => {
    it('only enables the chooser for workspace-bound agent and orchestrator threads', () => {
        expect(
            shouldUseWorkflowBranchChooser({
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
            shouldUseWorkflowBranchChooser({
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
            shouldUseWorkflowBranchChooser({
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
});
