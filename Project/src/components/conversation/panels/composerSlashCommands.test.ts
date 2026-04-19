import { describe, expect, it } from 'vitest';

import {
    buildComposerSlashInteractionState,
    buildComposerSlashCommandEntries,
    buildComposerSlashRuleItems,
    buildComposerSlashSkillItems,
    filterComposerSlashCommandEntries,
    moveComposerSlashHighlight,
    parseComposerSlashDraft,
    shouldInterceptSlashSubmit,
} from '@/web/components/conversation/panels/composerSlashCommands';

function createSkill(input: {
    id: string;
    assetKey: string;
    name: string;
    scope: 'global' | 'workspace';
    sourceKind: 'global_file' | 'workspace_file';
    precedence: number;
}) {
    return {
        ...input,
        profileId: 'prof_1',
        source: input.scope,
        bodyMarkdown: '',
        dynamicContextSources: [],
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    };
}

function createManualRule(input: {
    id: string;
    assetKey: string;
    name: string;
    scope: 'global' | 'workspace';
    sourceKind: 'global_file' | 'workspace_file';
    precedence: number;
}) {
    return {
        ...input,
        profileId: 'prof_1',
        source: input.scope,
        bodyMarkdown: '',
        activationMode: 'manual' as const,
        enabled: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    };
}

