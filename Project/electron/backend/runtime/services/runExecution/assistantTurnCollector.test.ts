import { describe, expect, it } from 'vitest';

import { createAssistantTurnCollector } from '@/app/backend/runtime/services/runExecution/assistantTurnCollector';

describe('assistantTurnCollector', () => {
    it('merges adjacent text parts and captures tool calls', () => {
        const collector = createAssistantTurnCollector();

        collector.recordPart({
            partType: 'text',
            payload: { text: 'hello ' },
        } as never);
        collector.recordPart({
            partType: 'text',
            payload: { text: 'world' },
        } as never);
        collector.recordPart({
            partType: 'tool_call',
            payload: {
                callId: 'call_1',
                toolName: 'read_file',
                argumentsText: '{"path":"README.md"}',
                args: { path: 'README.md' },
            },
        } as never);

        expect(collector.buildContextMessage()).toEqual({
            role: 'assistant',
            parts: [
                {
                    type: 'text',
                    text: 'hello world',
                },
                {
                    type: 'tool_call',
                    callId: 'call_1',
                    toolName: 'read_file',
                    argumentsText: '{"path":"README.md"}',
                },
            ],
        });
        expect(collector.getToolCalls()).toEqual([
            {
                callId: 'call_1',
                toolName: 'read_file',
                argumentsText: '{"path":"README.md"}',
                args: {
                    path: 'README.md',
                },
            },
        ]);
    });
});
