import { describe, expect, it } from 'vitest';

import { buildKiloRuntimeHeaders } from '@/app/backend/providers/adapters/kilo/headers';

import { kiloBalancedModelId, kiloFrontierModelId } from '@/shared/kiloModels';

describe('buildKiloRuntimeHeaders', () => {
    it.each([
        [kiloFrontierModelId, 'ask'],
        [kiloBalancedModelId, 'orchestrator'],
    ] as const)('sends x-kilocode-mode for canonical Kilo auto models (%s)', (modelId, kiloModeHeader) => {
        const headers = buildKiloRuntimeHeaders({
            token: 'token',
            modelId,
            kiloModeHeader,
        });

        expect(headers['x-kilocode-mode']).toBe(kiloModeHeader);
    });

    it('does not send x-kilocode-mode for non-auto Kilo models', () => {
        const headers = buildKiloRuntimeHeaders({
            token: 'token',
            modelId: 'minimax/minimax-m2.5:free',
            kiloModeHeader: 'code',
        });

        expect(headers['x-kilocode-mode']).toBeUndefined();
    });

    it('keeps anthropic routed headers alongside the Kilo mode header', () => {
        const headers = buildKiloRuntimeHeaders({
            token: 'token',
            modelId: kiloFrontierModelId,
            kiloModeHeader: 'general',
            routedApiFamily: 'anthropic_messages',
        });

        expect(headers['x-kilocode-mode']).toBe('general');
        expect(headers['x-anthropic-beta']).toBe('fine-grained-tool-streaming-2025-05-14');
    });
});
