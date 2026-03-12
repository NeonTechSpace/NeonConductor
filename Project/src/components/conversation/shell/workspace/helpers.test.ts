import { describe, expect, it } from 'vitest';

import { buildRuntimeRunOptions } from '@/web/components/conversation/shell/workspace/helpers';

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
                openai: 'auto',
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
                openai: 'auto',
            },
        });
    });
});
