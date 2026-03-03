import { beforeEach, describe, expect, it } from 'vitest';

import { getDefaultProfileId, resetPersistenceForTests } from '@/app/backend/persistence/db';
import type { Context } from '@/app/backend/trpc/context';
import { appRouter } from '@/app/backend/trpc/router';

function createCaller() {
    const context: Context = {
        senderId: 1,
        win: null,
    };

    return appRouter.createCaller(context);
}

beforeEach(() => {
    resetPersistenceForTests();
});

describe('runtime contracts', () => {
    const profileId = getDefaultProfileId();

    it('exposes all new runtime domains in root router', async () => {
        const caller = createCaller();

        const snapshot = await caller.runtime.getSnapshot();
        const sessions = await caller.session.list();
        const providers = await caller.provider.listProviders({ profileId });
        const pendingPermissions = await caller.permission.listPending();
        const tools = await caller.tool.list();
        const mcpServers = await caller.mcp.listServers();

        expect(snapshot.lastSequence).toBeGreaterThanOrEqual(0);
        expect(sessions.sessions).toEqual([]);
        expect(snapshot.conversations).toEqual([]);
        expect(snapshot.threads).toEqual([]);
        expect(snapshot.tags).toEqual([]);
        expect(snapshot.threadTags).toEqual([]);
        expect(snapshot.diffs).toEqual([]);
        expect(providers.providers.length).toBeGreaterThan(0);
        expect(pendingPermissions.requests).toEqual([]);
        expect(tools.tools.length).toBeGreaterThan(0);
        expect(mcpServers.servers.length).toBeGreaterThan(0);
    });

    it('supports session lifecycle including completion, abort, and revert', async () => {
        const caller = createCaller();

        const created = await caller.session.create({
            scope: 'detached',
            kind: 'local',
        });
        const sessionId = created.session.id;

        const initialStatus = await caller.session.status({ sessionId });
        expect(initialStatus.found).toBe(true);
        if (!initialStatus.found) {
            throw new Error('Expected session to exist.');
        }
        expect(initialStatus.session.runStatus).toBe('idle');

        const firstPrompt = await caller.session.prompt({
            sessionId,
            prompt: 'First prompt',
        });
        expect(firstPrompt.accepted).toBe(true);

        const completedStatus = await caller.session.status({ sessionId });
        expect(completedStatus.found).toBe(true);
        if (!completedStatus.found) {
            throw new Error('Expected session to exist after prompt.');
        }
        expect(completedStatus.session.runStatus).toBe('completed');
        expect(completedStatus.session.turnCount).toBe(1);

        const secondPrompt = await caller.session.prompt({
            sessionId,
            prompt: 'Second prompt',
        });
        expect(secondPrompt.accepted).toBe(true);

        const aborted = await caller.session.abort({ sessionId });
        expect(aborted.aborted).toBe(true);

        const afterAbort = await caller.session.status({ sessionId });
        expect(afterAbort.found).toBe(true);
        if (!afterAbort.found) {
            throw new Error('Expected session to exist after abort.');
        }
        expect(afterAbort.session.runStatus).toBe('aborted');
        expect(afterAbort.session.turnCount).toBe(2);

        const reverted = await caller.session.revert({ sessionId });
        expect(reverted.reverted).toBe(true);
        if (!reverted.reverted) {
            throw new Error('Expected revert to succeed.');
        }
        expect(reverted.session.turnCount).toBe(1);
        expect(reverted.session.runStatus).toBe('completed');
    });

    it('handles permission request, grant, deny, and idempotency', async () => {
        const caller = createCaller();

        const requested = await caller.permission.request({
            policy: 'ask',
            resource: 'tool:run_command',
            rationale: 'Need shell command access',
        });
        const requestId = requested.request.id;

        const pending = await caller.permission.listPending();
        expect(pending.requests.some((item) => item.id === requestId)).toBe(true);

        const granted = await caller.permission.grant({ requestId });
        expect(granted.updated).toBe(true);

        const grantedAgain = await caller.permission.grant({ requestId });
        expect(grantedAgain.updated).toBe(false);
        expect(grantedAgain.reason).toBe('already_granted');

        const deniedAfterGrant = await caller.permission.deny({ requestId });
        expect(deniedAfterGrant.updated).toBe(true);

        const deniedAgain = await caller.permission.deny({ requestId });
        expect(deniedAgain.updated).toBe(false);
        expect(deniedAgain.reason).toBe('already_denied');
    });

    it('persists provider default in memory and lists models', async () => {
        const caller = createCaller();

        const providersBefore = await caller.provider.listProviders({ profileId });
        const models = await caller.provider.listModels({ providerId: 'openai' });
        expect(models.models.length).toBeGreaterThan(0);

        const changed = await caller.provider.setDefault({
            profileId,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(changed.success).toBe(true);

        const providersAfter = await caller.provider.listProviders({ profileId });
        const defaultProvider = providersAfter.providers.find((item) => item.isDefault);

        expect(defaultProvider?.id).toBe('openai');
        expect(providersBefore.providers.some((item) => item.id === 'kilo')).toBe(true);
    });

    it('fails closed for unimplemented tool and mcp mutations', async () => {
        const caller = createCaller();

        const tools = await caller.tool.list();
        expect(tools.tools.map((item) => item.id)).toContain('read_file');

        const toolInvocation = await caller.tool.invoke({
            toolId: 'read_file',
            args: {
                path: '/tmp/file.txt',
            },
        });
        expect(toolInvocation.ok).toBe(false);
        expect(toolInvocation.error).toBe('not_implemented');

        const mcpServers = await caller.mcp.listServers();
        expect(mcpServers.servers.map((item) => item.id)).toContain('github');

        const connected = await caller.mcp.connect({ serverId: 'github' });
        expect(connected.connected).toBe(false);
        expect(connected.reason).toBe('not_implemented');

        const authStatus = await caller.mcp.authStatus({ serverId: 'github' });
        expect(authStatus.found).toBe(true);
        if (!authStatus.found) {
            throw new Error('Expected MCP auth status result.');
        }
        expect(authStatus.connectionState).toBe('disconnected');

        const disconnected = await caller.mcp.disconnect({ serverId: 'github' });
        expect(disconnected.disconnected).toBe(false);
        expect(disconnected.reason).toBe('not_implemented');
    });

    it('supports workspace-scoped runtime reset dry-run and apply', async () => {
        const caller = createCaller();

        const created = await caller.session.create({
            scope: 'workspace',
            kind: 'local',
            workspaceFingerprint: 'wsf_runtime_contracts',
        });

        const dryRun = await caller.runtime.reset({
            target: 'workspace',
            workspaceFingerprint: 'wsf_runtime_contracts',
            dryRun: true,
        });
        expect(dryRun.applied).toBe(false);
        expect(dryRun.counts.sessions).toBe(1);

        const applied = await caller.runtime.reset({
            target: 'workspace',
            workspaceFingerprint: 'wsf_runtime_contracts',
            confirm: true,
        });
        expect(applied.applied).toBe(true);
        expect(applied.counts.sessions).toBe(1);

        const sessions = await caller.session.list();
        expect(sessions.sessions.some((item) => item.id === created.session.id)).toBe(false);

        const snapshot = await caller.runtime.getSnapshot();
        expect(snapshot.lastSequence).toBeGreaterThan(0);
    });
});
