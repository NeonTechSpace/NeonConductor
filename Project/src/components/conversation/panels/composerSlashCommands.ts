import type { RulesetDefinition, SkillfileDefinition, TopLevelTab } from '@/shared/contracts';

export type ComposerSlashCommandId = 'skills' | 'rules';

export interface ComposerSlashCommandDefinition {
    id: ComposerSlashCommandId;
    label: string;
    description: string;
}

export interface ParsedComposerSlashDraft {
    hasLeadingSlash: boolean;
    token: string;
    normalizedToken: string;
    query: string;
    exactCommandId?: ComposerSlashCommandId;
}

export interface ComposerSlashCommandEntry extends ComposerSlashCommandDefinition {
    available: boolean;
    unavailableReason?: string;
}

export interface ComposerSlashResultItemBase {
    key: string;
    label: string;
    description?: string;
    attached: boolean;
}

export interface ComposerSlashSkillItem extends ComposerSlashResultItemBase {
    kind: 'skill';
    assetKey: string;
    scope: SkillfileDefinition['scope'];
    presetKey?: SkillfileDefinition['presetKey'];
}

export interface ComposerSlashRuleItem extends ComposerSlashResultItemBase {
    kind: 'rule';
    assetKey: string;
    scope: RulesetDefinition['scope'];
    presetKey?: RulesetDefinition['presetKey'];
}

export type ComposerSlashResultItem = ComposerSlashSkillItem | ComposerSlashRuleItem;

export type ComposerSlashPopupState =
    | { kind: 'hidden' }
    | {
          kind: 'commands';
          typedQuery: string;
          exactCommandId?: ComposerSlashCommandId;
          items: ComposerSlashCommandEntry[];
          highlightIndex: number;
          emptyMessage: string;
      }
    | {
          kind: 'results';
          commandId: ComposerSlashCommandId;
          query: string;
          items: ComposerSlashResultItem[];
          highlightIndex: number;
          emptyMessage: string;
          warningMessage?: string;
      };

export const composerSlashCommandDefinitions: ComposerSlashCommandDefinition[] = [
    {
        id: 'skills',
        label: '/skills',
        description: 'Attach or remove session skills for the current agent/orchestrator run.',
    },
    {
        id: 'rules',
        label: '/rules',
        description: 'Attach or remove manual rules for the current agent/orchestrator session.',
    },
];

export function parseComposerSlashDraft(draftPrompt: string): ParsedComposerSlashDraft {
    if (!draftPrompt.startsWith('/')) {
        return {
            hasLeadingSlash: false,
            token: '',
            normalizedToken: '',
            query: '',
        };
    }

    const withoutSlash = draftPrompt.slice(1);
    const firstWhitespaceIndex = withoutSlash.search(/\s/);
    const token = firstWhitespaceIndex === -1 ? withoutSlash : withoutSlash.slice(0, firstWhitespaceIndex);
    const query = firstWhitespaceIndex === -1 ? '' : withoutSlash.slice(firstWhitespaceIndex + 1).replace(/^\s+/, '');
    const normalizedToken = token.trim().toLowerCase();
    const exactCommand = composerSlashCommandDefinitions.find((command) => command.id === normalizedToken);

    return {
        hasLeadingSlash: true,
        token,
        normalizedToken,
        query,
        ...(exactCommand ? { exactCommandId: exactCommand.id } : {}),
    };
}

export function buildComposerSlashCommandEntries(input: {
    topLevelTab: TopLevelTab;
    selectedSessionId?: string;
}): ComposerSlashCommandEntry[] {
    const available = input.topLevelTab !== 'chat' && input.selectedSessionId !== undefined;
    const unavailableReason =
        input.topLevelTab === 'chat'
            ? 'Available only for agent and orchestrator sessions.'
            : input.selectedSessionId === undefined
              ? 'Select a session before using slash commands.'
              : undefined;

    return composerSlashCommandDefinitions.map((command) => ({
        ...command,
        available,
        ...(unavailableReason ? { unavailableReason } : {}),
    }));
}

export function filterComposerSlashCommandEntries(
    entries: ComposerSlashCommandEntry[],
    typedQuery: string
): ComposerSlashCommandEntry[] {
    const normalizedQuery = typedQuery.trim().toLowerCase();
    if (normalizedQuery.length === 0) {
        return entries;
    }

    return entries.filter((entry) => {
        const haystacks = [entry.id, entry.label, entry.description].map((value) => value.toLowerCase());
        return haystacks.some((value) => value.includes(normalizedQuery));
    });
}

export function getFirstSelectableSlashIndex(items: Array<{ available?: boolean }>): number {
    return items.findIndex((item) => item.available !== false);
}

export function moveComposerSlashHighlight(input: {
    currentIndex: number;
    itemCount: number;
    direction: 'next' | 'previous';
}): number {
    if (input.itemCount <= 0) {
        return -1;
    }

    if (input.currentIndex < 0 || input.currentIndex >= input.itemCount) {
        return input.direction === 'next' ? 0 : input.itemCount - 1;
    }

    if (input.direction === 'next') {
        return (input.currentIndex + 1) % input.itemCount;
    }

    return (input.currentIndex - 1 + input.itemCount) % input.itemCount;
}

export function shouldInterceptSlashSubmit(input: { popupState: ComposerSlashPopupState }): boolean {
    if (input.popupState.kind === 'hidden') {
        return false;
    }

    if (input.popupState.kind === 'results') {
        return true;
    }

    if (input.popupState.exactCommandId) {
        return true;
    }

    return input.popupState.highlightIndex >= 0;
}
