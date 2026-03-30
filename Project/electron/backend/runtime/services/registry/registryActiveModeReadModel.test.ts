import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDefaultProfileId, resetPersistenceForTests } from '@/app/backend/persistence/db';
import { settingsStore } from '@/app/backend/persistence/stores';
import { InvariantError } from '@/app/backend/runtime/services/common/fatalErrors';
import { readActiveAgentModeAfterRefresh } from '@/app/backend/runtime/services/registry/registryActiveModeReadModel';

describe('registryActiveModeReadModel', () => {
    beforeEach(() => {
        resetPersistenceForTests();
        vi.restoreAllMocks();
    });

    it('selects the persisted active agent mode when it is still available', async () => {
        const profileId = getDefaultProfileId();
        vi.spyOn(settingsStore, 'getStringOptional').mockResolvedValue('code');

        const result = await readActiveAgentModeAfterRefresh({
            profileId,
            agentModes: [
                {
                    id: 'mode_1',
                    profileId,
                    topLevelTab: 'agent',
                    modeKey: 'ask',
                    label: 'Ask',
                    assetKey: 'ask',
                    prompt: { customInstructions: 'Ask' },
                    executionPolicy: {},
                    source: 'global_file',
                    sourceKind: 'global_file',
                    scope: 'global',
                    originPath: '/global/ask.md',
                    enabled: true,
                    precedence: 1,
                    createdAt: '2026-01-01T00:00:00.000Z',
                    updatedAt: '2026-01-01T00:00:00.000Z',
                },
                {
                    id: 'mode_2',
                    profileId,
                    topLevelTab: 'agent',
                    modeKey: 'code',
                    label: 'Code',
                    assetKey: 'code',
                    prompt: { customInstructions: 'Code' },
                    executionPolicy: {},
                    source: 'global_file',
                    sourceKind: 'global_file',
                    scope: 'global',
                    originPath: '/global/code.md',
                    enabled: true,
                    precedence: 2,
                    createdAt: '2026-01-01T00:00:00.000Z',
                    updatedAt: '2026-01-01T00:00:00.000Z',
                },
            ],
        });

        expect(result.activeAgentMode.modeKey).toBe('code');
        expect(result.agentModes).toHaveLength(2);
    });

    it('fails closed when no enabled agent mode exists after refresh', async () => {
        const profileId = getDefaultProfileId();
        vi.spyOn(settingsStore, 'getStringOptional').mockResolvedValue(undefined);

        await expect(
            readActiveAgentModeAfterRefresh({
                profileId,
                agentModes: [],
            })
        ).rejects.toBeInstanceOf(InvariantError);
    });
});