describe('composerSlashCommands', () => {
    it('parses known commands and inline query text from leading slash drafts', () => {
        expect(parseComposerSlashDraft('/skills debugger helpers')).toEqual({
            hasLeadingSlash: true,
            token: 'skills',
            normalizedToken: 'skills',
            query: 'debugger helpers',
            exactCommandId: 'skills',
        });

        expect(parseComposerSlashDraft('/rules   manual')).toEqual({
            hasLeadingSlash: true,
            token: 'rules',
            normalizedToken: 'rules',
            query: 'manual',
            exactCommandId: 'rules',
        });
    });

    it('keeps unknown slash drafts outside the exact-command path', () => {
        expect(parseComposerSlashDraft('/workflow branch')).toEqual({
            hasLeadingSlash: true,
            token: 'workflow',
            normalizedToken: 'workflow',
            query: 'branch',
        });
        expect(parseComposerSlashDraft('normal prompt')).toEqual({
            hasLeadingSlash: false,
            token: '',
            normalizedToken: '',
            query: '',
        });
    });

    it('gates slash commands to agent and orchestrator sessions', () => {
        const chatEntries = buildComposerSlashCommandEntries({
            topLevelTab: 'chat',
            selectedSessionId: 'sess_test',
        });
        const missingSessionEntries = buildComposerSlashCommandEntries({
            topLevelTab: 'agent',
        });
        const availableEntries = buildComposerSlashCommandEntries({
            topLevelTab: 'agent',
            selectedSessionId: 'sess_test',
        });

        expect(chatEntries.every((entry) => !entry.available)).toBe(true);
        expect(chatEntries[0]?.unavailableReason).toBe('Available only for agent and orchestrator sessions.');
        expect(missingSessionEntries.every((entry) => !entry.available)).toBe(true);
        expect(missingSessionEntries[0]?.unavailableReason).toBe('Select a session before using slash commands.');
        expect(availableEntries.every((entry) => entry.available)).toBe(true);
    });

    it('filters known commands by typed token text', () => {
        const entries = buildComposerSlashCommandEntries({
            topLevelTab: 'agent',
            selectedSessionId: 'sess_test',
        });

        expect(filterComposerSlashCommandEntries(entries, 'skill').map((entry) => entry.id)).toEqual(['skills']);
        expect(filterComposerSlashCommandEntries(entries, 'manual').map((entry) => entry.id)).toEqual(['rules']);
    });

    it('cycles slash highlight state through visible items', () => {
        expect(
            moveComposerSlashHighlight({
                currentIndex: -1,
                itemCount: 3,
                direction: 'next',
            })
        ).toBe(0);
        expect(
            moveComposerSlashHighlight({
                currentIndex: 0,
                itemCount: 3,
                direction: 'previous',
            })
        ).toBe(2);
        expect(
            moveComposerSlashHighlight({
                currentIndex: 2,
                itemCount: 3,
                direction: 'next',
            })
        ).toBe(0);
    });

    it('builds rules and skills result items from attached and resolved assets', () => {
        const skillItems = buildComposerSlashSkillItems({
            attachedSkills: [
                createSkill({
                    id: 'skill_1',
                    assetKey: 'skills/debug',
                    name: 'Debug',
                    scope: 'global',
                    sourceKind: 'global_file',
                    precedence: 1,
                }),
            ],
            resolvedSkills: [
                createSkill({
                    id: 'skill_1',
                    assetKey: 'skills/debug',
                    name: 'Debug',
                    scope: 'global',
                    sourceKind: 'global_file',
                    precedence: 1,
                }),
                createSkill({
                    id: 'skill_2',
                    assetKey: 'skills/review',
                    name: 'Review',
                    scope: 'workspace',
                    sourceKind: 'workspace_file',
                    precedence: 2,
                }),
            ],
        });
        const ruleItems = buildComposerSlashRuleItems({
            attachedRules: [
                createManualRule({
                    id: 'rule_1',
                    assetKey: 'rules/manual',
                    name: 'Manual',
                    scope: 'global',
                    sourceKind: 'global_file',
                    precedence: 1,
                }),
            ],
            resolvedRules: [
                createManualRule({
                    id: 'rule_1',
                    assetKey: 'rules/manual',
                    name: 'Manual',
                    scope: 'global',
                    sourceKind: 'global_file',
                    precedence: 1,
                }),
                createManualRule({
                    id: 'rule_2',
                    assetKey: 'rules/review',
                    name: 'Review',
                    scope: 'workspace',
                    sourceKind: 'workspace_file',
                    precedence: 2,
                }),
            ],
        });

        expect(skillItems.map((item) => `${item.kind}:${item.assetKey}:${String(item.attached)}`)).toEqual([
            'skill:skills/debug:true',
            'skill:skills/review:false',
        ]);
        expect(ruleItems.map((item) => `${item.kind}:${item.assetKey}:${String(item.attached)}`)).toEqual([
            'rule:rules/manual:true',
            'rule:rules/review:false',
        ]);
    });

    it('builds result popup state from exact slash commands', () => {
        const commandEntries = buildComposerSlashCommandEntries({
            topLevelTab: 'agent',
            selectedSessionId: 'sess_test',
        });
        const exactCommand = commandEntries.find((entry) => entry.id === 'skills');
        const interactionState = buildComposerSlashInteractionState({
            draftPrompt: '/skills debug',
            dismissedDraft: undefined,
            highlightIndex: 0,
            commandEntries,
            exactCommand,
            filteredCommandEntries: commandEntries,
            ruleItems: [],
            skillItems: buildComposerSlashSkillItems({
                attachedSkills: [],
                resolvedSkills: [
                    createSkill({
                        id: 'skill_1',
                        assetKey: 'skills/debug',
                        name: 'Debug',
                        scope: 'global',
                        sourceKind: 'global_file',
                        precedence: 1,
                    }),
                ],
            }),
            query: 'debug',
            missingAttachedRuleKeys: [],
            missingAttachedSkillKeys: ['skills/missing'],
        });

        expect(interactionState.hasVisiblePopup).toBe(true);
        expect(interactionState.popupState.kind).toBe('results');
        if (interactionState.popupState.kind !== 'results') {
            throw new Error('expected results popup');
        }
        expect(interactionState.popupState.commandId).toBe('skills');
        expect(interactionState.popupState.warningMessage).toContain('skills/missing');
        expect(interactionState.popupState.items).toHaveLength(1);
    });

    it('intercepts enter only for real slash popup states', () => {
        expect(shouldInterceptSlashSubmit({ popupState: { kind: 'hidden' } })).toBe(false);
        expect(
            shouldInterceptSlashSubmit({
                popupState: {
                    kind: 'commands',
                    typedQuery: 'workflow',
                    items: [],
                    highlightIndex: -1,
                    emptyMessage: 'No slash commands match.',
                },
            })
        ).toBe(false);
        expect(
            shouldInterceptSlashSubmit({
                popupState: {
                    kind: 'commands',
                    typedQuery: 'skills',
                    exactCommandId: 'skills',
                    items: [],
                    highlightIndex: -1,
                    emptyMessage: '',
                },
            })
        ).toBe(true);
        expect(
            shouldInterceptSlashSubmit({
                popupState: {
                    kind: 'results',
                    commandId: 'rules',
                    query: 'manual',
                    items: [],
                    highlightIndex: -1,
                    emptyMessage: 'No manual rules available.',
                },
            })
        ).toBe(true);
    });
});
