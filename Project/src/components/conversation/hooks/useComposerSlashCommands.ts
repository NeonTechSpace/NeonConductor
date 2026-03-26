import { useDeferredValue, useEffect, useState } from 'react';

import {
    buildComposerSlashCommandEntries,
    filterComposerSlashCommandEntries,
    getFirstSelectableSlashIndex,
    moveComposerSlashHighlight,
    parseComposerSlashDraft,
    type ComposerSlashPopupState,
    type ComposerSlashResultItem,
} from '@/web/components/conversation/panels/composerSlashCommands';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

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

function buildSkillItems(input: {
    attachedSkills: SkillfileDefinition[];
    resolvedSkills: SkillfileDefinition[];
}): ComposerSlashResultItem[] {
    const attachedAssetKeys = new Set(input.attachedSkills.map((skill) => skill.assetKey));
    const items: ComposerSlashResultItem[] = input.attachedSkills.map((skill) => ({
        key: `skill:${skill.assetKey}`,
        kind: 'skill',
        assetKey: skill.assetKey,
        label: skill.name,
        ...(skill.description ? { description: skill.description } : { description: skill.assetKey }),
        attached: true,
        scope: skill.scope,
        ...(skill.presetKey ? { presetKey: skill.presetKey } : {}),
    }));

    for (const skill of input.resolvedSkills) {
        if (attachedAssetKeys.has(skill.assetKey)) {
            continue;
        }

        items.push({
            key: `skill:${skill.assetKey}`,
            kind: 'skill',
            assetKey: skill.assetKey,
            label: skill.name,
            ...(skill.description ? { description: skill.description } : { description: skill.assetKey }),
            attached: false,
            scope: skill.scope,
            ...(skill.presetKey ? { presetKey: skill.presetKey } : {}),
        });
    }

    return items.slice(0, 8);
}

function buildRuleItems(input: {
    attachedRules: RulesetDefinition[];
    resolvedRules: RulesetDefinition[];
}): ComposerSlashResultItem[] {
    const attachedAssetKeys = new Set(input.attachedRules.map((rule) => rule.assetKey));
    const items: ComposerSlashResultItem[] = input.attachedRules.map((rule) => ({
        key: `rule:${rule.assetKey}`,
        kind: 'rule',
        assetKey: rule.assetKey,
        label: rule.name,
        ...(rule.description ? { description: rule.description } : { description: rule.assetKey }),
        attached: true,
        scope: rule.scope,
        ...(rule.presetKey ? { presetKey: rule.presetKey } : {}),
    }));

    for (const rule of input.resolvedRules.filter((resolvedRule) => resolvedRule.activationMode === 'manual')) {
        if (attachedAssetKeys.has(rule.assetKey)) {
            continue;
        }

        items.push({
            key: `rule:${rule.assetKey}`,
            kind: 'rule',
            assetKey: rule.assetKey,
            label: rule.name,
            ...(rule.description ? { description: rule.description } : { description: rule.assetKey }),
            attached: false,
            scope: rule.scope,
            ...(rule.presetKey ? { presetKey: rule.presetKey } : {}),
        });
    }

    return items.slice(0, 8);
}

