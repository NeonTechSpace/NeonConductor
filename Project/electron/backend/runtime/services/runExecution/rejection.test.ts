import { describe, expect, it } from 'vitest';

import { toRejectedStartResult } from '@/app/backend/runtime/services/runExecution/rejection';

describe('toRejectedStartResult', () => {
    it('derives provider auth actions from provider auth errors', () => {
        const rejected = toRejectedStartResult(
            {
                code: 'provider_not_authenticated',
                message: 'Provider "openai" is not authenticated/configured.',
            },
            {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
                topLevelTab: 'chat',
                modeKey: 'chat',
            }
        );

        expect(rejected.action).toEqual({
            code: 'provider_not_runnable',
            providerId: 'openai',
        });
    });

    it('preserves explicit tool-capability actions from runtime validation', () => {
        const rejected = toRejectedStartResult(
            {
                code: 'runtime_option_invalid',
                message: 'Model "openai/gpt-5" does not support native tool calling.',
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

        expect(rejected.action).toEqual({
            code: 'model_tools_required',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            modeKey: 'code',
        });
    });

    it('derives mode actions for invalid mode families', () => {
        const rejected = toRejectedStartResult(
            {
                code: 'mode_policy_invalid',
                message: 'Mode "plan" is planning-only and cannot execute runs.',
            },
            {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
                topLevelTab: 'agent',
                modeKey: 'plan',
            }
        );

        expect(rejected.action).toEqual({
            code: 'mode_invalid',
            modeKey: 'plan',
            topLevelTab: 'agent',
        });
    });
});
