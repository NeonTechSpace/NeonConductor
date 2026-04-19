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

import type { ModeDraftRecord, TopLevelTab } from '@/shared/contracts';

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
    const [importTopLevelTab, setImportTopLevelTab] = useState<TopLevelTab>('agent');
    const [draftOverwriteConfirmed, setDraftOverwriteConfirmed] = useState(false);
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
            input.setSuccessFeedback('Imported custom mode JSON into draft review.');
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
    const createModeDraftMutation = trpc.prompt.createModeDraft.useMutation({
        onSuccess: ({ settings }) => {
            input.applySettings(settings);
            editorState.close();
            input.setSuccessFeedback('Created mode draft.');
        },
        onError: (error) => {
            input.setErrorFeedback(error.message);
        },
    });
    const updateModeDraftMutation = trpc.prompt.updateModeDraft.useMutation({
        onSuccess: ({ settings }) => {
            input.applySettings(settings);
            input.setSuccessFeedback('Updated mode draft.');
        },
        onError: (error) => {
            input.setErrorFeedback(error.message);
        },
    });
    const validateModeDraftMutation = trpc.prompt.validateModeDraft.useMutation({
        onSuccess: ({ settings }) => {
            input.applySettings(settings);
            input.setSuccessFeedback('Validated mode draft.');
        },
        onError: (error) => {
            input.setErrorFeedback(error.message);
        },
    });
    const applyModeDraftMutation = trpc.prompt.applyModeDraft.useMutation({
        onSuccess: ({ settings }) => {
            input.applySettings(settings);
            editorState.close();
            setDraftOverwriteConfirmed(false);
            clearExportSelection();
            input.setSuccessFeedback('Applied mode draft to the registry.');
        },
        onError: (error) => {
            input.setErrorFeedback(error.message);
        },
    });
    const discardModeDraftMutation = trpc.prompt.discardModeDraft.useMutation({
        onSuccess: ({ settings }) => {
            input.applySettings(settings);
            editorState.close();
            input.setSuccessFeedback('Discarded mode draft.');
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

    async function saveEditorDraft(): Promise<void> {
        const customModeEditorDraft = editorState.draft;
        if (!customModeEditorDraft) {
            return;
        }

        const tags = parseListText(customModeEditorDraft.tagsText);
        const description = normalizeOptionalText(customModeEditorDraft.description);
        const roleDefinition = normalizeOptionalText(customModeEditorDraft.roleDefinition);
        const customInstructions = normalizeOptionalText(customModeEditorDraft.customInstructions);
        const whenToUse = normalizeOptionalText(customModeEditorDraft.whenToUse);
        const sourceText = normalizeOptionalText(customModeEditorDraft.sourceText);

        if (customModeEditorDraft.kind === 'create') {
            await createModeDraftMutation.mutateAsync({
                profileId: input.profileId,
                scope: customModeEditorDraft.scope,
                ...(customModeEditorDraft.scope === 'workspace' && input.workspaceFingerprint
                    ? { workspaceFingerprint: input.workspaceFingerprint }
                    : {}),
                sourceKind: sourceText ? 'pasted_source_material' : 'manual',
                ...(sourceText ? { sourceText } : {}),
                mode: {
                    slug: customModeEditorDraft.slug,
                    name: customModeEditorDraft.name,
                    authoringRole: customModeEditorDraft.authoringRole,
                    roleTemplate: customModeEditorDraft.roleTemplate,
                    ...(description ? { description } : {}),
                    ...(roleDefinition ? { roleDefinition } : {}),
                    ...(customInstructions ? { customInstructions } : {}),
                    ...(whenToUse ? { whenToUse } : {}),
                    ...(tags ? { tags } : {}),
                    promptLayerOverrides: customModeEditorDraft.promptLayerOverrides,
                },
            });
            return;
        }

        if (customModeEditorDraft.kind === 'draft') {
            await updateModeDraftMutation.mutateAsync({
                profileId: input.profileId,
                draftId: customModeEditorDraft.draftId,
                ...(sourceText ? { sourceText } : {}),
                mode: {
                    slug: customModeEditorDraft.slug,
                    name: customModeEditorDraft.name,
                    authoringRole: customModeEditorDraft.authoringRole,
                    roleTemplate: customModeEditorDraft.roleTemplate,
                    ...(description ? { description } : {}),
                    ...(roleDefinition ? { roleDefinition } : {}),
                    ...(customInstructions ? { customInstructions } : {}),
                    ...(whenToUse ? { whenToUse } : {}),
                    ...(tags ? { tags } : {}),
                    promptLayerOverrides: customModeEditorDraft.promptLayerOverrides,
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
                authoringRole: customModeEditorDraft.authoringRole,
                roleTemplate: customModeEditorDraft.roleTemplate,
                ...(description ? { description } : {}),
                ...(roleDefinition ? { roleDefinition } : {}),
                ...(customInstructions ? { customInstructions } : {}),
                ...(whenToUse ? { whenToUse } : {}),
                ...(tags ? { tags } : {}),
                promptLayerOverrides: customModeEditorDraft.promptLayerOverrides,
            },
        });
    }

    async function deleteOrDiscardCurrentEditorItem(): Promise<void> {
        const customModeEditorDraft = editorState.draft;
        if (!customModeEditorDraft) {
            return;
        }

        if (customModeEditorDraft.kind === 'draft') {
            await discardModeDraftMutation.mutateAsync({
                profileId: input.profileId,
                draftId: customModeEditorDraft.draftId,
            });
            return;
        }

        if (customModeEditorDraft.kind !== 'edit') {
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
    }

    async function applyDraft(draftId: string): Promise<void> {
        await applyModeDraftMutation.mutateAsync({
            profileId: input.profileId,
            draftId,
            overwrite: draftOverwriteConfirmed,
        });
    }

    async function validateDraft(draftId: string): Promise<void> {
        await validateModeDraftMutation.mutateAsync({
            profileId: input.profileId,
            draftId,
        });
    }

    async function discardDraft(draftId: string): Promise<void> {
        await discardModeDraftMutation.mutateAsync({
            profileId: input.profileId,
            draftId,
        });
    }

    function openDraft(draft: ModeDraftRecord): void {
        editorState.openDraft(draft);
        setDraftOverwriteConfirmed(false);
    }

    return {
        customModes: {
            global: input.persistedSettings?.fileBackedCustomModes.global ?? emptyModeItems(),
            workspace: input.persistedSettings?.fileBackedCustomModes.workspace ?? emptyModeItems(),
            delegatedWorkerModes: input.persistedSettings?.delegatedWorkerModes ?? { global: [], workspace: [] },
            modeDrafts: input.persistedSettings?.modeDrafts ?? [],
            editor: {
                draft: editorState.draft,
                isLoading: editorState.isLoading,
                isSaving:
                    createModeDraftMutation.isPending ||
                    updateModeDraftMutation.isPending ||
                    updateCustomModeMutation.isPending ||
                    deleteCustomModeMutation.isPending ||
                    discardModeDraftMutation.isPending ||
                    applyModeDraftMutation.isPending ||
                    validateModeDraftMutation.isPending,
                hasWorkspaceScope: Boolean(input.workspaceFingerprint),
                selectedWorkspaceLabel: input.selectedWorkspaceLabel,
                openCreate: editorState.openCreate,
                openEdit: editorState.openEdit,
                openDraft,
                openDelete: editorState.openDelete,
                close: editorState.close,
                setScope: editorState.setScope,
                setAuthoringRole: editorState.setAuthoringRole,
                setRoleTemplate: editorState.setRoleTemplate,
                setField: editorState.setField,
                setPromptLayerOverride: editorState.setPromptLayerOverride,
                setDeleteConfirmed: editorState.setDeleteConfirmed,
                save: wrapFailClosedAction(saveEditorDraft),
                deleteMode: wrapFailClosedAction(deleteOrDiscardCurrentEditorItem),
                validateDraft: wrapFailClosedAction(async () => {
                    const draft = editorState.draft;
                    if (draft?.kind !== 'draft') {
                        return;
                    }
                    await validateDraft(draft.draftId);
                }),
                applyDraft: wrapFailClosedAction(async () => {
                    const draft = editorState.draft;
                    if (draft?.kind !== 'draft') {
                        return;
                    }
                    await applyDraft(draft.draftId);
                }),
                draftOverwriteConfirmed,
                setDraftOverwriteConfirmed: (value: boolean) => {
                    setDraftOverwriteConfirmed(value);
                    input.clearFeedback();
                },
            },
            importDraft: {
                jsonText: importJsonText,
                scope: importScope,
                topLevelTab: importTopLevelTab,
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
            isDraftActionPending:
                validateModeDraftMutation.isPending ||
                applyModeDraftMutation.isPending ||
                discardModeDraftMutation.isPending,
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
            importMode: wrapFailClosedAction(async () => {
                await importCustomModeMutation.mutateAsync({
                    profileId: input.profileId,
                    scope: importScope,
                    ...(importScope === 'workspace' && input.workspaceFingerprint
                        ? { workspaceFingerprint: input.workspaceFingerprint }
                        : {}),
                    jsonText: importJsonText,
                    ...(importTopLevelTab ? { topLevelTab: importTopLevelTab } : {}),
                });
            }),
            exportMode: wrapFailClosedAction(loadExportJson),
            copyExportJson: wrapFailClosedAction(copyExportJson),
            validateDraft: wrapFailClosedAction(validateDraft),
            applyDraft: wrapFailClosedAction(applyDraft),
            discardDraft: wrapFailClosedAction(discardDraft),
        },
    };
}
