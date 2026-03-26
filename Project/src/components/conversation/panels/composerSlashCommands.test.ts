import { describe, expect, it } from 'vitest';

import {
    buildComposerSlashCommandEntries,
    filterComposerSlashCommandEntries,
    moveComposerSlashHighlight,
    parseComposerSlashDraft,
    shouldInterceptSlashSubmit,
} from '@/web/components/conversation/panels/composerSlashCommands';

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
