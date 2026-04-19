import { beforeEach, describe, expect, it, vi } from 'vitest';

import { kiloFrontierModelId } from '@/shared/kiloModels';
import type { ModeDefinition } from '@/shared/contracts';

const providerStoreMock = vi.hoisted(() => ({
    getDefaults: vi.fn(),
    getSpecialistDefaults: vi.fn(),
    modelExists: vi.fn(),
}));

vi.mock('@/app/backend/persistence/stores', () => ({
    providerStore: providerStoreMock,
}));

import {
    resolveRequestedOrDefaultRunTarget,
    verifyResolvedRunTargetAvailability,
} from '@/app/backend/runtime/services/runExecution/resolveRunTarget';
import { createDefaultPreparedContextModeOverrides } from '@/app/backend/runtime/contracts';

function createMode(input: {
    topLevelTab: ModeDefinition['topLevelTab'];
    modeKey: string;
    runtimeProfile?: ModeDefinition['executionPolicy']['runtimeProfile'];
}): ModeDefinition {
    return {
        id: `mode_${input.topLevelTab}_${input.modeKey}`,
        profileId: 'profile_default',
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
        authoringRole:
            input.topLevelTab === 'chat'
                ? 'chat'
                : input.topLevelTab === 'orchestrator'
                  ? 'orchestrator_primary'
                  : 'single_task_agent',
        roleTemplate:
            input.topLevelTab === 'chat'
                ? 'chat/default'
                : input.topLevelTab === 'orchestrator'
                  ? input.modeKey === 'orchestrate'
                      ? 'orchestrator_primary/orchestrate'
                      : 'orchestrator_primary/debug'
                  : input.modeKey === 'ask'
                    ? 'single_task_agent/ask'
                    : input.modeKey === 'plan'
                      ? 'single_task_agent/plan'
                      : 'single_task_agent/apply',
        internalModelRole:
            input.runtimeProfile === 'planner' ? 'planner' : input.topLevelTab === 'chat' ? 'chat' : 'apply',
        delegatedOnly: false,
        sessionSelectable: true,
        label: input.modeKey,
        assetKey: `${input.topLevelTab}.${input.modeKey}`,
        prompt: {},
        promptLayerOverrides: createDefaultPreparedContextModeOverrides(),
        executionPolicy: {
            authoringRole:
                input.topLevelTab === 'chat'
                    ? 'chat'
                    : input.topLevelTab === 'orchestrator'
                      ? 'orchestrator_primary'
                      : 'single_task_agent',
            roleTemplate:
                input.topLevelTab === 'chat'
                    ? 'chat/default'
                    : input.topLevelTab === 'orchestrator'
                      ? input.modeKey === 'orchestrate'
                          ? 'orchestrator_primary/orchestrate'
                          : 'orchestrator_primary/debug'
                      : input.modeKey === 'ask'
                        ? 'single_task_agent/ask'
                        : input.modeKey === 'plan'
                          ? 'single_task_agent/plan'
                          : 'single_task_agent/apply',
            internalModelRole:
                input.runtimeProfile === 'planner' ? 'planner' : input.topLevelTab === 'chat' ? 'chat' : 'apply',
            delegatedOnly: false,
            sessionSelectable: true,
            ...(input.runtimeProfile ? { runtimeProfile: input.runtimeProfile } : {}),
        },
        source: 'test',
        sourceKind: 'system_seed',
        scope: 'system',
        enabled: true,
        precedence: 0,
        createdAt: '2026-04-02T00:00:00.000Z',
        updatedAt: '2026-04-02T00:00:00.000Z',
    };
}

describe('resolveRunTarget boundaries', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        providerStoreMock.getDefaults.mockResolvedValue({
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        providerStoreMock.getSpecialistDefaults.mockResolvedValue([]);
    });

    it('fails closed when a verified explicit model is unavailable for the provider', async () => {
        providerStoreMock.modelExists.mockResolvedValue(false);

        const resolvedTarget = await resolveRequestedOrDefaultRunTarget({
            profileId: 'profile_default',
            providerId: 'openai',
            modelId: 'openai/gpt-missing',
        });
        expect(resolvedTarget.isOk()).toBe(true);
        if (resolvedTarget.isErr()) {
            throw new Error(resolvedTarget.error.message);
        }

        const result = await verifyResolvedRunTargetAvailability({
            profileId: 'profile_default',
            target: resolvedTarget.value,
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected explicit unavailable model to be rejected.');
        }
        expect(result.error.code).toBe('provider_model_not_available');
        expect(result.error.message).toContain('openai/gpt-missing');
    });

    it('uses the saved default only when the caller omitted both provider and model', async () => {
        const result = await resolveRequestedOrDefaultRunTarget({
            profileId: 'profile_default',
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value).toEqual({
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
    });

    it('prefers the matching specialist default over the shared fallback for runnable presets', async () => {
        providerStoreMock.getSpecialistDefaults.mockResolvedValue([
            {
                topLevelTab: 'agent',
                modeKey: 'code',
                providerId: 'kilo',
                modelId: kiloFrontierModelId,
            },
        ]);
        const result = await resolveRequestedOrDefaultRunTarget({
            profileId: 'profile_default',
            mode: createMode({
                topLevelTab: 'agent',
                modeKey: 'code',
                runtimeProfile: 'mutating_agent',
            }),
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value).toEqual({
            providerId: 'kilo',
            modelId: kiloFrontierModelId,
        });
    });

    it('does not depend on shared-default lookup when the caller provides an explicit target', async () => {
        const result = await resolveRequestedOrDefaultRunTarget({
            profileId: 'profile_default',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(providerStoreMock.getDefaults).not.toHaveBeenCalled();
        expect(providerStoreMock.getSpecialistDefaults).not.toHaveBeenCalled();
        expect(result.value).toEqual({
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
    });

    it('falls back to the shared default for custom modes without a supported specialist alias', async () => {
        providerStoreMock.getSpecialistDefaults.mockResolvedValue([
            {
                topLevelTab: 'agent',
                modeKey: 'code',
                providerId: 'kilo',
                modelId: kiloFrontierModelId,
            },
        ]);

        const result = await resolveRequestedOrDefaultRunTarget({
            profileId: 'profile_default',
            mode: createMode({
                topLevelTab: 'agent',
                modeKey: 'custom_reviewer',
                runtimeProfile: 'mutating_agent',
            }),
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value).toEqual({
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
    });
});
