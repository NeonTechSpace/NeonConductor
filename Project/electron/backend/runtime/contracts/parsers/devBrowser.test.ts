import { describe, expect, it } from 'vitest';

import {
    parseBrowserDesignerAnnotation,
    parseBrowserDesignerLiveSession,
    parseBrowserDesignerVariant,
    parseSessionStartBrowserDesignerVariantGenerationInput,
} from '@/app/backend/runtime/contracts/parsers/devBrowser';

const runtimeOptions = {
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
};

describe('dev browser designer parsers', () => {
    it('accepts durable live designer session records', () => {
        expect(
            parseBrowserDesignerLiveSession(
                {
                    id: 'bdsess_1',
                    selectionId: 'bsel_1',
                    pageIdentity: 'http://localhost:3000/',
                    actionChip: 'polish',
                    intentText: 'Make this card clearer.',
                    requestedVariantCount: 3,
                    generationStatus: 'idle',
                    stale: false,
                    createdAt: '2026-05-08T08:00:00.000Z',
                    updatedAt: '2026-05-08T08:00:00.000Z',
                },
                'liveSession'
            ).actionChip
        ).toBe('polish');
    });

    it('rejects unknown live designer action chips', () => {
        expect(() =>
            parseBrowserDesignerLiveSession(
                {
                    id: 'bdsess_1',
                    selectionId: 'bsel_1',
                    pageIdentity: 'http://localhost:3000/',
                    actionChip: 'retro',
                    intentText: 'Make this card clearer.',
                    requestedVariantCount: 3,
                    generationStatus: 'idle',
                    stale: false,
                    createdAt: '2026-05-08T08:00:00.000Z',
                    updatedAt: '2026-05-08T08:00:00.000Z',
                },
                'liveSession'
            )
        ).toThrow(/actionChip/);
    });

    it('accepts annotation geometry and generated variants', () => {
        expect(
            parseBrowserDesignerAnnotation(
                {
                    id: 'bdann_1',
                    designerSessionId: 'bdsess_1',
                    selectionId: 'bsel_1',
                    pageIdentity: 'http://localhost:3000/',
                    kind: 'comment',
                    text: 'Keep the call to action prominent.',
                    geometry: { x: 10, y: 20, width: 200, height: 80 },
                    sequence: 1,
                    stale: false,
                    createdAt: '2026-05-08T08:00:00.000Z',
                    updatedAt: '2026-05-08T08:00:00.000Z',
                },
                'annotation'
            ).geometry.width
        ).toBe(200);

        expect(
            parseBrowserDesignerVariant(
                {
                    id: 'bdvar_1',
                    designerSessionId: 'bdsess_1',
                    selectionId: 'bsel_1',
                    pageIdentity: 'http://localhost:3000/',
                    name: 'Focused CTA',
                    summaryMarkdown: 'Raises contrast and spacing.',
                    rationaleMarkdown: 'Improves scanability.',
                    stylePatches: { backgroundColor: '#0ea5e9', borderRadius: '8px' },
                    textContentOverride: 'Start',
                    status: 'generated',
                    createdAt: '2026-05-08T08:00:00.000Z',
                    updatedAt: '2026-05-08T08:00:00.000Z',
                },
                'variant'
            ).stylePatches.backgroundColor
        ).toBe('#0ea5e9');
    });

    it('accepts generation start inputs through normal run authority', () => {
        expect(
            parseSessionStartBrowserDesignerVariantGenerationInput({
                profileId: 'profile_default',
                sessionId: 'sess_1',
                designerSessionId: 'bdsess_1',
                topLevelTab: 'agent',
                modeKey: 'agent.code',
                workspaceFingerprint: 'workspace',
                sandboxId: 'sb_1',
                runtimeOptions,
                providerId: 'openai',
                modelId: 'gpt-5.2',
            }).runtimeOptions.reasoning.effort
        ).toBe('medium');
    });
});
