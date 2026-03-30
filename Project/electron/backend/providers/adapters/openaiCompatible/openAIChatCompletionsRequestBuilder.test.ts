import { describe, expect, it } from 'vitest';

import { buildOpenAIChatCompletionsRequestBody } from '@/app/backend/providers/adapters/openaiCompatible/openAIChatCompletionsRequestBuilder';
import type { ProviderRuntimeInput } from '@/app/backend/providers/types';

function createRuntimeInput(overrides?: Partial<ProviderRuntimeInput>): ProviderRuntimeInput {
    return {
        profileId: 'profile_default',
        sessionId: 'sess_openai_compat',
        runId: 'run_openai_compat',
        providerId: 'openai',
        modelId: 'openai/gpt-4o',
        runtime: {
            toolProtocol: 'openai_chat_completions',
            apiFamily: 'openai_compatible',
        },
        promptText: 'Inspect the workspace',
        contextMessages: [
            {
                role: 'system',
                parts: [
                    {
                        type: 'text',
                        text: 'System prompt',
                    },
                ],
            },
            {
                role: 'assistant',
                parts: [
                    {
                        type: 'text',
                        text: 'Plan',
                    },
                    {
                        type: 'tool_call',
                        callId: 'call_list',
                        toolName: 'list_files',
                        argumentsText: '{"path":"."}',
                    },
                ],
            },
            {
                role: 'tool',
                parts: [
                    {
                        type: 'tool_result',
                        callId: 'call_list',
                        toolName: 'list_files',
                        outputText: '{"files":[]}',
                        isError: false,
                    },
                ],
            },
            {
                role: 'user',
                parts: [
                    {
                        type: 'text',
                        text: 'Continue',
                    },
                    {
                        type: 'image',
                        dataUrl: 'data:image/png;base64,AAA=',
                        mimeType: 'image/png',
                        width: 100,
                        height: 100,
                    },
                ],
            },
        ],
        tools: [
            {
                id: 'list_files',
                description: 'List files',
                inputSchema: {
                    type: 'object',
                    properties: {
                        path: { type: 'string' },
                    },
                    required: ['path'],
                },
            },
        ],
        toolChoice: 'auto',
        runtimeOptions: {
            reasoning: {
                effort: 'medium',
                summary: 'auto',
                includeEncrypted: false,
            },
            cache: {
                strategy: 'auto',
            },
            transport: {
                family: 'auto',
            },
            execution: {},
        },
        cache: {
            strategy: 'auto',
            applied: false,
        },
        authMethod: 'api_key',
        apiKey: 'test-key',
        signal: new AbortController().signal,
        ...overrides,
    };
}

describe('openAIChatCompletionsRequestBuilder', () => {
    it('preserves text, image, tool-call, and tool-result shaping for chat completions', () => {
        const body = buildOpenAIChatCompletionsRequestBody(createRuntimeInput(), 'openai/');

        expect(body['model']).toBe('gpt-4o');
        expect(body['stream']).toBe(true);
        expect(body['stream_options']).toEqual({
            include_usage: true,
        });
        expect(body['tool_choice']).toBe('auto');
        expect(body['tools']).toEqual([
            {
                type: 'function',
                function: {
                    name: 'list_files',
                    description: 'List files',
                    parameters: {
                        type: 'object',
                        properties: {
                            path: { type: 'string' },
                        },
                        required: ['path'],
                    },
                },
            },
        ]);

        expect(body['messages']).toEqual([
            {
                role: 'system',
                content: 'System prompt',
            },
            {
                role: 'assistant',
                content: 'Plan',
                tool_calls: [
                    {
                        id: 'call_list',
                        type: 'function',
                        function: {
                            name: 'list_files',
                            arguments: '{"path":"."}',
                        },
                    },
                ],
            },
            {
                role: 'tool',
                tool_call_id: 'call_list',
                content: '{"files":[]}',
            },
            {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: 'Continue',
                    },
                    {
                        type: 'image_url',
                        image_url: {
                            url: 'data:image/png;base64,AAA=',
                        },
                    },
                ],
            },
        ]);
    });
});
