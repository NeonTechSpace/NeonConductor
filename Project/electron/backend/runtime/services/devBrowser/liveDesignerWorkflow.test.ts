import { describe, expect, it } from 'vitest';

import { sessionDevBrowserDesignerStore } from '@/app/backend/persistence/stores';
import {
    createCaller,
    createSessionInScope,
    registerRuntimeContractHooks,
    runtimeContractProfileId,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

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
    });
});
