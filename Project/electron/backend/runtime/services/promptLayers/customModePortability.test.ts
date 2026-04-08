import { describe, expect, it } from 'vitest';

import {
    buildCanonicalCustomModePayload,
    toPortableModePayload,
} from '@/app/backend/runtime/services/promptLayers/customModePortability';

describe('customModePortability', () => {
    it('accepts code_runtime in canonical custom mode payloads', () => {
        expect(
            buildCanonicalCustomModePayload({
                slug: 'code-runtime-test',
                name: 'Code Runtime Test',
                toolCapabilities: ['filesystem_read', 'code_runtime'],
            })
        ).toMatchObject({
            toolCapabilities: ['filesystem_read', 'code_runtime'],
        });
    });

    it('rejects code_runtime during portable export instead of silently dropping it', () => {
        expect(() =>
            toPortableModePayload({
                id: 'mode_test',
                profileId: 'profile_default',
                topLevelTab: 'agent',
                modeKey: 'code-runtime',
                label: 'Code Runtime',
                assetKey: 'code-runtime',
                prompt: {},
                executionPolicy: {
                    toolCapabilities: ['filesystem_read', 'code_runtime'],
                },
                source: 'user',
                sourceKind: 'global_file',
                scope: 'global',
                enabled: true,
                precedence: 0,
                createdAt: '2026-04-01T00:00:00.000Z',
                updatedAt: '2026-04-01T00:00:00.000Z',
            })
        ).toThrow('Portable export does not support the "code_runtime" tool capability in this slice.');
    });
});
