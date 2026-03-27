import { useDeferredValue, useEffect, useState } from 'react';

import {
    buildComposerSlashInteractionState,
    buildComposerSlashRuleItems,
    buildComposerSlashSkillItems,
    buildComposerSlashCommandEntries,
    filterComposerSlashCommandEntries,
    getFirstSelectableSlashIndex,
    moveComposerSlashHighlight,
    parseComposerSlashDraft,
} from '@/web/components/conversation/panels/composerSlashCommands';
import { useContextAssetAttachmentController } from '@/web/components/conversation/panels/useContextAssetAttachmentController';

import type { EntityId, RulesetDefinition, SkillfileDefinition, TopLevelTab } from '@/shared/contracts';

interface UseComposerSlashCommandsInput {
    draftPrompt: string;
    profileId: string;
    selectedSessionId?: EntityId<'sess'>;
    topLevelTab: TopLevelTab;
    modeKey: string;
    workspaceFingerprint?: string;
    sandboxId?: EntityId<'sb'>;
    attachedRules: RulesetDefinition[];
    missingAttachedRuleKeys: string[];
    attachedSkills: SkillfileDefinition[];
    missingAttachedSkillKeys: string[];
}

export type SlashAcceptResult = { handled: false } | { handled: true; nextDraft?: string; clearDraft?: boolean };

export function useComposerSlashCommands(input: UseComposerSlashCommandsInput) {
    const [dismissedDraft, setDismissedDraft] = useState<string | undefined>(undefined);
    const [highlightIndex, setHighlightIndex] = useState(-1);
    const parsedDraft = parseComposerSlashDraft(input.draftPrompt);
    const deferredQuery = useDeferredValue(parsedDraft.query);
    const commandEntries = buildComposerSlashCommandEntries({
        topLevelTab: input.topLevelTab,
        ...(input.selectedSessionId ? { selectedSessionId: input.selectedSessionId } : {}),
    });
    const filteredCommandEntries = filterComposerSlashCommandEntries(commandEntries, parsedDraft.normalizedToken);
    const exactCommand = parsedDraft.exactCommandId
        ? commandEntries.find((entry) => entry.id === parsedDraft.exactCommandId)
        : undefined;
    const searchEnabled =
        Boolean(exactCommand?.available) && input.topLevelTab !== 'chat' && input.selectedSessionId !== undefined;
    const attachmentController = useContextAssetAttachmentController({
        profileId: input.profileId,
        ...(input.selectedSessionId ? { sessionId: input.selectedSessionId } : {}),
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        ...(input.sandboxId ? { sandboxId: input.sandboxId } : {}),
        query: deferredQuery,
        searchEnabled,
        attachedRules: input.attachedRules,
        missingAttachedRuleKeys: input.missingAttachedRuleKeys,
        attachedSkills: input.attachedSkills,
        missingAttachedSkillKeys: input.missingAttachedSkillKeys,
    });

    useEffect(() => {
        if (dismissedDraft !== undefined && dismissedDraft !== input.draftPrompt) {
            setDismissedDraft(undefined);
        }
    }, [dismissedDraft, input.draftPrompt]);

    const interactionState = buildComposerSlashInteractionState({
        draftPrompt: input.draftPrompt,
        dismissedDraft,
        highlightIndex,
        commandEntries,
        exactCommand,
        filteredCommandEntries,
        ruleItems: buildComposerSlashRuleItems({
            attachedRules: attachmentController.readModel.attachedRules,
            resolvedRules: attachmentController.readModel.resolvedManualRules,
        }),
        skillItems: buildComposerSlashSkillItems({
            attachedSkills: attachmentController.readModel.attachedSkills,
            resolvedSkills: attachmentController.readModel.resolvedSkills,
        }),
        query: deferredQuery,
        missingAttachedRuleKeys: attachmentController.readModel.missingAttachedRuleKeys,
        missingAttachedSkillKeys: attachmentController.readModel.missingAttachedSkillKeys,
    });
    const popupState = interactionState.popupState;

    useEffect(() => {
        if (popupState.kind === 'hidden') {
            if (highlightIndex !== -1) {
                setHighlightIndex(-1);
            }
            return;
        }

        if (popupState.items.length === 0) {
            if (highlightIndex !== -1) {
                setHighlightIndex(-1);
            }
            return;
        }

        const nextIndex =
            popupState.kind === 'commands'
                ? getFirstSelectableSlashIndex(popupState.items)
                : highlightIndex < 0 || highlightIndex >= popupState.items.length
                  ? 0
                  : highlightIndex;
        if (nextIndex !== highlightIndex) {
            setHighlightIndex(nextIndex);
        }
    }, [highlightIndex, popupState]);

    async function acceptHighlighted(): Promise<SlashAcceptResult> {
        if (popupState.kind === 'hidden') {
            return { handled: false };
        }

        if (popupState.kind === 'commands') {
            if (popupState.exactCommandId && !exactCommand?.available) {
                return { handled: true };
            }

            const selectedCommand = popupState.items[popupState.highlightIndex];
            if (!selectedCommand || !selectedCommand.available) {
                return { handled: false };
            }

            return {
                handled: true,
                nextDraft: `/${selectedCommand.id} `,
            };
        }

        if (popupState.highlightIndex < 0 || input.selectedSessionId === undefined) {
            return { handled: true };
        }

        const selectedItem = popupState.items[popupState.highlightIndex];
        if (!selectedItem) {
            return { handled: true };
        }

        if (selectedItem.kind === 'skill') {
            await attachmentController.toggleSkill(selectedItem.assetKey);
            return { handled: true, clearDraft: true };
        }

        await attachmentController.toggleRule(selectedItem.assetKey);
        return { handled: true, clearDraft: true };
    }

    return {
        popupState,
        hasVisiblePopup: interactionState.hasVisiblePopup,
        isBusy: attachmentController.isBusy,
        dismiss: () => {
            if (parsedDraft.hasLeadingSlash) {
                setDismissedDraft(input.draftPrompt);
            }
        },
        moveHighlight: (direction: 'next' | 'previous') => {
            if (popupState.kind === 'hidden') {
                return;
            }

            setHighlightIndex((current) =>
                moveComposerSlashHighlight({
                    currentIndex: current,
                    itemCount: popupState.items.length,
                    direction,
                })
            );
        },
        acceptHighlighted,
    };
}
