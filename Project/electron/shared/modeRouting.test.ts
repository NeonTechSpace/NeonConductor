import { describe, expect, it } from 'vitest';

import { createDefaultPreparedContextModeOverrides } from '@/app/backend/runtime/contracts';
import type { ModeDefinition, RuntimeRequirementProfile, ToolCapability } from '@/shared/contracts';
import {
    isSupportedModeSpecialistAlias,
    resolveModeCompatibilityRequirements,
    resolveModeRoutingIntent,
    resolveModeSpecialistAlias,
    resolveSpecialistAliasRoutingIntent,
} from '@/shared/modeRouting';

function createMode(input: {
    topLevelTab: ModeDefinition['topLevelTab'];
    modeKey: string;
    authoringRole?: ModeDefinition['authoringRole'];
    roleTemplate?: ModeDefinition['roleTemplate'];
    internalModelRole?: ModeDefinition['internalModelRole'];
    runtimeProfile?: RuntimeRequirementProfile;
    planningOnly?: boolean;
    toolCapabilities?: ToolCapability[];
}): ModeDefinition {
    return {
        id: `mode_${input.topLevelTab}_${input.modeKey}`,
        profileId: 'profile_default',
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
        authoringRole: input.authoringRole ?? 'single_task_agent',
        roleTemplate: input.roleTemplate ?? 'single_task_agent/apply',
        internalModelRole: input.internalModelRole ?? 'apply',
        delegatedOnly: false,
        sessionSelectable: true,
        label: input.modeKey,
        assetKey: `${input.topLevelTab}.${input.modeKey}`,
        prompt: {},
        promptLayerOverrides: createDefaultPreparedContextModeOverrides(),
        executionPolicy: {
            ...(input.runtimeProfile ? { runtimeProfile: input.runtimeProfile } : {}),
            ...(input.planningOnly ? { planningOnly: true } : {}),
            ...(input.toolCapabilities ? { toolCapabilities: input.toolCapabilities } : {}),
            ...(input.authoringRole ? { authoringRole: input.authoringRole } : {}),
            ...(input.roleTemplate ? { roleTemplate: input.roleTemplate } : {}),
            ...(input.internalModelRole ? { internalModelRole: input.internalModelRole } : {}),
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

describe('mode routing intent', () => {
    it('maps built-in runnable presets onto specialist aliases and Kilo headers', () => {
        const codeMode = createMode({
            topLevelTab: 'agent',
            modeKey: 'code',
            roleTemplate: 'single_task_agent/apply',
            runtimeProfile: 'mutating_agent',
        });

        expect(resolveModeSpecialistAlias(codeMode)).toEqual({
            topLevelTab: 'agent',
            modeKey: 'code',
        });
        expect(resolveModeRoutingIntent(codeMode)).toMatchObject({
            runtimeProfile: 'mutating_agent',
            requiresNativeTools: true,
            allowsImageAttachments: true,
            specialistAlias: {
                topLevelTab: 'agent',
                modeKey: 'code',
            },
            kiloModeHeader: 'code',
        });
    });

    it('fails closed for custom modes without a supported preset alias', () => {
        const customMode = createMode({
            topLevelTab: 'agent',
            modeKey: 'custom_review',
            roleTemplate: 'single_task_agent/review',
            runtimeProfile: 'reviewer',
        });

        expect(resolveModeSpecialistAlias(customMode)).toBeUndefined();
        expect(resolveModeRoutingIntent(customMode)).toMatchObject({
            runtimeProfile: 'reviewer',
            requiresNativeTools: false,
            allowsImageAttachments: true,
        });
        expect(resolveModeRoutingIntent(customMode).specialistAlias).toBeUndefined();
        expect(resolveModeRoutingIntent(customMode).kiloModeHeader).toBeUndefined();
    });

    it('keeps planning modes out of specialist routing and image attachments', () => {
        const planMode = createMode({
            topLevelTab: 'agent',
            modeKey: 'plan',
            roleTemplate: 'single_task_agent/plan',
            internalModelRole: 'planner',
            runtimeProfile: 'planner',
            planningOnly: true,
        });

        expect(resolveModeRoutingIntent(planMode)).toEqual({
            runtimeProfile: 'planner',
            requiresNativeTools: false,
            allowsImageAttachments: false,
        });
    });

    it('keeps chat-role modes from claiming native tool requirements', () => {
        const generalMode = createMode({
            topLevelTab: 'chat',
            modeKey: 'chat',
            authoringRole: 'chat',
            roleTemplate: 'chat/default',
            internalModelRole: 'chat',
            runtimeProfile: 'general',
            toolCapabilities: ['filesystem_read', 'shell'],
        });

        expect(resolveModeCompatibilityRequirements(generalMode)).toEqual({
            runtimeProfile: 'general',
            requiresNativeTools: false,
            allowsImageAttachments: true,
        });
    });

    it('keeps a narrow fallback for supported legacy specialist aliases', () => {
        expect(
            isSupportedModeSpecialistAlias({
                topLevelTab: 'orchestrator',
                modeKey: 'orchestrate',
            })
        ).toBe(true);

        expect(
            resolveSpecialistAliasRoutingIntent({
                topLevelTab: 'orchestrator',
                modeKey: 'orchestrate',
            })
        ).toEqual({
            runtimeProfile: 'orchestrator',
            requiresNativeTools: true,
            allowsImageAttachments: false,
            specialistAlias: {
                topLevelTab: 'orchestrator',
                modeKey: 'orchestrate',
            },
            kiloModeHeader: 'orchestrator',
        });
    });
});
