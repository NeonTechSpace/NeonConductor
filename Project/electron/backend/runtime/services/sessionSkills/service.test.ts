import { beforeEach, describe, expect, it } from 'vitest';

import { getDefaultProfileId, resetPersistenceForTests } from '@/app/backend/persistence/db';
import { conversationStore, sessionStore, threadStore } from '@/app/backend/persistence/stores';
import { getAttachedSkills, setAttachedSkills } from '@/app/backend/runtime/services/sessionSkills/service';

describe('sessionSkills service', () => {
    beforeEach(() => {
        resetPersistenceForTests();
    });

    async function createSession(profileId: string) {
        const bucket = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'workspace',
            workspaceFingerprint: 'wsfp_test_session_skills',
            title: 'Session Skills Workspace',
        });
        if (bucket.isErr()) {
            throw new Error(bucket.error.message);
        }

        const thread = await threadStore.create({
            profileId,
            conversationId: bucket.value.id,
            title: 'Session Skills Thread',
            topLevelTab: 'agent',
        });
        if (thread.isErr()) {
            throw new Error(thread.error.message);
        }

        const session = await sessionStore.create(profileId, thread.value.id, 'local');
        if (!session.created) {
            throw new Error(`Expected session creation to succeed, received "${session.reason}".`);
        }

        return session.session.id;
    }

    it('returns a typed not_found error for a missing session', async () => {
        const profileId = getDefaultProfileId();
        const result = await getAttachedSkills({
            profileId,
            sessionId: 'sess_missing',
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected missing session lookup to fail.');
        }

        expect(result.error.code).toBe('not_found');
        expect(result.error.message).toContain('sess_missing');
    });

    it('returns a typed invalid_payload error for unresolved attached skills', async () => {
        const profileId = getDefaultProfileId();
        const sessionId = await createSession(profileId);

        const result = await setAttachedSkills({
            profileId,
            sessionId,
            assetKeys: ['skill.global.missing'],
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected unresolved skill attachment to fail.');
        }

        expect(result.error.code).toBe('invalid_payload');
        expect(result.error.details).toMatchObject({
            sessionId,
            missingAssetKeys: ['skill.global.missing'],
        });
    });
});
