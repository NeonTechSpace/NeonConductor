import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    permissionPolicyOverrideStore: {
        get: vi.fn(),
        toWorkspaceScopeKey: vi.fn(),
        toProfileScopeKey: vi.fn(),
    },
    resolveModesForTab: vi.fn(),
}));

vi.mock('@/app/backend/persistence/stores', () => ({
    permissionPolicyOverrideStore: mocks.permissionPolicyOverrideStore,
}));

vi.mock('@/app/backend/runtime/services/registry/service', () => ({
    resolveModesForTab: mocks.resolveModesForTab,
}));

import { resolveEffectivePermissionPolicy } from '@/app/backend/runtime/services/permissions/policyResolver';

function buildMode(modeKey: string, behaviorFlags?: string[]) {
    return {
        id: `mode_${modeKey}`,
        profileId: 'profile_default',
        topLevelTab: 'agent',
        modeKey,
        label: modeKey,
        assetKey: `agent.${modeKey}`,
        prompt: {},
        executionPolicy: {
            toolCapabilities: ['filesystem_read', 'shell'],
            ...(behaviorFlags ? { behaviorFlags } : {}),
        },
        source: 'test',
        sourceKind: 'system_seed',
        scope: 'system',
        enabled: true,
        precedence: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    };
}

describe('resolveEffectivePermissionPolicy', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.permissionPolicyOverrideStore.get.mockResolvedValue(null);
        mocks.resolveModesForTab.mockResolvedValue([buildMode('custom_reader', ['read_only_execution'])]);
    });

    it('allows read-only tool access and denies mutating access for read-only execution modes', async () => {
        const readOnlyResult = await resolveEffectivePermissionPolicy({
            profileId: 'profile_default',
            resource: 'tool:read_file',
            topLevelTab: 'agent',
            modeKey: 'custom_reader',
            executionPreset: 'standard',
            capabilities: ['filesystem_read'],
            mutability: 'read_only',
            toolDefaultPolicy: 'ask',
        });
        expect(readOnlyResult.policy).toBe('allow');

        const mutatingResult = await resolveEffectivePermissionPolicy({
            profileId: 'profile_default',
            resource: 'tool:run_command',
            topLevelTab: 'agent',
            modeKey: 'custom_reader',
            executionPreset: 'standard',
            capabilities: ['shell'],
            mutability: 'mutating',
            toolDefaultPolicy: 'ask',
        });
        expect(mutatingResult.policy).toBe('deny');
    });
});
