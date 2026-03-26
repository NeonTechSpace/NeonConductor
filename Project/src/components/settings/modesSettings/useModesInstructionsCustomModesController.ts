import { useState } from 'react';

import type {
    CustomModeEditorDraft,
    CustomModeScope,
    PromptSettingsSnapshot,
} from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';
import {
    createEmptyCustomModeEditorDraft,
    emptyModeItems,
    normalizeOptionalText,
    parseListText,
    toggleToolCapability,
} from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';
import { createFailClosedAsyncAction } from '@/web/lib/async/createFailClosedAsyncAction';
import { trpc } from '@/web/trpc/client';

import type { ToolCapability, TopLevelTab } from '@/shared/contracts';


export function useModesInstructionsCustomModesController(input: {
    profileId: string;
    workspaceFingerprint?: string;
    selectedWorkspaceLabel?: string;
    persistedSettings: PromptSettingsSnapshot | undefined;
    applySettings: (settings: PromptSettingsSnapshot) => void;
    clearFeedback: () => void;
    setErrorFeedback: (message: string) => void;
    setSuccessFeedback: (message: string) => void;
}) {
    const wrapFailClosedAction = <TArgs extends unknown[]>(action: (...args: TArgs) => Promise<void>) =>
        createFailClosedAsyncAction(action);
    const utils = trpc.useUtils();
    const [importJsonText, setImportJsonText] = useState('');
    const [importScope, setImportScope] = useState<'global' | 'workspace'>('global');
    const [importTopLevelTab, setImportTopLevelTab] = useState<TopLevelTab>('chat');
    const [allowOverwrite, setAllowOverwrite] = useState(false);
    const [exportJsonText, setExportJsonText] = useState('');
    const [selectedExportLabel, setSelectedExportLabel] = useState<string | undefined>(undefined);
    const [customModeEditorDraft, setCustomModeEditorDraft] = useState<CustomModeEditorDraft | undefined>(undefined);
    const [isLoadingCustomModeEditor, setIsLoadingCustomModeEditor] = useState(false);

    function clearExportSelection(): void {
        setExportJsonText('');
        setSelectedExportLabel(undefined);
    }

    const importCustomModeMutation = trpc.prompt.importCustomMode.useMutation({
        onSuccess: ({ settings }) => {
            input.applySettings(settings);
            setImportJsonText('');
            setAllowOverwrite(false);
            input.setSuccessFeedback('Imported file-backed custom mode.');
        },
        onError: (error) => {
            input.setErrorFeedback(error.message);
        },
    });
    const exportCustomModeMutation = trpc.prompt.exportCustomMode.useMutation({
        onSuccess: (result) => {
            setExportJsonText(result.jsonText);
            setSelectedExportLabel(`${result.scope} :: ${result.modeKey}`);
            input.setSuccessFeedback('Loaded export JSON for the selected custom mode.');
        },
        onError: (error) => {
            input.setErrorFeedback(error.message);
        },
    });
    const createCustomModeMutation = trpc.prompt.createCustomMode.useMutation({
        onSuccess: ({ settings }) => {
            input.applySettings(settings);
            setCustomModeEditorDraft(undefined);
            clearExportSelection();
            input.setSuccessFeedback('Created file-backed custom mode.');
        },
        onError: (error) => {
            input.setErrorFeedback(error.message);
        },
    });
    const updateCustomModeMutation = trpc.prompt.updateCustomMode.useMutation({
        onSuccess: ({ settings }) => {
            input.applySettings(settings);
            setCustomModeEditorDraft(undefined);
            clearExportSelection();
            input.setSuccessFeedback('Updated file-backed custom mode.');
        },
        onError: (error) => {
            input.setErrorFeedback(error.message);
        },
    });
    const deleteCustomModeMutation = trpc.prompt.deleteCustomMode.useMutation({
        onSuccess: ({ settings }) => {
            input.applySettings(settings);
            setCustomModeEditorDraft(undefined);
            clearExportSelection();
            input.setSuccessFeedback('Deleted file-backed custom mode.');
        },
        onError: (error) => {
            input.setErrorFeedback(error.message);
        },
    });

    async function copyExportJson(): Promise<void> {
        if (exportJsonText.trim().length === 0) {
            return;
        }

        await navigator.clipboard.writeText(exportJsonText);
        input.setSuccessFeedback('Copied custom mode JSON.');
    }

    async function loadCustomModeEditor(loadInput: {
        scope: CustomModeScope;
        topLevelTab: TopLevelTab;
        modeKey: string;
    }): Promise<void> {
        setIsLoadingCustomModeEditor(true);
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
            setCustomModeEditorDraft({
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
                deleteConfirmed: false,
            });
        } catch (error) {
            input.setErrorFeedback(error instanceof Error ? error.message : 'Custom mode could not be loaded.');
        } finally {
            setIsLoadingCustomModeEditor(false);
        }
    }

    return {
        customModes: {
            global: input.persistedSettings?.fileBackedCustomModes.global ?? emptyModeItems(),
            workspace: input.persistedSettings?.fileBackedCustomModes.workspace ?? emptyModeItems(),
            editor: {
                draft: customModeEditorDraft,
                isLoading: isLoadingCustomModeEditor,
                isSaving:
                    createCustomModeMutation.isPending ||
                    updateCustomModeMutation.isPending ||
                    deleteCustomModeMutation.isPending,
                hasWorkspaceScope: Boolean(input.workspaceFingerprint),
                selectedWorkspaceLabel: input.selectedWorkspaceLabel,
                openCreate: (scope: CustomModeScope) => {
                    setCustomModeEditorDraft(createEmptyCustomModeEditorDraft(scope));
                    input.clearFeedback();
                },
                openEdit: async (scope: CustomModeScope, topLevelTab: TopLevelTab, modeKey: string) => {
                    await loadCustomModeEditor({ scope, topLevelTab, modeKey });
                },
                openDelete: async (scope: CustomModeScope, topLevelTab: TopLevelTab, modeKey: string) => {
                    await loadCustomModeEditor({ scope, topLevelTab, modeKey });
                },
                close: () => {
                    setCustomModeEditorDraft(undefined);
                    input.clearFeedback();
                },
                setScope: (scope: CustomModeScope) => {
                    setCustomModeEditorDraft((currentDraft) =>
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
                    setCustomModeEditorDraft((currentDraft) =>
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
                    setCustomModeEditorDraft((currentDraft) =>
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
                    setCustomModeEditorDraft((currentDraft) =>
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
                setDeleteConfirmed: (value: boolean) => {
                    setCustomModeEditorDraft((currentDraft) =>
                        currentDraft
                            ? {
                                  ...currentDraft,
                                  deleteConfirmed: value,
                              }
                            : currentDraft
                    );
                    input.clearFeedback();
                },
                save: wrapFailClosedAction(async () => {
                    if (!customModeEditorDraft) {
                        return;
                    }

                    const tags = parseListText(customModeEditorDraft.tagsText);
                    const description = normalizeOptionalText(customModeEditorDraft.description);
                    const roleDefinition = normalizeOptionalText(customModeEditorDraft.roleDefinition);
                    const customInstructions = normalizeOptionalText(customModeEditorDraft.customInstructions);
                    const whenToUse = normalizeOptionalText(customModeEditorDraft.whenToUse);
                    const toolCapabilities =
                        customModeEditorDraft.selectedToolCapabilities.length > 0
                            ? customModeEditorDraft.selectedToolCapabilities
                            : undefined;
                    if (customModeEditorDraft.kind === 'create') {
                        await createCustomModeMutation.mutateAsync({
                            profileId: input.profileId,
                            topLevelTab: customModeEditorDraft.topLevelTab,
                            scope: customModeEditorDraft.scope,
                            ...(customModeEditorDraft.scope === 'workspace' && input.workspaceFingerprint
                                ? { workspaceFingerprint: input.workspaceFingerprint }
                                : {}),
                            mode: {
                                slug: customModeEditorDraft.slug,
                                name: customModeEditorDraft.name,
                                ...(description ? { description } : {}),
                                ...(roleDefinition ? { roleDefinition } : {}),
                                ...(customInstructions ? { customInstructions } : {}),
                                ...(whenToUse ? { whenToUse } : {}),
                                ...(tags ? { tags } : {}),
                                ...(toolCapabilities ? { toolCapabilities } : {}),
                            },
                        });
                        return;
                    }

                    await updateCustomModeMutation.mutateAsync({
                        profileId: input.profileId,
                        topLevelTab: customModeEditorDraft.topLevelTab,
                        modeKey: customModeEditorDraft.modeKey,
                        scope: customModeEditorDraft.scope,
                        ...(customModeEditorDraft.scope === 'workspace' && input.workspaceFingerprint
                            ? { workspaceFingerprint: input.workspaceFingerprint }
                            : {}),
                        mode: {
                            name: customModeEditorDraft.name,
                            ...(description ? { description } : {}),
                            ...(roleDefinition ? { roleDefinition } : {}),
                            ...(customInstructions ? { customInstructions } : {}),
                            ...(whenToUse ? { whenToUse } : {}),
                            ...(tags ? { tags } : {}),
                            ...(toolCapabilities ? { toolCapabilities } : {}),
                        },
                    });
                }),
                deleteMode: wrapFailClosedAction(async () => {
                    if (!customModeEditorDraft || customModeEditorDraft.kind !== 'edit') {
                        return;
                    }

                    await deleteCustomModeMutation.mutateAsync({
                        profileId: input.profileId,
                        topLevelTab: customModeEditorDraft.topLevelTab,
                        modeKey: customModeEditorDraft.modeKey,
                        scope: customModeEditorDraft.scope,
                        ...(customModeEditorDraft.scope === 'workspace' && input.workspaceFingerprint
                            ? { workspaceFingerprint: input.workspaceFingerprint }
                            : {}),
                        confirm: customModeEditorDraft.deleteConfirmed,
                    });
                }),
            },
            importDraft: {
                jsonText: importJsonText,
                scope: importScope,
                topLevelTab: importTopLevelTab,
                allowOverwrite,
                hasWorkspaceScope: Boolean(input.workspaceFingerprint),
                selectedWorkspaceLabel: input.selectedWorkspaceLabel,
            },
            exportState: {
                jsonText: exportJsonText,
                selectedLabel: selectedExportLabel,
            },
            isImporting: importCustomModeMutation.isPending,
            isExporting: exportCustomModeMutation.isPending,
            setImportJsonText: (value: string) => {
                setImportJsonText(value);
                input.clearFeedback();
            },
            setImportScope: (scope: 'global' | 'workspace') => {
                setImportScope(scope);
                input.clearFeedback();
            },
            setImportTopLevelTab: (topLevelTab: TopLevelTab) => {
                setImportTopLevelTab(topLevelTab);
                input.clearFeedback();
            },
            setAllowOverwrite: (value: boolean) => {
                setAllowOverwrite(value);
                input.clearFeedback();
            },
            importMode: wrapFailClosedAction(async () => {
                await importCustomModeMutation.mutateAsync({
                    profileId: input.profileId,
                    topLevelTab: importTopLevelTab,
                    scope: importScope,
                    ...(importScope === 'workspace' && input.workspaceFingerprint
                        ? { workspaceFingerprint: input.workspaceFingerprint }
                        : {}),
                    jsonText: importJsonText,
                    overwrite: allowOverwrite,
                });
            }),
            exportMode: wrapFailClosedAction(
                async (scope: 'global' | 'workspace', topLevelTab: TopLevelTab, modeKey: string) => {
                    await exportCustomModeMutation.mutateAsync({
                        profileId: input.profileId,
                        topLevelTab,
                        modeKey,
                        scope,
                        ...(scope === 'workspace' && input.workspaceFingerprint
                            ? { workspaceFingerprint: input.workspaceFingerprint }
                            : {}),
                    });
                }
            ),
            copyExportJson: wrapFailClosedAction(copyExportJson),
        },
    };
}
