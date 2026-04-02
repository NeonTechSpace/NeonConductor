import path from 'node:path';

import type {
    PromptLayerCustomModePayload,
    PromptLayerEditableCustomModePayload,
    PromptLayerExportCustomModeResult,
    PromptLayerSettings,
    TopLevelTab,
} from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import {
    buildCanonicalCustomModePayload,
    deletePortableModeFile,
    fileExists,
    parsePortableCustomModeJson,
    renderCanonicalModeMarkdown,
    resolveCustomModeDirectory,
    toCanonicalCustomModePayload,
    toPortableModePayload,
    writePortableModeFile,
} from '@/app/backend/runtime/services/promptLayers/customModePortability';
import { getPromptLayerSettings } from '@/app/backend/runtime/services/promptLayers/settingsService';
import {
    buildEditableCustomModePayload,
    findFileBackedCustomMode,
    refreshDiscoveredModesForScope,
    toPromptLayerCustomModeRecord,
} from '@/app/backend/runtime/services/promptLayers/shared';

export async function exportCustomMode(input: {
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    scope: 'global' | 'workspace';
    workspaceFingerprint?: string;
}): Promise<OperationalResult<PromptLayerExportCustomModeResult>> {
    const mode = await findFileBackedCustomMode(input);
    if (!mode) {
        return errOp('not_found', `File-backed custom mode "${input.topLevelTab}:${input.modeKey}" was not found.`);
    }

    return okOp({
        modeKey: mode.modeKey,
        scope: input.scope,
        jsonText: JSON.stringify(toPortableModePayload(mode), null, 2),
    });
}

export async function getCustomMode(input: {
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    scope: 'global' | 'workspace';
    workspaceFingerprint?: string;
}): Promise<OperationalResult<{ mode: ReturnType<typeof toPromptLayerCustomModeRecord> }>> {
    const mode = await findFileBackedCustomMode(input);
    if (!mode) {
        return errOp('not_found', `File-backed custom mode "${input.topLevelTab}:${input.modeKey}" was not found.`);
    }

    return okOp({
        mode: toPromptLayerCustomModeRecord(mode),
    });
}

export async function createCustomMode(input: {
    profileId: string;
    topLevelTab: TopLevelTab;
    scope: 'global' | 'workspace';
    workspaceFingerprint?: string;
    mode: PromptLayerCustomModePayload;
}): Promise<OperationalResult<PromptLayerSettings>> {
    const payload = buildCanonicalCustomModePayload(input.mode);
    const { modeKey, fileContent } = renderCanonicalModeMarkdown({
        topLevelTab: input.topLevelTab,
        payload,
    });
    const existingMode = await findFileBackedCustomMode({
        profileId: input.profileId,
        topLevelTab: input.topLevelTab,
        modeKey,
        scope: input.scope,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    });
    const directory = await resolveCustomModeDirectory({
        profileId: input.profileId,
        scope: input.scope,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    });
    const absolutePath = path.join(directory, `${input.topLevelTab}-${modeKey}.md`);
    const exists = existingMode !== undefined || (await fileExists(absolutePath));
    if (exists) {
        return errOp(
            'invalid_input',
            `A ${input.scope} file-backed mode already exists for "${input.topLevelTab}:${modeKey}".`
        );
    }

    await writePortableModeFile({
        absolutePath,
        fileContent,
    });
    const refreshed = await refreshDiscoveredModesForScope({
        profileId: input.profileId,
        scope: input.scope,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    });
    if (refreshed.isErr()) {
        return errOp(refreshed.error.code, refreshed.error.message);
    }

    return okOp(await getPromptLayerSettings(input.profileId, input.workspaceFingerprint));
}

