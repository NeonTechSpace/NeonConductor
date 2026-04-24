import { useState } from 'react';

import type { RegistryPromotionDialogProps } from '@/web/components/conversation/panels/registryPromotionDialog';
import { trpc } from '@/web/trpc/client';

import type {
    EntityId,
    MemoryApplyPromotionResult,
    MemoryPromotionDraft,
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

type PromotionDraft = RegistryPromotionDraft | MemoryPromotionDraft;
type PromotionSuccess = RegistryApplyPromotionResult['promoted'] | MemoryApplyPromotionResult['promoted'];
type PromotionTarget = RegistryPromotionDraft['target'] | MemoryPromotionDraft['target'];

interface PromotionState {
    source: RegistryPromotionSource;
    sourceSummary?: RegistryPromotionSourceSummary;
    sourceDigest?: string;
    draft?: PromotionDraft;
    overwrite: boolean;
    errorMessage?: string;
    success?: PromotionSuccess;
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
    const prepareRegistryPromotionMutation = trpc.registry.preparePromotion.useMutation();
    const applyRegistryPromotionMutation = trpc.registry.applyPromotion.useMutation();
    const prepareMemoryPromotionMutation = trpc.memory.preparePromotion.useMutation();
    const applyMemoryPromotionMutation = trpc.memory.applyPromotion.useMutation();
    const busy =
        prepareRegistryPromotionMutation.isPending ||
        applyRegistryPromotionMutation.isPending ||
        prepareMemoryPromotionMutation.isPending ||
        applyMemoryPromotionMutation.isPending;

    async function preparePromotion(source: RegistryPromotionSource, target: PromotionTarget) {
        if (target === 'memory') {
            return prepareMemoryPromotionMutation.mutateAsync({
                profileId,
                source,
                ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
            });
        }

        const scope = workspaceFingerprint ? 'workspace' : 'global';
        return prepareRegistryPromotionMutation.mutateAsync({
            profileId,
            source,
            target,
            scope,
            ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
            targeting: createInitialTargeting({ topLevelTab, modeKey }),
        });
    }

    async function openPromotion(source: RegistryPromotionSource) {
        setState({
            source,
            overwrite: false,
        });

        try {
            const prepared = await preparePromotion(source, 'rule');
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

    async function changeTarget(target: PromotionTarget) {
        if (!state || state.draft?.target === target) {
            return;
        }
        const source = state.source;
        setState((current) => {
            if (!current) {
                return current;
            }
            const nextState = { ...current };
            delete nextState.errorMessage;
            delete nextState.success;
            delete nextState.draft;
            return nextState;
        });

        try {
            const prepared = await preparePromotion(source, target);
            setState((current) =>
                current
                    ? {
                          ...current,
                          sourceSummary: prepared.source,
                          sourceDigest: prepared.source.digest,
                          draft: prepared.draft,
                          overwrite: false,
                      }
                    : current
            );
        } catch (error) {
            setState((current) =>
                current
                    ? {
                          ...current,
                          errorMessage: error instanceof Error ? error.message : 'Promotion preparation failed.',
                      }
                    : current
            );
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
            if (state.draft.target === 'memory') {
                const result = await applyMemoryPromotionMutation.mutateAsync({
                    profileId,
                    source: state.source,
                    sourceDigest: state.sourceDigest,
                    draft: state.draft,
                });
                await Promise.all([
                    utils.memory.list.invalidate({ profileId }),
                    utils.memory.projectionStatus.invalidate(),
                    utils.memory.scanProjectionEdits.invalidate(),
                ]);
                setSuccess(result.promoted);
                return;
            }

            const result = await applyRegistryPromotionMutation.mutateAsync({
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
            setSuccess(result.promoted);
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

    function setSuccess(success: PromotionSuccess) {
        setState((current) =>
            current
                ? (() => {
                      const nextState = { ...current };
                      delete nextState.errorMessage;
                      return {
                          ...nextState,
                          success,
                      };
                  })()
                : current
        );
    }

    function closePromotion() {
        if (busy) {
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
            busy,
            ...(state?.sourceSummary ? { source: state.sourceSummary } : {}),
            ...(state?.draft ? { draft: state.draft } : {}),
            ...(state?.errorMessage ? { errorMessage: state.errorMessage } : {}),
            ...(state?.success ? { success: state.success } : {}),
            overwrite: state?.overwrite ?? false,
            onTargetChange: (target) => {
                void changeTarget(target);
            },
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
