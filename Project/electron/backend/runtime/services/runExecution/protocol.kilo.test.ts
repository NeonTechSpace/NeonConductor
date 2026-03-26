import { describe, expect, it } from 'vitest';

import {
    createProtocolModelCapabilities,
    createProtocolRuntimeOptions,
    protocolTestProfileId,
    resolveRuntimeProtocolForTest,
} from '@/app/backend/runtime/services/runExecution/protocol.shared.test';

import { kiloFrontierModelId } from '@/shared/kiloModels';


describe('resolveRuntimeProtocol kilo gateway routing', () => {
    it('rejects OpenAI transport overrides for kilo gateway models', async () => {
        const result = await resolveRuntimeProtocolForTest({
            profileId: protocolTestProfileId,
            providerId: 'kilo',
            modelId: kiloFrontierModelId,
            modelCapabilities: createProtocolModelCapabilities({
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: false,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                routedApiFamily: 'openai_compatible',
                inputModalities: ['text'],
                outputModalities: ['text'],
                toolProtocol: 'kilo_gateway',
            }),
            authMethod: 'api_key',
            runtimeOptions: {
                ...createProtocolRuntimeOptions(),
                transport: {
                    family: 'openai_responses',
                },
            },
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected Kilo transport override to fail.');
        }
        expect(result.error.code).toBe('runtime_option_invalid');
    });

    it('selects the kilo transport for routed Anthropic gateway models', async () => {
        const result = await resolveRuntimeProtocolForTest({
            profileId: protocolTestProfileId,
            providerId: 'kilo',
            modelId: 'anthropic/claude-sonnet-4.5',
            modelCapabilities: createProtocolModelCapabilities({
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: true,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                routedApiFamily: 'anthropic_messages',
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
                toolProtocol: 'kilo_gateway',
            }),
            authMethod: 'api_key',
            runtimeOptions: createProtocolRuntimeOptions(),
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value.runtime.toolProtocol).toBe('kilo_gateway');
        if (result.value.runtime.toolProtocol !== 'kilo_gateway') {
            throw new Error('Expected Kilo gateway runtime descriptor.');
        }
        expect(result.value.runtime.routedApiFamily).toBe('anthropic_messages');
        expect(result.value.transport.selected).toBe('kilo_gateway');
    });

    it('fails closed for Kilo gateway models that are missing routed family metadata', async () => {
        const result = await resolveRuntimeProtocolForTest({
            profileId: protocolTestProfileId,
            providerId: 'kilo',
            modelId: kiloFrontierModelId,
            modelCapabilities: {
                features: {
                    supportsTools: true,
                    supportsReasoning: true,
                    supportsVision: false,
                    supportsAudioInput: false,
                    supportsAudioOutput: false,
                    inputModalities: ['text'],
                    outputModalities: ['text'],
                },
                runtime: {
                    toolProtocol: 'kilo_gateway',
                    apiFamily: 'kilo_gateway',
                },
            } as never,
            authMethod: 'api_key',
            runtimeOptions: createProtocolRuntimeOptions(),
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected missing Kilo routed family metadata to fail closed.');
        }
        expect(result.error.code).toBe('runtime_option_invalid');
    });

    it('selects the kilo transport for routed Gemini gateway models', async () => {
        const result = await resolveRuntimeProtocolForTest({
            profileId: protocolTestProfileId,
            providerId: 'kilo',
            modelId: 'google/gemini-2.5-pro',
            modelCapabilities: createProtocolModelCapabilities({
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: true,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                routedApiFamily: 'google_generativeai',
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
                toolProtocol: 'kilo_gateway',
            }),
            authMethod: 'api_key',
            runtimeOptions: createProtocolRuntimeOptions(),
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value.runtime.toolProtocol).toBe('kilo_gateway');
        if (result.value.runtime.toolProtocol !== 'kilo_gateway') {
            throw new Error('Expected Kilo gateway runtime descriptor.');
        }
        expect(result.value.runtime.routedApiFamily).toBe('google_generativeai');
        expect(result.value.transport.selected).toBe('kilo_gateway');
    });
});

