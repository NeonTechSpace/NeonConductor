import { useState } from 'react';

import type { CustomModeEditorDraft, CustomModeScope } from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';
import {
    createEmptyCustomModeEditorDraft,
    toggleListValue,
    toggleToolCapability,
} from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';
import { trpc } from '@/web/trpc/client';

import type {
    BehaviorFlag,
    RuntimeRequirementProfile,
    ToolCapability,
    TopLevelTab,
    WorkflowCapability,
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
                topLevelTab: result.mode.topLevelTab,
                modeKey: result.mode.modeKey,
                slug: result.mode.slug,
                name: result.mode.name,
                description: result.mode.description ?? '',
                roleDefinition: result.mode.roleDefinition ?? '',
                customInstructions: result.mode.customInstructions ?? '',
                whenToUse: result.mode.whenToUse ?? '',
                tagsText: result.mode.tags?.join(', ') ?? '',
                selectedToolCapabilities: result.mode.toolCapabilities ?? [],
                selectedWorkflowCapabilities: result.mode.workflowCapabilities ?? [],
                selectedBehaviorFlags: result.mode.behaviorFlags ?? [],
                selectedRuntimeProfile: result.mode.runtimeProfile ?? 'general',
                deleteConfirmed: false,
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
        setTopLevelTab: (topLevelTab: TopLevelTab) => {
            setDraft((currentDraft) =>
                currentDraft?.kind === 'create'
                    ? {
                          ...currentDraft,
                          topLevelTab,
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
                | 'tagsText',
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
        toggleToolCapability: (capability: ToolCapability) => {
            setDraft((currentDraft) =>
                currentDraft
                    ? {
                          ...currentDraft,
                          selectedToolCapabilities: toggleToolCapability(
                              currentDraft.selectedToolCapabilities,
                              capability
                          ),
                      }
                    : currentDraft
            );
            input.clearFeedback();
        },
        toggleWorkflowCapability: (capability: WorkflowCapability) => {
            setDraft((currentDraft) =>
                currentDraft
                    ? {
                          ...currentDraft,
                          selectedWorkflowCapabilities: toggleListValue(
                              currentDraft.selectedWorkflowCapabilities,
                              capability
                          ),
                      }
                    : currentDraft
            );
            input.clearFeedback();
        },
        toggleBehaviorFlag: (behaviorFlag: BehaviorFlag) => {
            setDraft((currentDraft) =>
                currentDraft
                    ? {
                          ...currentDraft,
                          selectedBehaviorFlags: toggleListValue(currentDraft.selectedBehaviorFlags, behaviorFlag),
                      }
                    : currentDraft
            );
            input.clearFeedback();
        },
        setRuntimeProfile: (runtimeProfile: RuntimeRequirementProfile) => {
            setDraft((currentDraft) =>
                currentDraft
                    ? {
                          ...currentDraft,
                          selectedRuntimeProfile: runtimeProfile,
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
