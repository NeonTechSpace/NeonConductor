import { describe, expect, it } from 'vitest';

import {
    conversationStore,
    getDefaultProfileId,
    registerPersistenceStoreHooks,
    sessionStore,
    threadStore,
} from '@/app/backend/persistence/__tests__/stores.shared';
import { orchestratorStore, planStore } from '@/app/backend/persistence/stores';
import { createThreadRecord } from '@/app/backend/persistence/stores/conversation/threads/threadCreationLifecycle';

registerPersistenceStoreHooks();

describe('threadCreationLifecycle', () => {
    it('keeps detached conversations chat-only', async () => {
        const profileId = getDefaultProfileId();
        const conversation = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'detached',
            title: 'Playground',
        });
        if (conversation.isErr()) {
            throw new Error(conversation.error.message);
        }

        const created = await createThreadRecord({
            profileId,
            conversationId: conversation.value.id,
            title: 'Agent lane',
            topLevelTab: 'agent',
        });

        expect(created.isErr()).toBe(true);
        if (created.isOk()) {
            throw new Error('Expected detached agent thread creation to fail.');
        }
        expect(created.error.code).toBe('unsupported_tab');
    });

    it('fails closed when parent thread mode affinity does not match', async () => {
        const profileId = getDefaultProfileId();
        const conversation = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'workspace',
            workspaceFingerprint: 'wsf_creation_parent_mismatch',
            title: 'Workspace',
        });
        if (conversation.isErr()) {
            throw new Error(conversation.error.message);
        }

        const parent = await threadStore.create({
            profileId,
            conversationId: conversation.value.id,
            title: 'Chat root',
            topLevelTab: 'chat',
        });
        if (parent.isErr()) {
            throw new Error(parent.error.message);
        }

        const created = await createThreadRecord({
            profileId,
            conversationId: conversation.value.id,
            title: 'Agent child',
            topLevelTab: 'agent',
            parentThreadId: parent.value.id,
        });

        expect(created.isErr()).toBe(true);
        if (created.isOk()) {
            throw new Error('Expected mismatched child thread creation to fail.');
        }
        expect(created.error.code).toBe('thread_mode_mismatch');
    });

    it('allows delegated worker children from orchestrator parents and inherits execution environment', async () => {
        const profileId = getDefaultProfileId();
        const conversation = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'workspace',
            workspaceFingerprint: 'wsf_creation_delegate',
            title: 'Workspace',
        });
        if (conversation.isErr()) {
            throw new Error(conversation.error.message);
        }

        const parent = await threadStore.create({
            profileId,
            conversationId: conversation.value.id,
            title: 'Orchestrator root',
            topLevelTab: 'orchestrator',
            executionEnvironmentMode: 'new_sandbox',
        });
        if (parent.isErr()) {
            throw new Error(parent.error.message);
        }

        const parentSession = await sessionStore.create(profileId, parent.value.id, 'local');
        if (!parentSession.created) {
            throw new Error(`Expected orchestrator parent session creation to succeed, received "${parentSession.reason}".`);
        }
        const plan = await planStore.create({
            profileId,
            sessionId: parentSession.session.id,
            topLevelTab: 'orchestrator',
            modeKey: 'orchestrate',
            sourcePrompt: 'Delegate work',
            summaryMarkdown: 'Delegate work',
            questions: [],
            workspaceFingerprint: 'wsf_creation_delegate',
        });
        const orchestratorRun = await orchestratorStore.createRun({
            profileId,
            sessionId: parentSession.session.id,
            planId: plan.id,
            planRevisionId: plan.currentRevisionId,
            executionStrategy: 'delegate',
            stepDescriptions: ['Delegate'],
        });

        const created = await createThreadRecord({
            profileId,
            conversationId: conversation.value.id,
            title: 'Delegated worker',
            topLevelTab: 'agent',
            parentThreadId: parent.value.id,
            delegatedFromOrchestratorRunId: orchestratorRun.run.id,
        });

        expect(created.isOk()).toBe(true);
        if (created.isErr()) {
            throw new Error(created.error.message);
        }
        expect(created.value.parentThreadId).toBe(parent.value.id);
        expect(created.value.rootThreadId).toBe(parent.value.rootThreadId);
        expect(created.value.delegatedFromOrchestratorRunId).toBe(orchestratorRun.run.id);
        expect(created.value.executionEnvironmentMode).toBe('new_sandbox');
        expect(created.value.sandboxId).toBeUndefined();
        expect(orchestratorRun.run.planRevisionId).toBe(plan.currentRevisionId);
    });

    it('allows delegated flow-instance children to use a flow-owned mode lane', async () => {
        const profileId = getDefaultProfileId();
        const conversation = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'workspace',
            workspaceFingerprint: 'wsf_creation_flow_owner',
            title: 'Workspace',
        });
        if (conversation.isErr()) {
            throw new Error(conversation.error.message);
        }

        const parent = await threadStore.create({
            profileId,
            conversationId: conversation.value.id,
            title: 'Planning root',
            topLevelTab: 'agent',
        });
        if (parent.isErr()) {
            throw new Error(parent.error.message);
        }

        const flowInstanceId = 'flow_instance_creation_flow_owner';
        const created = await createThreadRecord({
            profileId,
            conversationId: conversation.value.id,
            title: 'Flow-owned mode run',
            topLevelTab: 'orchestrator',
            parentThreadId: parent.value.id,
            delegatedFromFlowInstanceId: flowInstanceId,
        });

        expect(created.isOk()).toBe(true);
        if (created.isErr()) {
            throw new Error(created.error.message);
        }
        expect(created.value.parentThreadId).toBe(parent.value.id);
        expect(created.value.rootThreadId).toBe(parent.value.rootThreadId);
        expect(created.value.delegatedFromFlowInstanceId).toBe(flowInstanceId);
        expect(created.value.executionEnvironmentMode).toBe('new_sandbox');
        expect(created.value.sandboxId).toBeUndefined();
    });

    it('defaults non-chat workspace threads to new_sandbox when no environment is provided', async () => {
        const profileId = getDefaultProfileId();
        const conversation = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'workspace',
            workspaceFingerprint: 'wsf_creation_default_env',
            title: 'Workspace',
        });
        if (conversation.isErr()) {
            throw new Error(conversation.error.message);
        }

        const created = await createThreadRecord({
            profileId,
            conversationId: conversation.value.id,
            title: 'Agent root',
            topLevelTab: 'agent',
        });

        expect(created.isOk()).toBe(true);
        if (created.isErr()) {
            throw new Error(created.error.message);
        }
        expect(created.value.executionEnvironmentMode).toBe('new_sandbox');
        expect(created.value.sandboxId).toBeUndefined();
    });
});
