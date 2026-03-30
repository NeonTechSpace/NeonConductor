import { describe, expect, it } from 'vitest';

import { buildTopLevelTabRecord } from '@/web/components/settings/modesSettings/useModesInstructionsSettingsController';

describe('buildTopLevelTabRecord', () => {
    it('builds a value for each top-level tab without casts', () => {
        const record = buildTopLevelTabRecord((topLevelTab) => `${topLevelTab}-value`);

        expect(record).toEqual({
            chat: 'chat-value',
            agent: 'agent-value',
            orchestrator: 'orchestrator-value',
        });
    });
});
