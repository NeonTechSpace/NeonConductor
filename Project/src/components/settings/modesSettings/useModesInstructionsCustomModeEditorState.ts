import { useState } from 'react';

import type { CustomModeEditorDraft, CustomModeScope } from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';
import {
    createDefaultPreparedContextModeOverridesSnapshot,
    createEmptyCustomModeEditorDraft,
    getModeRoleTemplateOptions,
} from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';
import { trpc } from '@/web/trpc/client';

import type {
    ModeAuthoringRole,
    ModeDraftRecord,
    ModeRoleTemplateKey,
    PreparedContextEditablePromptLayerGroup,
    PreparedContextInjectionCheckpoint,
    PreparedContextModeOverrideValue,
    TopLevelTab,
} from '@/shared/contracts';

interface UseModesInstructionsCustomModeEditorStateInput {
    profileId: string;
    workspaceFingerprint?: string;
    clearFeedback: () => void;
    setErrorFeedback: (message: string) => void;
}

export function useModesInstructionsCustomModeEditorState(input: UseModesInstructionsCustomModeEditorStateInput) {
    const utils = trpc.useUtils();
    const [draft, setDraft] = useState<CustomModeEditorDraft | undefined>(undefined);
    const [isLoading, setIsLoading] = useState(false);

    async function loadEditor(loadInput: {
        scope: CustomModeScope;
        topLevelTab: TopLevelTab;
        modeKey: string;
    }): Promise<void> {
        setIsLoading(true);
        input.clearFeedback();
        try {
            const result = await utils.prompt.getCustomMode.fetch({
                profileId: input.profileId,
                topLevelTab: loadInput.topLevelTab,
                modeKey: loadInput.modeKey,
                scope: loadInput.scope,
                ...(loadInput.scope === 'workspace' && input.workspaceFingerprint
                    ? { workspaceFingerprint: input.workspaceFingerprint }
                    : {}),
            });
            setDraft({
                kind: 'edit',
                scope: result.mode.scope,
                modeKey: result.mode.modeKey,
                topLevelTab: result.mode.topLevelTab,
                slug: result.mode.slug,
                name: result.mode.name,
                authoringRole: result.mode.authoringRole,
                roleTemplate: result.mode.roleTemplate,
                description: result.mode.description ?? '',
                roleDefinition: result.mode.roleDefinition ?? '',
                customInstructions: result.mode.customInstructions ?? '',
                whenToUse: result.mode.whenToUse ?? '',
                tagsText: result.mode.tags?.join(', ') ?? '',
                promptLayerOverrides: result.mode.promptLayerOverrides ?? createDefaultPreparedContextModeOverridesSnapshot(),
                deleteConfirmed: false,
                sourceText: '',
            });
        } catch (error) {
            input.setErrorFeedback(error instanceof Error ? error.message : 'Custom mode could not be loaded.');
        } finally {
            setIsLoading(false);
        }
    }

    return {
        draft,
        isLoading,
        setDraft,
        openDraft: (draft: ModeDraftRecord) => {
            setDraft({
                kind: 'draft',
                draftId: draft.id,
                scope: draft.scope,
                slug: draft.mode.slug ?? '',
                name: draft.mode.name ?? '',
                authoringRole: draft.mode.authoringRole ?? 'chat',
                roleTemplate: draft.mode.roleTemplate ?? 'chat/default',
                description: draft.mode.description ?? '',
                roleDefinition: draft.mode.roleDefinition ?? '',
                customInstructions: draft.mode.customInstructions ?? '',
                whenToUse: draft.mode.whenToUse ?? '',
                tagsText: draft.mode.tags?.join(', ') ?? '',
                promptLayerOverrides: draft.mode.promptLayerOverrides ?? createDefaultPreparedContextModeOverridesSnapshot(),
                deleteConfirmed: false,
                sourceText: draft.sourceText ?? '',
                validationState: draft.validationState,
                validationErrors: draft.validationErrors,
            });
            input.clearFeedback();
        },
        openCreate: (scope: CustomModeScope) => {
            setDraft(createEmptyCustomModeEditorDraft(scope));
            input.clearFeedback();
        },
        openEdit: async (scope: CustomModeScope, topLevelTab: TopLevelTab, modeKey: string) => {
            await loadEditor({ scope, topLevelTab, modeKey });
        },
        openDelete: async (scope: CustomModeScope, topLevelTab: TopLevelTab, modeKey: string) => {
            await loadEditor({ scope, topLevelTab, modeKey });
        },
        close: () => {
            setDraft(undefined);
            input.clearFeedback();
        },
        setScope: (scope: CustomModeScope) => {
            setDraft((currentDraft) =>
                currentDraft?.kind === 'create'
                    ? {
                          ...currentDraft,
                          scope,
                      }
                    : currentDraft
            );
            input.clearFeedback();
        },
        setAuthoringRole: (authoringRole: ModeAuthoringRole) => {
            setDraft((currentDraft) =>
                currentDraft
                    ? {
                          ...currentDraft,
                          authoringRole,
                          roleTemplate: getModeRoleTemplateOptions(authoringRole)[0]?.roleTemplate ?? currentDraft.roleTemplate,
                      }
                    : currentDraft
            );
            input.clearFeedback();
        },
        setRoleTemplate: (roleTemplate: ModeRoleTemplateKey) => {
            setDraft((currentDraft) =>
                currentDraft
                    ? {
                          ...currentDraft,
                          roleTemplate,
                      }
                    : currentDraft
            );
            input.clearFeedback();
        },
        setField: (
            field:
                | 'slug'
                | 'name'
                | 'description'
                | 'roleDefinition'
                | 'customInstructions'
                | 'whenToUse'
                | 'tagsText'
                | 'sourceText',
            value: string
        ) => {
            setDraft((currentDraft) =>
                currentDraft
                    ? {
                          ...currentDraft,
                          [field]: value,
                      }
                    : currentDraft
            );
            input.clearFeedback();
        },
        setPromptLayerOverride: (
            group: PreparedContextEditablePromptLayerGroup,
            checkpoint: PreparedContextInjectionCheckpoint,
            value: PreparedContextModeOverrideValue
        ) => {
            setDraft((currentDraft) =>
                currentDraft
                    ? {
                          ...currentDraft,
                          promptLayerOverrides: {
                              ...currentDraft.promptLayerOverrides,
                              [group]: {
                                  ...currentDraft.promptLayerOverrides[group],
                                  [checkpoint]: value,
                              },
                          },
                      }
                    : currentDraft
            );
            input.clearFeedback();
        },
        setDeleteConfirmed: (value: boolean) => {
            setDraft((currentDraft) =>
                currentDraft
                    ? {
                          ...currentDraft,
                          deleteConfirmed: value,
                      }
                    : currentDraft
            );
            input.clearFeedback();
        },
    };
}
