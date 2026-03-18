import { describe, expect, it } from 'vitest';

import {
    buildRuntimeRunOptions,
    modeRequiresNativeTools,
    type ConversationModeOption,
} from '@/web/components/conversation/shell/workspace/helpers';

function createMode(input: {
    modeKey: string;
    planningOnly?: boolean;
    toolCapabilities?: ConversationModeOption['executionPolicy']['toolCapabilities'];
}): ConversationModeOption {
    return {
        id: `mode_${input.modeKey}`,
        modeKey: input.modeKey,
        label: input.modeKey,
        executionPolicy: {
            ...(input.planningOnly !== undefined ? { planningOnly: input.planningOnly } : {}),
            ...(input.toolCapabilities ? { toolCapabilities: input.toolCapabilities } : {}),
        },
    };
}

describe('runtime run options', () => {
    it('keeps reasoning enabled when the model supports it', () => {
        expect(
            buildRuntimeRunOptions({
                supportsReasoning: true,
                reasoningEffort: 'high',
            })
        ).toEqual({
            reasoning: {
                effort: 'high',
                summary: 'auto',
                includeEncrypted: false,
            },
            cache: {
                strategy: 'auto',
            },
            transport: {
                family: 'auto',
            },
        });
    });

    it('turns reasoning fully off when the model does not support it', () => {
        expect(
            buildRuntimeRunOptions({
                supportsReasoning: false,
                reasoningEffort: 'high',
            })
        ).toEqual({
            reasoning: {
                effort: 'none',
                summary: 'none',
                includeEncrypted: false,
            },
            cache: {
                strategy: 'auto',
            },
            transport: {
                family: 'auto',
            },
        });
    });
});

describe('conversation shell mode helpers', () => {
    it('treats a mode as tool-capable when the backend mode metadata allows tools', () => {
        expect(modeRequiresNativeTools(createMode({ modeKey: 'chat', toolCapabilities: [] }))).toBe(false);
        expect(modeRequiresNativeTools(createMode({ modeKey: 'plan', planningOnly: true }))).toBe(false);
        expect(modeRequiresNativeTools(createMode({ modeKey: 'ask', toolCapabilities: ['filesystem_read'] }))).toBe(
            true
        );
        expect(
            modeRequiresNativeTools(createMode({ modeKey: 'orchestrate', toolCapabilities: ['filesystem_read'] }))
        ).toBe(true);
        expect(
            modeRequiresNativeTools(
                createMode({ modeKey: 'code', toolCapabilities: ['filesystem_read', 'shell'] })
            )
        ).toBe(true);
    });
});