export async function updateCustomMode(input: {
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    scope: 'global' | 'workspace';
    workspaceFingerprint?: string;
    mode: PromptLayerEditableCustomModePayload;
}): Promise<OperationalResult<PromptLayerSettings>> {
    const existingMode = await findFileBackedCustomMode(input);
    if (!existingMode) {
        return errOp('not_found', `File-backed custom mode "${input.topLevelTab}:${input.modeKey}" was not found.`);
    }
    if (!existingMode.originPath) {
        return errOp(
            'not_found',
            `File-backed custom mode "${input.topLevelTab}:${input.modeKey}" has no origin path.`
        );
    }

    const payload = buildEditableCustomModePayload({
        slug: existingMode.modeKey,
        name: input.mode.name,
        ...(input.mode.description ? { description: input.mode.description } : {}),
        ...(input.mode.roleDefinition ? { roleDefinition: input.mode.roleDefinition } : {}),
        ...(input.mode.customInstructions ? { customInstructions: input.mode.customInstructions } : {}),
        ...(input.mode.whenToUse ? { whenToUse: input.mode.whenToUse } : {}),
        ...(input.mode.tags ? { tags: input.mode.tags } : {}),
        ...(input.mode.toolCapabilities ? { toolCapabilities: input.mode.toolCapabilities } : {}),
        ...(input.mode.workflowCapabilities ? { workflowCapabilities: input.mode.workflowCapabilities } : {}),
        ...(input.mode.behaviorFlags ? { behaviorFlags: input.mode.behaviorFlags } : {}),
        ...(input.mode.runtimeProfile ? { runtimeProfile: input.mode.runtimeProfile } : {}),
    });
    const { fileContent } = renderCanonicalModeMarkdown({
        topLevelTab: existingMode.topLevelTab,
        payload,
    });

    await writePortableModeFile({
        absolutePath: existingMode.originPath,
        fileContent,
    });
    const refreshed = await refreshDiscoveredModesForScope({
        profileId: input.profileId,
        scope: input.scope,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    });
    if (refreshed.isErr()) {
        return errOp(refreshed.error.code, refreshed.error.message);
    }

    return okOp(await getPromptLayerSettings(input.profileId, input.workspaceFingerprint));
}

export async function deleteCustomMode(input: {
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    scope: 'global' | 'workspace';
    workspaceFingerprint?: string;
    confirm: boolean;
}): Promise<OperationalResult<PromptLayerSettings>> {
    if (!input.confirm) {
        return errOp('invalid_input', 'Deleting a file-backed custom mode requires explicit confirmation.');
    }

    const existingMode = await findFileBackedCustomMode(input);
    if (!existingMode) {
        return errOp('not_found', `File-backed custom mode "${input.topLevelTab}:${input.modeKey}" was not found.`);
    }
    if (!existingMode.originPath) {
        return errOp(
            'not_found',
            `File-backed custom mode "${input.topLevelTab}:${input.modeKey}" has no origin path.`
        );
    }
    if (!(await fileExists(existingMode.originPath))) {
        return errOp('not_found', `File-backed custom mode "${input.topLevelTab}:${input.modeKey}" file is missing.`);
    }

    await deletePortableModeFile(existingMode.originPath);
    const refreshed = await refreshDiscoveredModesForScope({
        profileId: input.profileId,
        scope: input.scope,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    });
    if (refreshed.isErr()) {
        return errOp(refreshed.error.code, refreshed.error.message);
    }

    return okOp(await getPromptLayerSettings(input.profileId, input.workspaceFingerprint));
}

export async function importCustomMode(input: {
    profileId: string;
    topLevelTab: TopLevelTab;
    scope: 'global' | 'workspace';
    workspaceFingerprint?: string;
    jsonText: string;
    overwrite: boolean;
}): Promise<OperationalResult<PromptLayerSettings>> {
    const portablePayload = parsePortableCustomModeJson(input.jsonText);
    const payload = toCanonicalCustomModePayload(portablePayload);
    const { modeKey, fileContent } = renderCanonicalModeMarkdown({
        topLevelTab: input.topLevelTab,
        payload,
    });
    const existingMode = await findFileBackedCustomMode({
        profileId: input.profileId,
        topLevelTab: input.topLevelTab,
        modeKey,
        scope: input.scope,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    });
    const directory = await resolveCustomModeDirectory({
        profileId: input.profileId,
        scope: input.scope,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    });
    const absolutePath = existingMode?.originPath ?? path.join(directory, `${input.topLevelTab}-${modeKey}.md`);
    const exists = existingMode !== undefined || (await fileExists(absolutePath));
    if (exists && !input.overwrite) {
        return errOp(
            'invalid_input',
            `A ${input.scope} file-backed mode already exists for "${input.topLevelTab}:${modeKey}". Re-run with overwrite confirmation to replace it.`
        );
    }

    await writePortableModeFile({
        absolutePath,
        fileContent,
    });
    const refreshed = await refreshDiscoveredModesForScope({
        profileId: input.profileId,
        scope: input.scope,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    });
    if (refreshed.isErr()) {
        return errOp(refreshed.error.code, refreshed.error.message);
    }

    return okOp(await getPromptLayerSettings(input.profileId, input.workspaceFingerprint));
}
