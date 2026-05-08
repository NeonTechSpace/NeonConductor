import { describe, expect, it } from 'vitest';

import { sessionDevBrowserDesignerStore } from '@/app/backend/persistence/stores';
import {
    createCaller,
    createSessionInScope,
    providerCatalogStore,
    registerRuntimeContractHooks,
    runtimeContractProfileId,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

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
} as const;

describe('dev browser live designer workflow', () => {
    const profileId = runtimeContractProfileId;

    it('persists live sessions, annotations, variants, and accepted drafts through session state', async () => {
        const caller = createCaller();
        const { session } = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Browser designer',
            kind: 'local',
            topLevelTab: 'chat',
        });

        const selectionState = await caller.session.persistBrowserSelection({
            profileId,
            sessionId: session.id,
            selection: {
                pageIdentity: 'http://localhost:3000/',
                pageUrl: 'http://localhost:3000/',
                selector: {
                    primary: 'main > button',
                    path: ['html', 'body', 'main', 'button'],
                },
                ancestryTrail: [
                    {
                        tagName: 'button',
                        selector: 'button',
                        accessibleLabel: 'Start',
                    },
                ],
                accessibleRole: 'button',
                accessibleLabel: 'Start',
                textExcerpt: 'Start',
                bounds: {
                    x: 10,
                    y: 20,
                    width: 120,
                    height: 40,
                },
                enrichmentMode: 'dom_only',
            },
        });
        const selection = selectionState.selections[0];
        if (!selection) {
            throw new Error('Expected persisted browser selection.');
        }

        const liveSessionState = await caller.session.createBrowserDesignerLiveSession({
            profileId,
            sessionId: session.id,
            selectionId: selection.id,
            actionChip: 'polish',
            intentText: 'Make the CTA clearer.',
            requestedVariantCount: 3,
        });
        const liveSession = liveSessionState.designerLiveSessions[0];
        if (!liveSession) {
            throw new Error('Expected persisted live designer session.');
        }

        const annotatedState = await caller.session.createBrowserDesignerAnnotation({
            profileId,
            sessionId: session.id,
            designerSessionId: liveSession.id,
            kind: 'comment',
            text: 'Keep the text concise.',
            geometry: selection.bounds,
        });
        expect(annotatedState.designerAnnotations).toHaveLength(1);
        expect(annotatedState.designerAnnotations[0]?.text).toBe('Keep the text concise.');

        await sessionDevBrowserDesignerStore.replaceGeneratedVariants({
            profileId,
            sessionId: session.id,
            designerSessionId: liveSession.id,
            variants: [
                {
                    name: 'Focused CTA',
                    summaryMarkdown: 'Raises contrast.',
                    rationaleMarkdown: 'The selected button becomes easier to scan.',
                    stylePatches: {
                        backgroundColor: '#0ea5e9',
                        borderRadius: '8px',
                    },
                    textContentOverride: 'Start now',
                },
            ],
        });

        const variantState = await caller.session.getDevBrowserState({ profileId, sessionId: session.id });
        const variant = variantState.designerVariants[0];
        expect(variant?.status).toBe('active');
        if (!variant) {
            throw new Error('Expected generated designer variant.');
        }

        const acceptedState = await caller.session.acceptBrowserDesignerVariant({
            profileId,
            sessionId: session.id,
            designerSessionId: liveSession.id,
            variantId: variant.id,
            applyMode: 'preview_only',
            inclusionState: 'included',
        });
        expect(acceptedState.designerVariants[0]?.status).toBe('accepted');
        expect(acceptedState.designerDrafts[0]?.textContentOverride).toBe('Start now');
        expect(acceptedState.designerDrafts[0]?.sourceVariantId).toBe(variant.id);
        expect(acceptedState.designDiagnostics.some((finding) => finding.selectionId === selection.id)).toBe(true);
    });

    it('queues apply-through-agent intent only after source-anchor revalidation passes', async () => {
        const caller = createCaller();
        const workspaceFingerprint = 'ws_browser_apply';
        await caller.provider.setApiKey({
            profileId,
            providerId: 'kilo',
            apiKey: 'browser-apply-test-key',
        });
        await providerCatalogStore.replaceModels(profileId, 'kilo', [
            {
                modelId: 'test/browser-apply',
                label: 'Browser Apply Test Model',
                upstreamProvider: 'openai',
                isFree: false,
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
                    routedApiFamily: 'openai_compatible',
                },
                pricing: {},
                raw: {},
                source: 'test',
            },
        ]);
        const { session } = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Browser apply',
            kind: 'local',
            topLevelTab: 'agent',
        });

        await caller.session.setDevBrowserTarget({
            profileId,
            sessionId: session.id,
            target: {
                scheme: 'http',
                host: 'localhost',
                port: 3000,
                path: '/',
                sourceKind: 'manual',
            },
        });
        const selectionState = await caller.session.persistBrowserSelection({
            profileId,
            sessionId: session.id,
            selection: {
                pageIdentity: 'http://localhost:3000/',
                pageUrl: 'http://localhost:3000/',
                selector: {
                    primary: 'main > button',
                    path: ['html', 'body', 'main', 'button'],
                },
                ancestryTrail: [{ tagName: 'button', selector: 'button', accessibleLabel: 'Start' }],
                accessibleRole: 'button',
                accessibleLabel: 'Start',
                textExcerpt: 'Start',
                bounds: { x: 10, y: 20, width: 120, height: 40 },
                enrichmentMode: 'react_source_enriched',
                reactEnrichment: {
                    sourceKind: 'provider',
                    componentChain: [{ displayName: 'CtaButton' }],
                    sourceAnchor: {
                        status: 'workspace_relative',
                        displayPath: 'src/CtaButton.tsx',
                        relativePath: 'src/CtaButton.tsx',
                        workspaceFingerprint,
                        line: 12,
                    },
                },
            },
        });
        const selection = selectionState.selections[0];
        if (!selection) {
            throw new Error('Expected persisted browser selection.');
        }

        const liveSessionState = await caller.session.createBrowserDesignerLiveSession({
            profileId,
            sessionId: session.id,
            selectionId: selection.id,
            actionChip: 'polish',
            intentText: 'Make the CTA clearer.',
            requestedVariantCount: 1,
        });
        const liveSession = liveSessionState.designerLiveSessions[0];
        if (!liveSession) {
            throw new Error('Expected persisted live designer session.');
        }
        await sessionDevBrowserDesignerStore.replaceGeneratedVariants({
            profileId,
            sessionId: session.id,
            designerSessionId: liveSession.id,
            variants: [
                {
                    name: 'Focused CTA',
                    summaryMarkdown: 'Raises contrast.',
                    rationaleMarkdown: 'The selected button becomes easier to scan.',
                    stylePatches: {
                        backgroundColor: '#111111',
                        color: '#ffffff',
                    },
                    textContentOverride: 'Start now',
                },
            ],
        });
        const variantState = await caller.session.getDevBrowserState({ profileId, sessionId: session.id });
        const variant = variantState.designerVariants[0];
        if (!variant) {
            throw new Error('Expected generated designer variant.');
        }
        const acceptedState = await caller.session.acceptBrowserDesignerVariant({
            profileId,
            sessionId: session.id,
            designerSessionId: liveSession.id,
            variantId: variant.id,
            applyMode: 'apply_with_agent',
            inclusionState: 'included',
        });
        const draft = acceptedState.designerDrafts[0];
        if (!draft) {
            throw new Error('Expected accepted designer draft.');
        }
        expect(draft.applyStatus).toBe('eligible');

        const queued = await caller.session.queueBrowserDesignerApplyIntent({
            profileId,
            sessionId: session.id,
            draftId: draft.id,
            topLevelTab: 'agent',
            modeKey: 'code',
            providerId: 'kilo',
            modelId: 'test/browser-apply',
            runtimeOptions,
        });
        expect(queued).toMatchObject({ queued: true });
        const outbox = await caller.session.listOutbox({ profileId, sessionId: session.id });
        expect(outbox.entries[0]?.browserContext?.designerDrafts[0]?.sourceVariantId).toBe(variant.id);
        expect(outbox.entries[0]?.browserContextSummary?.designerApplyIntentStatus).toBe('apply_with_agent');
    });

    it('rejects apply-through-agent intent for generated source anchors', async () => {
        const caller = createCaller();
        const workspaceFingerprint = 'ws_browser_generated_apply';
        const { session } = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint,
            title: 'Browser generated apply',
            kind: 'local',
            topLevelTab: 'agent',
        });

        await caller.session.setDevBrowserTarget({
            profileId,
            sessionId: session.id,
            target: {
                scheme: 'http',
                host: 'localhost',
                port: 3000,
                path: '/',
                sourceKind: 'manual',
            },
        });
        const selectionState = await caller.session.persistBrowserSelection({
            profileId,
            sessionId: session.id,
            selection: {
                pageIdentity: 'http://localhost:3000/',
                pageUrl: 'http://localhost:3000/',
                selector: { primary: 'main > button', path: ['html', 'body', 'main', 'button'] },
                ancestryTrail: [{ tagName: 'button', selector: 'button', accessibleLabel: 'Start' }],
                accessibleRole: 'button',
                accessibleLabel: 'Start',
                textExcerpt: 'Start',
                bounds: { x: 10, y: 20, width: 120, height: 40 },
                enrichmentMode: 'react_source_enriched',
                reactEnrichment: {
                    sourceKind: 'provider',
                    componentChain: [{ displayName: 'GeneratedButton' }],
                    sourceAnchor: {
                        status: 'workspace_relative',
                        displayPath: 'dist/Button.js',
                        relativePath: 'dist/Button.js',
                        workspaceFingerprint,
                    },
                },
            },
        });
        const selection = selectionState.selections[0];
        if (!selection) {
            throw new Error('Expected persisted browser selection.');
        }

        const draftState = await caller.session.upsertBrowserDesignerDraft({
            profileId,
            sessionId: session.id,
            selectionId: selection.id,
            applyMode: 'apply_with_agent',
            stylePatches: { color: '#ffffff' },
            inclusionState: 'included',
        });
        const draft = draftState.designerDrafts[0];
        if (!draft) {
            throw new Error('Expected designer draft.');
        }
        expect(draft.applyStatus).toBe('blocked_generated_source_anchor');
        expect(draftState.designDiagnostics.some((finding) => finding.category === 'source_anchor')).toBe(true);

        const queued = await caller.session.queueBrowserDesignerApplyIntent({
            profileId,
            sessionId: session.id,
            draftId: draft.id,
            topLevelTab: 'agent',
            modeKey: 'agent.code',
            runtimeOptions,
        });
        expect(queued).toMatchObject({ queued: false, reason: 'blocked_apply_status' });
    });
});
