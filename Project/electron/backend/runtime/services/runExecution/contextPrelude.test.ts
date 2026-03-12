import { beforeEach, describe, expect, it } from 'vitest';

import { getDefaultProfileId, resetPersistenceForTests } from '@/app/backend/persistence/db';
import { conversationStore, sessionStore, threadStore, workspaceRootStore } from '@/app/backend/persistence/stores';
import { buildSessionSystemPrelude } from '@/app/backend/runtime/services/runExecution/contextPrelude';

describe('buildSessionSystemPrelude', () => {
    beforeEach(() => {
        resetPersistenceForTests();
    });

    it('includes the concrete workspace path for agent sessions', async () => {
        const profileId = getDefaultProfileId();
        const workspaceRoot = await workspaceRootStore.resolveOrCreate(profileId, 'M:\\Libraries\\Downloads\\test');
        const bucket = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'workspace',
            workspaceFingerprint: workspaceRoot.fingerprint,
            title: 'Workspace Prelude',
        });
        if (bucket.isErr()) {
            throw new Error(bucket.error.message);
        }

        const thread = await threadStore.create({
            profileId,
            conversationId: bucket.value.id,
            title: 'Agent Thread',
            topLevelTab: 'agent',
        });
        if (thread.isErr()) {
            throw new Error(thread.error.message);
        }

        const session = await sessionStore.create(profileId, thread.value.id, 'local');
        if (!session.created) {
            throw new Error(`Expected session creation to succeed, received "${session.reason}".`);
        }

        const result = await buildSessionSystemPrelude({
            profileId,
            sessionId: session.session.id,
            topLevelTab: 'agent',
            workspaceFingerprint: workspaceRoot.fingerprint,
            resolvedMode: {
                mode: {
                    id: 'mode_profile_local_default_agent_code',
                    profileId,
                    topLevelTab: 'agent',
                    modeKey: 'code',
                    label: 'Agent Code',
                    prompt: {},
                    executionPolicy: {},
                    source: 'system',
                    enabled: true,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                    assetKey: 'code',
                    sourceKind: 'system_seed',
                    scope: 'system',
                    tags: [],
                    precedence: 0,
                },
            },
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }

        expect(result.value[0]?.role).toBe('system');
        const firstTextPart = result.value[0]?.parts[0];
        expect(firstTextPart?.type).toBe('text');
        if (!firstTextPart || firstTextPart.type !== 'text') {
            throw new Error('Expected workspace prelude text part.');
        }

        expect(firstTextPart.text).toContain('M:\\Libraries\\Downloads\\test');
        expect(firstTextPart.text).toContain('"/workspace"');
    });
});
