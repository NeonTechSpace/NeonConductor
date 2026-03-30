import { describe, expect, it } from 'vitest';

import { buildOpenAIResponsesRequestBody } from '@/app/backend/providers/adapters/openaiCompatible/openAIResponsesRequestBuilder';
import type { ProviderRuntimeInput } from '@/app/backend/providers/types';

function createRuntimeInput(overrides?: Partial<ProviderRuntimeInput>): ProviderRuntimeInput {
    return {
        profileId: 'profile_default',
        sessionId: 'sess_openai_compat',
        runId: 'run_openai_compat',
        providerId: 'openai',
        modelId: 'openai/gpt-5',
        runtime: {
            toolProtocol: 'openai_responses',
            apiFamily: 'openai_compatible',
        },
        promptText: 'Inspect the workspace',
        contextMessages: [
            {
                role: 'user',
                parts: [
                    {
                        type: 'text',
                        text: 'Inspect the workspace',
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
            {
                role: 'assistant',
                parts: [
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
                effort: 'xhigh',
                summary: 'auto',
                includeEncrypted: true,
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

describe('openAIResponsesRequestBuilder', () => {
    it('preserves text, image, tool-call, tool-result, and reasoning shaping for responses', () => {
        const body = buildOpenAIResponsesRequestBody(createRuntimeInput(), 'openai/');

        expect(body['model']).toBe('gpt-5');
        expect(body['include']).toEqual(['reasoning.encrypted_content']);
        expect(body['reasoning']).toEqual({
            summary: 'auto',
            effort: 'high',
        });
        expect(body['tool_choice']).toBe('auto');
        expect(body['tools']).toEqual([
            {
                type: 'function',
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
        ]);

        expect(body['input']).toEqual([
            {
                role: 'user',
                content: [
                    {
                        type: 'input_text',
                        text: 'Inspect the workspace',
                    },
                    {
                        type: 'input_image',
                        image_url: 'data:image/png;base64,AAA=',
                    },
                ],
            },
            {
                type: 'function_call',
                call_id: 'call_list',
                name: 'list_files',
                arguments: '{"path":"."}',
            },
            {
                type: 'function_call_output',
                call_id: 'call_list',
                output: '{"files":[]}',
            },
        ]);
    });
});
