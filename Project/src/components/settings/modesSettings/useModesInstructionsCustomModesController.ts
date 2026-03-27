import { useState } from 'react';

import type { PromptSettingsSnapshot } from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';
import {
    emptyModeItems,
    normalizeOptionalText,
    parseListText,
} from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';
import { useModesInstructionsCustomModeEditorState } from '@/web/components/settings/modesSettings/useModesInstructionsCustomModeEditorState';
import { createFailClosedAsyncAction } from '@/web/lib/async/createFailClosedAsyncAction';
import { trpc } from '@/web/trpc/client';

import type { TopLevelTab } from '@/shared/contracts';


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
    const [importJsonText, setImportJsonText] = useState('');
    const [importScope, setImportScope] = useState<'global' | 'workspace'>('global');
    const [importTopLevelTab, setImportTopLevelTab] = useState<TopLevelTab>('chat');
    const [allowOverwrite, setAllowOverwrite] = useState(false);
    const [exportJsonText, setExportJsonText] = useState('');
    const [selectedExportLabel, setSelectedExportLabel] = useState<string | undefined>(undefined);
    const editorState = useModesInstructionsCustomModeEditorState({
        profileId: input.profileId,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        clearFeedback: input.clearFeedback,
        setErrorFeedback: input.setErrorFeedback,
    });

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
            editorState.close();
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
            editorState.close();
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
            editorState.close();
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

    async function loadExportJson(scope: 'global' | 'workspace', topLevelTab: TopLevelTab, modeKey: string) {
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

    return {
        customModes: {
            global: input.persistedSettings?.fileBackedCustomModes.global ?? emptyModeItems(),
            workspace: input.persistedSettings?.fileBackedCustomModes.workspace ?? emptyModeItems(),
            editor: {
                draft: editorState.draft,
                isLoading: editorState.isLoading,
                isSaving:
                    createCustomModeMutation.isPending ||
                    updateCustomModeMutation.isPending ||
                    deleteCustomModeMutation.isPending,
                hasWorkspaceScope: Boolean(input.workspaceFingerprint),
                selectedWorkspaceLabel: input.selectedWorkspaceLabel,
                openCreate: editorState.openCreate,
                openEdit: editorState.openEdit,
                openDelete: editorState.openDelete,
                close: editorState.close,
                setScope: editorState.setScope,
                setTopLevelTab: editorState.setTopLevelTab,
                setField: editorState.setField,
                toggleToolCapability: editorState.toggleToolCapability,
                setDeleteConfirmed: editorState.setDeleteConfirmed,
                save: wrapFailClosedAction(async () => {
                    const customModeEditorDraft = editorState.draft;
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
                    const customModeEditorDraft = editorState.draft;
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
                loadExportJson: wrapFailClosedAction(loadExportJson),
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
            exportMode: wrapFailClosedAction(loadExportJson),
            copyExportJson: wrapFailClosedAction(copyExportJson),
        },
    };
}
