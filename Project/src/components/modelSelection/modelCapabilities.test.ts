import { describe, expect, it } from 'vitest';

import { toRejectedStartResult } from '@/app/backend/runtime/services/runExecution/rejection';
import { resolveModelCompatibility } from '@/web/components/modelSelection/modelCapabilities';

describe('model compatibility helpers', () => {
    it('rejects non-tool models when the current mode requires native tools', () => {
        const result = resolveModelCompatibility(
            {
                features: {
                    supportsTools: false,
                    supportsVision: false,
                    supportsReasoning: false,
                    supportsAudioInput: false,
                    supportsAudioOutput: false,
                    inputModalities: ['text'],
                    outputModalities: ['text'],
                },
                runtime: {
                    toolProtocol: 'openai_chat_completions',
                    apiFamily: 'openai_compatible',
                },
            },
            {
                surface: 'conversation',
                requiresTools: true,
                modeKey: 'code',
            }
        );

        expect(result).toEqual({
            state: 'incompatible',
            scope: 'model',
            issue: {
                code: 'model_tools_required',
                modeKey: 'code',
            },
        });
    });

    it('rejects non-vision models when image attachments are pending', () => {
        const result = resolveModelCompatibility(
            {
                features: {
                    supportsTools: true,
                    supportsVision: false,
                    supportsReasoning: false,
                    supportsAudioInput: false,
                    supportsAudioOutput: false,
                    inputModalities: ['text'],
                    outputModalities: ['text'],
                },
                runtime: {
                    toolProtocol: 'openai_chat_completions',
                    apiFamily: 'openai_compatible',
                },
            },
            {
                surface: 'conversation',
                hasPendingImageAttachments: true,
                imageAttachmentsAllowed: true,
            }
        );

        expect(result).toEqual({
            state: 'incompatible',
            scope: 'model',
            issue: {
                code: 'model_vision_required',
            },
        });
    });

    it('downgrades disconnected providers to warnings in settings', () => {
        const result = resolveModelCompatibility(
            {
                features: {
                    supportsTools: true,
                    supportsVision: true,
                    supportsReasoning: false,
                    supportsAudioInput: false,
                    supportsAudioOutput: false,
                    inputModalities: ['text'],
                    outputModalities: ['text'],
                },
                runtime: {
                    toolProtocol: 'openai_chat_completions',
                    apiFamily: 'openai_compatible',
                },
            },
            {
                surface: 'settings',
                provider: {
                    id: 'openai',
                    label: 'OpenAI',
                    authState: 'logged_out',
                    authMethod: 'api_key',
                },
            }
        );

        expect(result).toEqual({
            state: 'warning',
            scope: 'provider',
            issue: {
                code: 'provider_not_runnable',
                providerId: 'openai',
            },
        });
    });

    it('uses the same typed issue code as backend run rejection for tool-required incompatibility', () => {
        const compatibility = resolveModelCompatibility(
            {
                features: {
                    supportsTools: false,
                    supportsVision: false,
                    supportsReasoning: false,
                    supportsAudioInput: false,
                    supportsAudioOutput: false,
                    inputModalities: ['text'],
                    outputModalities: ['text'],
                },
                runtime: {
                    toolProtocol: 'openai_chat_completions',
                    apiFamily: 'openai_compatible',
                },
            },
            {
                surface: 'conversation',
                requiresTools: true,
                modeKey: 'code',
            }
        );
        const rejection = toRejectedStartResult(
            {
                code: 'runtime_option_invalid',
                message: 'Model does not support native tool calling.',
                action: {
                    code: 'model_tools_required',
                    providerId: 'openai',
                    modelId: 'openai/gpt-5',
                    modeKey: 'code',
                },
            },
            {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
                topLevelTab: 'agent',
                modeKey: 'code',
            }
        );

        expect(compatibility.issue?.code).toBe('model_tools_required');
        expect(rejection.action?.code).toBe('model_tools_required');
    });
});
