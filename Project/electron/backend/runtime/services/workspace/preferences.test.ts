import { beforeEach, describe, expect, it } from 'vitest';

import { getDefaultProfileId, resetPersistenceForTests } from '@/app/backend/persistence/db';
import { workspaceRootStore } from '@/app/backend/persistence/stores';
import {
    getWorkspacePreference,
    setWorkspacePreference,
} from '@/app/backend/runtime/services/workspace/preferences';

describe('workspace preferences', () => {
    beforeEach(() => {
        resetPersistenceForTests();
    });

    it('merges override updates without dropping existing workspace defaults', async () => {
        const profileId = getDefaultProfileId();
        const workspaceRoot = await workspaceRootStore.resolveOrCreate(profileId, 'C:\\workspace-preferences');

        const firstUpdate = await setWorkspacePreference({
            profileId,
            workspaceFingerprint: workspaceRoot.fingerprint,
            defaultTopLevelTab: 'agent',
            defaultProviderId: 'openai',
            defaultModelId: 'openai/gpt-5',
        });
        expect(firstUpdate.isOk()).toBe(true);

        const secondUpdate = await setWorkspacePreference({
            profileId,
            workspaceFingerprint: workspaceRoot.fingerprint,
            preferredVcs: 'jj',
            preferredPackageManager: 'pnpm',
        });
        expect(secondUpdate.isOk()).toBe(true);

        const preference = await getWorkspacePreference(profileId, workspaceRoot.fingerprint);
        expect(preference).toMatchObject({
            workspaceFingerprint: workspaceRoot.fingerprint,
            defaultTopLevelTab: 'agent',
            defaultProviderId: 'openai',
            defaultModelId: 'openai/gpt-5',
            preferredVcs: 'jj',
            preferredPackageManager: 'pnpm',
        });
    });
});
