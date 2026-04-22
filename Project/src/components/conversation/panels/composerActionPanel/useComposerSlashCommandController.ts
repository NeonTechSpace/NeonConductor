import { useState } from 'react';

import {
    useComposerSlashCommands,
    type SlashAcceptResult,
} from '@/web/components/conversation/hooks/useComposerSlashCommands';
import type { ComposerActionPanelProps } from '@/web/components/conversation/panels/composerActionPanel/types';

function readComposerActionErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Slash command action failed.';
}

export async function handleComposerSlashAcceptance(input: {
    acceptHighlighted: () => Promise<SlashAcceptResult>;
    draftPrompt: string;
    submitWhenUnhandled: boolean;
    onSubmitPrompt: (prompt: string, browserContext?: never) => void;
    onSetDraftPrompt: (prompt: string) => void;
    onFocusPrompt: () => void;
    onError: (message: string | undefined) => void;
}): Promise<void> {
    input.onError(undefined);

    try {
        const slashResult = await input.acceptHighlighted();
        if (!slashResult.handled) {
            if (input.submitWhenUnhandled) {
                input.onSubmitPrompt(input.draftPrompt);
            }
            return;
        }

        if (slashResult.clearDraft) {
            input.onSetDraftPrompt('');
            input.onFocusPrompt();
            return;
        }
        if (slashResult.nextDraft !== undefined) {
            input.onSetDraftPrompt(slashResult.nextDraft);
            input.onFocusPrompt();
        }
    } catch (error) {
        input.onError(readComposerActionErrorMessage(error));
    }
}

export function useComposerSlashCommandController(
    input: Pick<
        ComposerActionPanelProps,
        | 'profileId'
        | 'selectedSessionId'
        | 'topLevelTab'
        | 'activeModeKey'
        | 'workspaceFingerprint'
        | 'sandboxId'
        | 'attachedRules'
        | 'missingAttachedRuleKeys'
        | 'attachedSkills'
        | 'missingAttachedSkillKeys'
        | 'onSubmitPrompt'
    > & {
        draftPrompt: string;
        onSetDraftPrompt: (prompt: string) => void;
        onFocusPrompt: () => void;
    }
) {
    const [slashCommandError, setSlashCommandError] = useState<string | undefined>(undefined);
    const slashCommands = useComposerSlashCommands({
        draftPrompt: input.draftPrompt,
        profileId: input.profileId,
        ...(input.selectedSessionId ? { selectedSessionId: input.selectedSessionId } : {}),
        topLevelTab: input.topLevelTab,
        modeKey: input.activeModeKey,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        ...(input.sandboxId ? { sandboxId: input.sandboxId } : {}),
        attachedRules: input.attachedRules ?? [],
        missingAttachedRuleKeys: input.missingAttachedRuleKeys ?? [],
        attachedSkills: input.attachedSkills ?? [],
        missingAttachedSkillKeys: input.missingAttachedSkillKeys ?? [],
    });

    return {
        slashCommands,
        slashCommandError,
        clearSlashCommandError() {
            setSlashCommandError(undefined);
        },
        async handleSlashCommandAccept(submitWhenUnhandled: boolean) {
            await handleComposerSlashAcceptance({
                acceptHighlighted: slashCommands.acceptHighlighted,
                draftPrompt: input.draftPrompt,
                submitWhenUnhandled,
                onSubmitPrompt: input.onSubmitPrompt,
                onSetDraftPrompt: input.onSetDraftPrompt,
                onFocusPrompt: input.onFocusPrompt,
                onError: setSlashCommandError,
            });
        },
    };
}
