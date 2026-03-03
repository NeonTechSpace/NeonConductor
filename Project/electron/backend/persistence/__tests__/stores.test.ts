import { beforeEach, describe, expect, it } from 'vitest';

import { getDefaultProfileId, resetPersistenceForTests } from '@/app/backend/persistence/db';
import {
    accountSnapshotStore,
    conversationStore,
    diffStore,
    marketplaceStore,
    mcpStore,
    modeStore,
    permissionStore,
    providerStore,
    secretReferenceStore,
    sessionStore,
    skillfileStore,
    tagStore,
    toolStore,
} from '@/app/backend/persistence/stores';

describe('persistence stores', () => {
    beforeEach(() => {
        resetPersistenceForTests();
    });

    it('supports session store lifecycle CRUD-style flows', async () => {
        const session = await sessionStore.create('detached', 'local');
        expect(session.turnCount).toBe(0);

        const promptResult = await sessionStore.prompt(session.id, 'hello');
        expect(promptResult.accepted).toBe(true);

        const status = await sessionStore.status(session.id);
        expect(status.found).toBe(true);
        if (!status.found) {
            throw new Error('Expected session to exist.');
        }
        expect(status.session.runStatus).toBe('completed');

        const reverted = await sessionStore.revert(session.id);
        expect(reverted.reverted).toBe(true);
    });

    it('supports permission store decision transitions', async () => {
        const created = await permissionStore.create({
            policy: 'ask',
            resource: 'tool:run_command',
        });
        expect(created.decision).toBe('pending');

        const granted = await permissionStore.setDecision(created.id, 'granted');
        expect(granted?.decision).toBe('granted');

        const denied = await permissionStore.setDecision(created.id, 'denied');
        expect(denied?.decision).toBe('denied');
    });

    it('supports provider defaults and seeded catalogs', async () => {
        const profileId = getDefaultProfileId();
        const providers = await providerStore.listProviders();
        const models = await providerStore.listModels(profileId, 'openai');
        expect(providers.length).toBeGreaterThan(0);
        expect(models.length).toBeGreaterThan(0);

        await providerStore.setDefaults(profileId, 'openai', 'openai/gpt-5');
        const defaults = await providerStore.getDefaults(profileId);
        expect(defaults.providerId).toBe('openai');
    });

    it('supports mcp and tool seed stores', async () => {
        const tools = await toolStore.list();
        expect(tools.some((tool) => tool.id === 'read_file')).toBe(true);

        const servers = await mcpStore.listServers();
        expect(servers.some((server) => server.id === 'github')).toBe(true);

        const connected = await mcpStore.connect('github');
        expect(connected?.connectionState).toBe('connected');
    });

    it('seeds parity baseline stores', async () => {
        const profileId = getDefaultProfileId();

        const [modes, skillfiles, account, marketplacePackages, secretReferences] = await Promise.all([
            modeStore.listByProfile(profileId),
            skillfileStore.listByProfile(profileId),
            accountSnapshotStore.getByProfile(profileId),
            marketplaceStore.listPackages(),
            secretReferenceStore.listByProfile(profileId),
        ]);

        expect(modes.some((mode) => mode.topLevelTab === 'chat' && mode.modeKey === 'chat')).toBe(true);
        expect(modes.some((mode) => mode.topLevelTab === 'agent' && mode.modeKey === 'ask')).toBe(true);
        expect(skillfiles).toEqual([]);
        expect(account.authState).toBe('logged_out');
        expect(account.profileId).toBe(profileId);
        expect(marketplacePackages).toEqual([]);
        expect(secretReferences).toEqual([]);
    });

    it('supports conversations, threads, tags, and diffs', async () => {
        const conversation = await conversationStore.createConversation(
            'workspace',
            'Workspace Chat',
            'wsf_workspace_a'
        );
        const thread = await conversationStore.createThread(conversation.id, 'Thread A');
        const tag = await tagStore.create('backend');
        const linked = await tagStore.attachToThread(thread.id, tag.id);

        const session = await sessionStore.create('workspace', 'local', 'wsf_workspace_a');
        const prompt = await sessionStore.prompt(session.id, 'first');
        if (!prompt.accepted) {
            throw new Error('Expected prompt to be accepted.');
        }

        const diff = await diffStore.create({
            sessionId: session.id,
            runId: prompt.runId,
            summary: 'created patch',
            payload: { files: ['README.md'] },
        });

        const conversations = await conversationStore.listConversations();
        const threads = await conversationStore.listThreads(conversation.id);
        const tags = await tagStore.list();
        const threadTags = await tagStore.listThreadTags();
        const diffs = await diffStore.listBySession(session.id);

        expect(conversations.some((item) => item.id === conversation.id)).toBe(true);
        expect(threads.some((item) => item.id === thread.id)).toBe(true);
        expect(tags.some((item) => item.id === tag.id)).toBe(true);
        expect(threadTags.some((item) => item.threadId === linked.threadId && item.tagId === linked.tagId)).toBe(true);
        expect(diffs.some((item) => item.id === diff.id)).toBe(true);
    });
});
