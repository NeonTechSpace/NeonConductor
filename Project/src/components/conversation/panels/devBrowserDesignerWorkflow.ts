import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';

import type {
    DesignerDraftFormState,
    DevBrowserPanelProps,
} from '@/web/components/conversation/panels/devBrowserPanelModel';
import { trpc } from '@/web/trpc/client';

import type {
    BrowserDesignerDraft,
    BrowserSelectionRecord,
    EntityId,
    SessionDevBrowserState,
} from '@/shared/contracts';

type DesignerActionChip = 'bolder' | 'quieter' | 'polish' | 'colorize' | 'layout' | 'animate' | 'delight';

export type DesignerIntentFormState = {
    actionChip?: DesignerActionChip;
    intentText: string;
    requestedVariantCount: number;
};

export function useDevBrowserDesignerWorkflow(input: {
    profileId: string;
    sessionId?: EntityId<'sess'>;
    browserState?: SessionDevBrowserState;
    runConfig: Pick<
        DevBrowserPanelProps,
        | 'topLevelTab'
        | 'modeKey'
        | 'runtimeOptions'
        | 'workspaceFingerprint'
        | 'sandboxId'
        | 'providerId'
        | 'modelId'
    >;
    setDesignerDraftForms: Dispatch<SetStateAction<Record<string, DesignerDraftFormState>>>;
    invalidateBrowserQueries: () => Promise<void>;
    setFeedback: (message: string | undefined) => void;
}) {
    const createLiveSessionMutation = trpc.session.createBrowserDesignerLiveSession.useMutation();
    const createAnnotationMutation = trpc.session.createBrowserDesignerAnnotation.useMutation();
    const startGenerationMutation = trpc.session.startBrowserDesignerVariantGeneration.useMutation();
    const activateVariantMutation = trpc.session.activateBrowserDesignerVariant.useMutation();
    const tuneVariantMutation = trpc.session.tuneBrowserDesignerVariant.useMutation();
    const acceptVariantMutation = trpc.session.acceptBrowserDesignerVariant.useMutation();
    const discardVariantMutation = trpc.session.discardBrowserDesignerVariant.useMutation();
    const queueApplyIntentMutation = trpc.session.queueBrowserDesignerApplyIntent.useMutation();

    const [intentForms, setIntentForms] = useState<Record<string, DesignerIntentFormState>>({});
    const [annotationForms, setAnnotationForms] = useState<Record<string, string>>({});

    const draftsBySelectionId = useMemo(() => {
        const drafts = new Map<EntityId<'bsel'>, BrowserDesignerDraft>();
        for (const draft of input.browserState?.designerDrafts ?? []) {
            drafts.set(draft.selectionId, draft);
        }
        return drafts;
    }, [input.browserState?.designerDrafts]);

    const liveSessionsBySelectionId = useMemo(() => {
        const sessions = new Map<EntityId<'bsel'>, NonNullable<typeof input.browserState>['designerLiveSessions'][number]>();
        for (const liveSession of input.browserState?.designerLiveSessions ?? []) {
            const current = sessions.get(liveSession.selectionId);
            if (!current || liveSession.updatedAt > current.updatedAt) {
                sessions.set(liveSession.selectionId, liveSession);
            }
        }
        return sessions;
    }, [input.browserState?.designerLiveSessions]);

    const annotationsBySessionId = useMemo(() => {
        const annotations = new Map<string, NonNullable<typeof input.browserState>['designerAnnotations']>();
        for (const annotation of input.browserState?.designerAnnotations ?? []) {
            const existing = annotations.get(annotation.designerSessionId) ?? [];
            existing.push(annotation);
            annotations.set(annotation.designerSessionId, existing);
        }
        return annotations;
    }, [input.browserState?.designerAnnotations]);

    const variantsBySessionId = useMemo(() => {
        const variants = new Map<string, NonNullable<typeof input.browserState>['designerVariants']>();
        for (const variant of input.browserState?.designerVariants ?? []) {
            const existing = variants.get(variant.designerSessionId) ?? [];
            existing.push(variant);
            variants.set(variant.designerSessionId, existing);
        }
        return variants;
    }, [input.browserState?.designerVariants]);

    function updateDraftForm(selectionId: EntityId<'bsel'>, formState: DesignerDraftFormState) {
        input.setDesignerDraftForms((current) => ({
            ...current,
            [selectionId]: formState,
        }));
    }

    async function createLiveSession(selectionId: EntityId<'bsel'>) {
        if (!input.sessionId) {
            return;
        }
        const intentForm = intentForms[selectionId] ?? {
            intentText: '',
            requestedVariantCount: 3,
        };
        const intentText = intentForm.intentText.trim();
        if (!intentText) {
            input.setFeedback('Describe the design intent before starting a live designer session.');
            return;
        }
        await createLiveSessionMutation.mutateAsync({
            profileId: input.profileId,
            sessionId: input.sessionId,
            selectionId,
            ...(intentForm.actionChip ? { actionChip: intentForm.actionChip } : {}),
            intentText,
            requestedVariantCount: intentForm.requestedVariantCount,
        });
        await input.invalidateBrowserQueries();
        input.setFeedback(undefined);
    }

    async function createAnnotation(designerSessionId: EntityId<'bdsess'>, selection: BrowserSelectionRecord) {
        if (!input.sessionId) {
            return;
        }
        const annotationText = annotationForms[designerSessionId]?.trim();
        if (!annotationText) {
            input.setFeedback('Write an annotation before staging it.');
            return;
        }
        await createAnnotationMutation.mutateAsync({
            profileId: input.profileId,
            sessionId: input.sessionId,
            designerSessionId,
            kind: 'comment',
            text: annotationText,
            geometry: {
                x: selection.bounds.x,
                y: selection.bounds.y,
                width: selection.bounds.width,
                height: selection.bounds.height,
            },
            ...(selection.cropAttachmentId ? { cropAttachmentId: selection.cropAttachmentId } : {}),
        });
        setAnnotationForms((current) => ({ ...current, [designerSessionId]: '' }));
        await input.invalidateBrowserQueries();
        input.setFeedback(undefined);
    }

    async function startGeneration(designerSessionId: EntityId<'bdsess'>) {
        if (!input.sessionId) {
            return;
        }
        const result = await startGenerationMutation.mutateAsync({
            profileId: input.profileId,
            sessionId: input.sessionId,
            designerSessionId,
            topLevelTab: input.runConfig.topLevelTab,
            modeKey: input.runConfig.modeKey,
            runtimeOptions: input.runConfig.runtimeOptions,
            ...(input.runConfig.workspaceFingerprint ? { workspaceFingerprint: input.runConfig.workspaceFingerprint } : {}),
            ...(input.runConfig.sandboxId ? { sandboxId: input.runConfig.sandboxId } : {}),
            ...(input.runConfig.providerId ? { providerId: input.runConfig.providerId } : {}),
            ...(input.runConfig.modelId ? { modelId: input.runConfig.modelId } : {}),
        });
        await input.invalidateBrowserQueries();
        input.setFeedback(result.accepted ? undefined : result.message ?? result.reason);
    }

    async function activateVariant(designerSessionId: EntityId<'bdsess'>, variantId: EntityId<'bdvar'>) {
        if (!input.sessionId) {
            return;
        }
        await activateVariantMutation.mutateAsync({
            profileId: input.profileId,
            sessionId: input.sessionId,
            designerSessionId,
            variantId,
        });
        await input.invalidateBrowserQueries();
    }

    async function tuneVariant(variant: NonNullable<typeof input.browserState>['designerVariants'][number]) {
        if (!input.sessionId) {
            return;
        }
        await tuneVariantMutation.mutateAsync({
            profileId: input.profileId,
            sessionId: input.sessionId,
            designerSessionId: variant.designerSessionId,
            variantId: variant.id,
            stylePatches: variant.stylePatches,
            ...(variant.textContentOverride ? { textContentOverride: variant.textContentOverride } : {}),
        });
        await input.invalidateBrowserQueries();
    }

    async function acceptVariant(designerSessionId: EntityId<'bdsess'>, variantId: EntityId<'bdvar'>) {
        if (!input.sessionId) {
            return;
        }
        await acceptVariantMutation.mutateAsync({
            profileId: input.profileId,
            sessionId: input.sessionId,
            designerSessionId,
            variantId,
            applyMode: 'apply_with_agent',
            inclusionState: 'included',
        });
        await input.invalidateBrowserQueries();
    }

    async function discardVariant(designerSessionId: EntityId<'bdsess'>, variantId: EntityId<'bdvar'>) {
        if (!input.sessionId) {
            return;
        }
        await discardVariantMutation.mutateAsync({
            profileId: input.profileId,
            sessionId: input.sessionId,
            designerSessionId,
            variantId,
        });
        await input.invalidateBrowserQueries();
    }

    async function queueApplyIntent(draftId: EntityId<'bdsn'>) {
        if (!input.sessionId) {
            return;
        }
        const result = await queueApplyIntentMutation.mutateAsync({
            profileId: input.profileId,
            sessionId: input.sessionId,
            draftId,
            topLevelTab: input.runConfig.topLevelTab,
            modeKey: input.runConfig.modeKey,
            runtimeOptions: input.runConfig.runtimeOptions,
            ...(input.runConfig.workspaceFingerprint ? { workspaceFingerprint: input.runConfig.workspaceFingerprint } : {}),
            ...(input.runConfig.sandboxId ? { sandboxId: input.runConfig.sandboxId } : {}),
            ...(input.runConfig.providerId ? { providerId: input.runConfig.providerId } : {}),
            ...(input.runConfig.modelId ? { modelId: input.runConfig.modelId } : {}),
        });
        await input.invalidateBrowserQueries();
        input.setFeedback(result.message);
    }

    return {
        draftsBySelectionId,
        liveSessionsBySelectionId,
        annotationsBySessionId,
        variantsBySessionId,
        intentForms,
        setIntentForms,
        annotationForms,
        setAnnotationForms,
        generationBusy: startGenerationMutation.isPending,
        applyQueueBusy: queueApplyIntentMutation.isPending,
        updateDraftForm,
        createLiveSession,
        createAnnotation,
        startGeneration,
        activateVariant,
        tuneVariant,
        acceptVariant,
        discardVariant,
        queueApplyIntent,
    };
}
