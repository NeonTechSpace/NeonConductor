import { describe, expect, it } from 'vitest';

import { resolveKiloModeHeader } from '@/app/backend/runtime/services/runExecution/kiloMode';
import { createDefaultPreparedContextModeOverrides } from '@/app/backend/runtime/contracts';

import type { ModeDefinition } from '@/shared/contracts';

function createMode(topLevelTab: ModeDefinition['topLevelTab'], modeKey: string): ModeDefinition {
    return {
        id: `mode_test_${topLevelTab}_${modeKey}`,
        profileId: 'profile_test',
        topLevelTab,
        modeKey,
        authoringRole:
            topLevelTab === 'chat'
                ? 'chat'
                : topLevelTab === 'orchestrator'
                  ? 'orchestrator_primary'
                  : 'single_task_agent',
        roleTemplate:
            topLevelTab === 'chat'
                ? 'chat/default'
                : topLevelTab === 'orchestrator'
                  ? modeKey === 'orchestrate'
                      ? 'orchestrator_primary/orchestrate'
                      : 'orchestrator_primary/debug'
                  : modeKey === 'ask'
                    ? 'single_task_agent/ask'
                    : modeKey === 'debug'
                      ? 'single_task_agent/debug'
                      : 'single_task_agent/apply',
        internalModelRole: topLevelTab === 'chat' ? 'chat' : 'apply',
        delegatedOnly: false,
        sessionSelectable: true,
        label: `${topLevelTab}:${modeKey}`,
        assetKey: `${topLevelTab}.${modeKey}`,
        prompt: {},
        promptLayerOverrides: createDefaultPreparedContextModeOverrides(),
        executionPolicy: {
            authoringRole:
                topLevelTab === 'chat'
                    ? 'chat'
                    : topLevelTab === 'orchestrator'
                      ? 'orchestrator_primary'
                      : 'single_task_agent',
            roleTemplate:
                topLevelTab === 'chat'
                    ? 'chat/default'
                    : topLevelTab === 'orchestrator'
                      ? modeKey === 'orchestrate'
                          ? 'orchestrator_primary/orchestrate'
                          : 'orchestrator_primary/debug'
                      : modeKey === 'ask'
                        ? 'single_task_agent/ask'
                        : modeKey === 'debug'
                          ? 'single_task_agent/debug'
                          : 'single_task_agent/apply',
            internalModelRole: topLevelTab === 'chat' ? 'chat' : 'apply',
            delegatedOnly: false,
            sessionSelectable: true,
        },
        source: 'test',
        sourceKind: 'system_seed',
        scope: 'system',
        enabled: true,
        precedence: 0,
        createdAt: '2026-03-26T00:00:00.000Z',
        updatedAt: '2026-03-26T00:00:00.000Z',
    };
}

describe('resolveKiloModeHeader', () => {
    it.each([
        ['agent', 'ask', 'ask'],
        ['agent', 'code', 'code'],
        ['agent', 'debug', 'debug'],
        ['chat', 'chat', 'general'],
        ['orchestrator', 'orchestrate', 'orchestrator'],
        ['orchestrator', 'debug', 'debug'],
    ] as const)('maps %s/%s to %s', (topLevelTab, modeKey, expected) => {
        expect(resolveKiloModeHeader(createMode(topLevelTab, modeKey))).toBe(expected);
    });

    it('returns undefined for modes outside the Kilo mode-header contract', () => {
        expect(resolveKiloModeHeader(createMode('agent', 'plan'))).toBeUndefined();
    });
});