export function useComposerSlashCommands(input: UseComposerSlashCommandsInput) {
    const utils = trpc.useUtils();
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
    const commandResultsEnabled =
        Boolean(exactCommand?.available) && input.topLevelTab !== 'chat' && input.selectedSessionId !== undefined;
    const registryQueryInput = {
        profileId: input.profileId,
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
        ...(deferredQuery.length > 0 ? { query: deferredQuery } : {}),
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        ...(input.sandboxId ? { sandboxId: input.sandboxId } : {}),
    };
    const searchSkillsQuery = trpc.registry.searchSkills.useQuery(registryQueryInput, {
        enabled: parsedDraft.exactCommandId === 'skills' && commandResultsEnabled,
        ...PROGRESSIVE_QUERY_OPTIONS,
    });
    const searchRulesQuery = trpc.registry.searchRules.useQuery(registryQueryInput, {
        enabled: parsedDraft.exactCommandId === 'rules' && commandResultsEnabled,
        ...PROGRESSIVE_QUERY_OPTIONS,
    });
    const setAttachedSkillsMutation = trpc.session.setAttachedSkills.useMutation();
    const setAttachedRulesMutation = trpc.session.setAttachedRules.useMutation();

    useEffect(() => {
        if (dismissedDraft !== undefined && dismissedDraft !== input.draftPrompt) {
            setDismissedDraft(undefined);
        }
    }, [dismissedDraft, input.draftPrompt]);

    const popupState: ComposerSlashPopupState = (() => {
        if (!parsedDraft.hasLeadingSlash || dismissedDraft === input.draftPrompt) {
            return { kind: 'hidden' };
        }

        if (exactCommand?.available && parsedDraft.exactCommandId === 'skills') {
            return {
                kind: 'results',
                commandId: 'skills',
                query: deferredQuery,
                items: buildSkillItems({
                    attachedSkills: input.attachedSkills,
                    resolvedSkills: searchSkillsQuery.data?.skillfiles ?? [],
                }),
                highlightIndex,
                emptyMessage:
                    deferredQuery.length > 0
                        ? 'No resolved skills match this search.'
                        : 'No resolved skills available.',
                ...(input.missingAttachedSkillKeys.length > 0
                    ? {
                          warningMessage: `Unresolved attached skills will only be pruned if you explicitly change the attachment set. Missing: ${input.missingAttachedSkillKeys.join(', ')}.`,
                      }
                    : {}),
            };
        }

        if (exactCommand?.available && parsedDraft.exactCommandId === 'rules') {
            return {
                kind: 'results',
                commandId: 'rules',
                query: deferredQuery,
                items: buildRuleItems({
                    attachedRules: input.attachedRules,
                    resolvedRules: searchRulesQuery.data?.rulesets ?? [],
                }),
                highlightIndex,
                emptyMessage:
                    deferredQuery.length > 0 ? 'No manual rules match this search.' : 'No manual rules available.',
                ...(input.missingAttachedRuleKeys.length > 0
                    ? {
                          warningMessage: `Unresolved attached rules will only be pruned if you explicitly change the attachment set. Missing: ${input.missingAttachedRuleKeys.join(', ')}.`,
                      }
                    : {}),
            };
        }

        return {
            kind: 'commands',
            typedQuery: parsedDraft.normalizedToken,
            ...(parsedDraft.exactCommandId ? { exactCommandId: parsedDraft.exactCommandId } : {}),
            items: filteredCommandEntries,
            highlightIndex,
            emptyMessage:
                filteredCommandEntries.length > 0
                    ? ''
                    : parsedDraft.normalizedToken.length > 0
                      ? `No slash commands match "/${parsedDraft.token}".`
                      : 'No slash commands are available in this context.',
        };
    })();

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
            const attachedAssetKeys = input.attachedSkills.map((skill) => skill.assetKey);
            const nextAssetKeys = selectedItem.attached
                ? attachedAssetKeys.filter((assetKey) => assetKey !== selectedItem.assetKey)
                : [...attachedAssetKeys, selectedItem.assetKey];

            await setAttachedSkillsMutation.mutateAsync({
                profileId: input.profileId,
                sessionId: input.selectedSessionId,
                topLevelTab: input.topLevelTab,
                modeKey: input.modeKey,
                assetKeys: nextAssetKeys,
            });
            await Promise.all([
                utils.session.getAttachedSkills.invalidate({
                    profileId: input.profileId,
                    sessionId: input.selectedSessionId,
                    topLevelTab: input.topLevelTab,
                    modeKey: input.modeKey,
                }),
                utils.registry.searchSkills.invalidate(registryQueryInput),
            ]);
            return { handled: true, clearDraft: true };
        }

        const attachedAssetKeys = input.attachedRules.map((rule) => rule.assetKey);
        const nextAssetKeys = selectedItem.attached
            ? attachedAssetKeys.filter((assetKey) => assetKey !== selectedItem.assetKey)
            : [...attachedAssetKeys, selectedItem.assetKey];

        await setAttachedRulesMutation.mutateAsync({
            profileId: input.profileId,
            sessionId: input.selectedSessionId,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            assetKeys: nextAssetKeys,
        });
        await Promise.all([
            utils.session.getAttachedRules.invalidate({
                profileId: input.profileId,
                sessionId: input.selectedSessionId,
                topLevelTab: input.topLevelTab,
                modeKey: input.modeKey,
            }),
            utils.registry.searchRules.invalidate(registryQueryInput),
        ]);
        return { handled: true, clearDraft: true };
    }

    return {
        popupState,
        hasVisiblePopup: popupState.kind !== 'hidden',
        isBusy: setAttachedSkillsMutation.isPending || setAttachedRulesMutation.isPending,
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
