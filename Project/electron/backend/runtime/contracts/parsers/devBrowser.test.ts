import { describe, expect, it } from 'vitest';

import {
    parseBrowserContextPacket,
    parseBrowserDesignQualityFinding,
    parseBrowserDesignerDraft,
    parseBrowserDesignerAnnotation,
    parseBrowserDesignerLiveSession,
    parseBrowserDesignerVariant,
    parseSessionQueueBrowserDesignerApplyIntentInput,
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

    it('accepts design diagnostics, generated-source apply status, and variant lineage', () => {
        expect(
            parseBrowserDesignQualityFinding(
                {
                    id: 'bddiag_low_contrast',
                    scope: 'draft',
                    severity: 'warning',
                    category: 'color',
                    title: 'Low text contrast',
                    message: 'The preview colors are below the contrast threshold.',
                    evidence: '2.1:1',
                    selectionId: 'bsel_1',
                    variantId: 'bdvar_1',
                    draftId: 'bdsn_1',
                    stale: false,
                },
                'finding'
            ).category
        ).toBe('color');

        expect(
            parseBrowserDesignerDraft(
                {
                    id: 'bdsn_1',
                    selectionId: 'bsel_1',
                    sourceVariantId: 'bdvar_1',
                    pageIdentity: 'http://localhost:3000/',
                    inclusionState: 'included',
                    applyMode: 'apply_with_agent',
                    applyStatus: 'blocked_generated_source_anchor',
                    stylePatches: {},
                    stale: false,
                    createdAt: '2026-05-08T08:00:00.000Z',
                    updatedAt: '2026-05-08T08:00:00.000Z',
                },
                'draft'
            ).sourceVariantId
        ).toBe('bdvar_1');
    });

    it('accepts browser context packets with diagnostics and queued designer apply input', () => {
        const packet = parseBrowserContextPacket(
            {
                target: {
                    scheme: 'http',
                    host: 'localhost',
                    path: '/',
                    sourceKind: 'manual',
                    validation: { status: 'allowed', resolvedAddresses: ['127.0.0.1'] },
                    browserAvailability: 'available',
                },
                selections: [
                    {
                        id: 'bsel_1',
                        pageIdentity: 'http://localhost:3000/',
                        pageUrl: 'http://localhost:3000/',
                        selector: { primary: 'button', path: ['button'] },
                        ancestryTrail: [{ tagName: 'button', selector: 'button' }],
                        bounds: { x: 0, y: 0, width: 100, height: 40 },
                        enrichmentMode: 'dom_only',
                        stale: false,
                        createdAt: '2026-05-08T08:00:00.000Z',
                    },
                ],
                comments: [],
                cropAttachmentIds: [],
                designerDrafts: [
                    {
                        draftId: 'bdsn_1',
                        selectionId: 'bsel_1',
                        sourceVariantId: 'bdvar_1',
                        pageIdentity: 'http://localhost:3000/',
                        applyMode: 'apply_with_agent',
                        applyStatus: 'eligible',
                        stylePatches: { color: '#ffffff' },
                        createdAt: '2026-05-08T08:00:00.000Z',
                        updatedAt: '2026-05-08T08:00:00.000Z',
                    },
                ],
                designDiagnostics: [
                    {
                        id: 'bddiag_1',
                        scope: 'draft',
                        severity: 'warning',
                        category: 'color',
                        title: 'Low contrast',
                        message: 'Contrast is low.',
                        draftId: 'bdsn_1',
                        stale: false,
                    },
                ],
                enrichmentMode: 'dom_only',
            },
            'packet'
        );
        expect(packet.designDiagnostics).toHaveLength(1);

        expect(
            parseSessionQueueBrowserDesignerApplyIntentInput({
                profileId: 'profile_default',
                sessionId: 'sess_1',
                draftId: 'bdsn_1',
                topLevelTab: 'agent',
                modeKey: 'agent.code',
                runtimeOptions,
            }).draftId
        ).toBe('bdsn_1');
    });

    it('rejects unsupported design diagnostic categories', () => {
        expect(() =>
            parseBrowserDesignQualityFinding(
                {
                    id: 'bddiag_bad',
                    scope: 'draft',
                    severity: 'warning',
                    category: 'copied_external_rule',
                    title: 'Bad',
                    message: 'Bad',
                    stale: false,
                },
                'finding'
            )
        ).toThrow(/category/);
    });
});
