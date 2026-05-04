import { describe, expect, it } from 'vitest';

import { startDelegatedChildLaneRun } from '@/app/backend/runtime/services/common/delegatedChildLane';

type StartDelegatedChildLaneRunInput = Parameters<typeof startDelegatedChildLaneRun>[0];

describe('delegated child lane', () => {
    it('fails closed when a worker preset is routed to the wrong runtime target', async () => {
        const result = await startDelegatedChildLaneRun({
            profileId: 'prof_default',
            owner: {
                kind: 'plan_research',
                planResearchBatchId: 'prb_test',
            },
            rootContext: {
                bucket: {
                    id: 'conv_test',
                    profileId: 'prof_default',
                    scope: 'workspace',
                    title: 'Test',
                    workspaceFingerprint: 'wsf_test',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
                rootThread: {
                    id: 'thr_root',
                    profileId: 'prof_default',
                    conversationId: 'conv_test',
                    title: 'Root',
                    topLevelTab: 'agent',
                    activeModeKey: null,
                    executionEnvironmentMode: 'local',
                    sandboxId: null,
                    parentThreadId: null,
                    rootThreadId: null,
                    delegatedFromOrchestratorRunId: null,
                    delegatedFromPlanResearchBatchId: null,
                    delegatedFromFlowInstanceId: null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
                executionTarget: {
                    kind: 'workspace',
                    label: 'Workspace',
                    absolutePath: 'C:\\workspace',
                    executionEnvironmentMode: 'local',
                },
            } as unknown as StartDelegatedChildLaneRunInput['rootContext'],
            rootSessionId: 'sess_root',
            childTitle: 'Wrong target',
            prompt: 'Inspect',
            topLevelTab: 'agent',
            modeKey: 'ask',
            workerPresetId: 'code_explorer',
            runtimeOptions: {
                reasoning: {
                    effort: 'medium',
                    summary: 'auto',
                    includeEncrypted: false,
                },
                cache: {
                    strategy: 'auto',
                },
                transport: {
                    family: 'auto',
                },
            },
        });

        expect(result).toEqual({
            accepted: false,
            reason: 'Worker preset "code_explorer" requires agent/research.',
        });
    });
});
