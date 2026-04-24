import { useState } from 'react';

import type { RegistryPromotionDialogProps } from '@/web/components/conversation/panels/registryPromotionDialog';
import { trpc } from '@/web/trpc/client';

import type {
    EntityId,
    RegistryApplyPromotionResult,
    RegistryPromotionDraft,
    RegistryPromotionSource,
    RegistryPromotionSourceSummary,
    TopLevelTab,
} from '@/shared/contracts';

interface UseRegistryPromotionControllerInput {
    profileId: string;
    workspaceFingerprint?: string;
    selectedSessionId?: EntityId<'sess'>;
    topLevelTab: TopLevelTab;
    modeKey: string;
}

interface PromotionState {
    source: RegistryPromotionSource;
    sourceSummary?: RegistryPromotionSourceSummary;
    sourceDigest?: string;
    draft?: RegistryPromotionDraft;
    overwrite: boolean;
    errorMessage?: string;
    success?: RegistryApplyPromotionResult['promoted'];
}

function createInitialTargeting(input: { topLevelTab: TopLevelTab; modeKey: string }) {
    return {
        targetKind: 'exact_mode' as const,
        targetMode: {
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
        },
    };
}

export function useRegistryPromotionController({
    profileId,
    workspaceFingerprint,
    selectedSessionId,
    topLevelTab,
    modeKey,
}: UseRegistryPromotionControllerInput) {
    const utils = trpc.useUtils();
    const [state, setState] = useState<PromotionState | undefined>(undefined);
    const preparePromotionMutation = trpc.registry.preparePromotion.useMutation();
    const applyPromotionMutation = trpc.registry.applyPromotion.useMutation();

    async function openPromotion(source: RegistryPromotionSource) {
        const scope = workspaceFingerprint ? 'workspace' : 'global';
        setState({
            source,
            overwrite: false,
        });

        try {
            const prepared = await preparePromotionMutation.mutateAsync({
                profileId,
                source,
                target: 'rule',
                scope,
                ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
                targeting: createInitialTargeting({ topLevelTab, modeKey }),
            });
            setState({
                source,
                sourceSummary: prepared.source,
                sourceDigest: prepared.source.digest,
                draft: prepared.draft,
                overwrite: false,
            });
        } catch (error) {
            setState({
                source,
                overwrite: false,
                errorMessage: error instanceof Error ? error.message : 'Promotion preparation failed.',
            });
        }
    }

    async function applyPromotion() {
        if (!state?.draft || !state.sourceDigest) {
            return;
        }
        setState((current) => {
            if (!current) {
                return current;
            }
            const nextState = { ...current };
            delete nextState.errorMessage;
            delete nextState.success;
            return nextState;
        });
        try {
            const result = await applyPromotionMutation.mutateAsync({
                profileId,
                source: state.source,
                sourceDigest: state.sourceDigest,
                draft: state.draft,
                overwrite: state.overwrite,
            });
            await Promise.all([
                utils.registry.listResolved.invalidate(),
                utils.registry.searchRules.invalidate(),
                utils.registry.searchSkills.invalidate(),
                utils.session.getAttachedRules.invalidate(),
                utils.session.getAttachedSkills.invalidate(),
            ]);
            setState((current) =>
                current
                    ? (() => {
                          const nextState = { ...current };
                          delete nextState.errorMessage;
                          return {
                              ...nextState,
                              success: result.promoted,
                          };
                      })()
                    : current
            );
        } catch (error) {
            setState((current) =>
                current
                    ? {
                          ...current,
                          errorMessage: error instanceof Error ? error.message : 'Promotion apply failed.',
                      }
                    : current
            );
        }
    }

    function closePromotion() {
        if (preparePromotionMutation.isPending || applyPromotionMutation.isPending) {
            return;
        }
        setState(undefined);
    }

    return {
        openMessagePromotion: (messageId: EntityId<'msg'>) => {
            if (!selectedSessionId) {
                return;
            }
            void openPromotion({
                kind: 'message',
                sessionId: selectedSessionId,
                messageId,
            });
        },
        openPromotion,
        openArtifactWindowPromotion: (input: {
            sessionId: EntityId<'sess'>;
            messagePartId: EntityId<'part'>;
            startLine: number;
            lineCount: number;
        }) => {
            void openPromotion({
                kind: 'tool_result_artifact_window',
                ...input,
            });
        },
        dialogProps: {
            open: state !== undefined,
            busy: preparePromotionMutation.isPending || applyPromotionMutation.isPending,
            ...(state?.sourceSummary ? { source: state.sourceSummary } : {}),
            ...(state?.draft ? { draft: state.draft } : {}),
            ...(state?.errorMessage ? { errorMessage: state.errorMessage } : {}),
            ...(state?.success ? { success: state.success } : {}),
            overwrite: state?.overwrite ?? false,
            onDraftChange: (draft) => {
                setState((current) => (current ? { ...current, draft } : current));
            },
            onOverwriteChange: (overwrite) => {
                setState((current) => (current ? { ...current, overwrite } : current));
            },
            onApply: () => {
                void applyPromotion();
            },
            onClose: closePromotion,
        } satisfies RegistryPromotionDialogProps,
    };
}
