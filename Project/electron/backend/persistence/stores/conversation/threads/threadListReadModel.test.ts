import { describe, expect, it } from 'vitest';

import {
    conversationStore,
    getDefaultProfileId,
    registerPersistenceStoreHooks,
    threadStore,
} from '@/app/backend/persistence/__tests__/stores.shared';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';

registerPersistenceStoreHooks();

describe('threadListReadModel', () => {
    it('includes delegated worker threads in orchestrator-scoped list mode', async () => {
        const profileId = getDefaultProfileId();
        const conversation = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'workspace',
            workspaceFingerprint: 'wsf_list_orchestrator',
            title: 'Workspace',
        });
        if (conversation.isErr()) {
            throw new Error(conversation.error.message);
        }

        const orchestrator = await threadStore.create({
            profileId,
            conversationId: conversation.value.id,
            title: 'Orchestrator',
            topLevelTab: 'orchestrator',
        });
        if (orchestrator.isErr()) {
            throw new Error(orchestrator.error.message);
        }

        const delegatedWorker = await threadStore.create({
            profileId,
            conversationId: conversation.value.id,
            title: 'Delegated worker',
            topLevelTab: 'agent',
            parentThreadId: orchestrator.value.id,
            delegatedFromOrchestratorRunId: createEntityId('orch'),
        });
        if (delegatedWorker.isErr()) {
            throw new Error(delegatedWorker.error.message);
        }

        const listed = await threadStore.list({
            profileId,
            activeTab: 'orchestrator',
            showAllModes: false,
            groupView: 'workspace',
            scope: 'workspace',
            workspaceFingerprint: 'wsf_list_orchestrator',
            sort: 'alphabetical',
        });

        expect(listed.map((thread) => thread.id)).toEqual([delegatedWorker.value.id, orchestrator.value.id]);
    });

    it('surfaces flow-owned delegated threads in list projections', async () => {
        const profileId = getDefaultProfileId();
        const conversation = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'workspace',
            workspaceFingerprint: 'wsf_list_flow_owner',
            title: 'Workspace',
        });
        if (conversation.isErr()) {
            throw new Error(conversation.error.message);
        }

        const flowInstanceId = 'flow_instance_list_projection';
        const flowOwnedThread = await threadStore.create({
            profileId,
            conversationId: conversation.value.id,
            title: 'Flow-owned thread',
            topLevelTab: 'orchestrator',
            delegatedFromFlowInstanceId: flowInstanceId,
        });
        if (flowOwnedThread.isErr()) {
            throw new Error(flowOwnedThread.error.message);
        }

        const listed = await threadStore.list({
            profileId,
            activeTab: 'orchestrator',
            showAllModes: false,
            groupView: 'workspace',
            scope: 'workspace',
            workspaceFingerprint: 'wsf_list_flow_owner',
            sort: 'alphabetical',
        });

        expect(listed.map((thread) => thread.id)).toContain(flowOwnedThread.value.id);
        expect(listed.find((thread) => thread.id === flowOwnedThread.value.id)?.delegatedFromFlowInstanceId).toBe(
            flowInstanceId
        );
    });

    it('flattens branch view in root-first order within a workspace anchor', async () => {
        const profileId = getDefaultProfileId();
        const conversation = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'workspace',
            workspaceFingerprint: 'wsf_list_branch',
            title: 'Workspace',
        });
        if (conversation.isErr()) {
            throw new Error(conversation.error.message);
        }

        const alphaRoot = await threadStore.create({
            profileId,
            conversationId: conversation.value.id,
            title: 'Alpha',
            topLevelTab: 'chat',
        });
        const bravoRoot = await threadStore.create({
            profileId,
            conversationId: conversation.value.id,
            title: 'Bravo',
            topLevelTab: 'chat',
        });
        if (alphaRoot.isErr()) {
            throw new Error(alphaRoot.error.message);
        }
        if (bravoRoot.isErr()) {
            throw new Error(bravoRoot.error.message);
        }

        const child = await threadStore.create({
            profileId,
            conversationId: conversation.value.id,
            title: 'Charlie',
            topLevelTab: 'chat',
            parentThreadId: bravoRoot.value.id,
            rootThreadId: bravoRoot.value.rootThreadId,
        });
        if (child.isErr()) {
            throw new Error(child.error.message);
        }

        const listed = await threadStore.list({
            profileId,
            activeTab: 'chat',
            showAllModes: true,
            groupView: 'branch',
            scope: 'workspace',
            workspaceFingerprint: 'wsf_list_branch',
            sort: 'alphabetical',
        });

        expect(listed.map((thread) => thread.title)).toEqual(['Alpha', 'Bravo', 'Charlie']);
    });
});
