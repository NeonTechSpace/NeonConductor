import {
    appPromptLayerSettingsStore,
    builtInModePromptOverrideStore,
    settingsStore,
} from '@/app/backend/persistence/stores';
import {
    createDefaultPreparedContextModeOverrides,
    createDefaultPreparedContextProfileDefaults,
    normalizeModePromptDefinition,
    normalizePreparedContextModeOverrides,
    normalizePreparedContextProfileDefaults,
    type PromptLayerSettings,
    type PreparedContextProfileDefaults,
    type TopLevelTab,
} from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import {
    PROFILE_GLOBAL_INSTRUCTIONS_KEY,
    PREPARED_CONTEXT_PROFILE_DEFAULTS_KEY,
    assertBuiltInModeExists,
    getTopLevelInstructionsKey,
    normalizeInstructions,
    readPromptLayerSettings,
} from '@/app/backend/runtime/services/promptLayers/shared';

export async function getPromptLayerSettings(
    profileId: string,
    workspaceFingerprint?: string
): Promise<PromptLayerSettings> {
    return readPromptLayerSettings({
        profileId,
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
    });
}

export async function setAppGlobalInstructions(input: {
    profileId: string;
    value: string;
}): Promise<PromptLayerSettings> {
    const normalizedValue = normalizeInstructions(input.value);
    await appPromptLayerSettingsStore.setGlobalInstructions(normalizedValue);
    return getPromptLayerSettings(input.profileId);
}

export async function resetAppGlobalInstructions(profileId: string): Promise<PromptLayerSettings> {
    await appPromptLayerSettingsStore.setGlobalInstructions('');
    return getPromptLayerSettings(profileId);
}

export async function setProfileGlobalInstructions(input: {
    profileId: string;
    value: string;
}): Promise<PromptLayerSettings> {
    const normalizedValue = normalizeInstructions(input.value);
    if (normalizedValue.length === 0) {
        await settingsStore.delete(input.profileId, PROFILE_GLOBAL_INSTRUCTIONS_KEY);
    } else {
        await settingsStore.setString(input.profileId, PROFILE_GLOBAL_INSTRUCTIONS_KEY, normalizedValue);
    }

    return getPromptLayerSettings(input.profileId);
}

export async function resetProfileGlobalInstructions(profileId: string): Promise<PromptLayerSettings> {
    await settingsStore.delete(profileId, PROFILE_GLOBAL_INSTRUCTIONS_KEY);
    return getPromptLayerSettings(profileId);
}

export async function setTopLevelInstructions(input: {
    profileId: string;
    topLevelTab: TopLevelTab;
    value: string;
}): Promise<PromptLayerSettings> {
    const normalizedValue = normalizeInstructions(input.value);
    const key = getTopLevelInstructionsKey(input.topLevelTab);

    if (normalizedValue.length === 0) {
        await settingsStore.delete(input.profileId, key);
    } else {
        await settingsStore.setString(input.profileId, key, normalizedValue);
    }

    return getPromptLayerSettings(input.profileId);
}

export async function resetTopLevelInstructions(input: {
    profileId: string;
    topLevelTab: TopLevelTab;
}): Promise<PromptLayerSettings> {
    await settingsStore.delete(input.profileId, getTopLevelInstructionsKey(input.topLevelTab));
    return getPromptLayerSettings(input.profileId);
}

export async function setBuiltInModePrompt(input: {
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    roleDefinition: string;
    customInstructions: string;
    promptLayerOverrides: PromptLayerSettings['builtInModes'][TopLevelTab][number]['promptLayerOverrides'];
}): Promise<OperationalResult<PromptLayerSettings>> {
    const builtInModeExists = await assertBuiltInModeExists(input.profileId, input.topLevelTab, input.modeKey);
    if (builtInModeExists.isErr()) {
        return errOp(builtInModeExists.error.code, builtInModeExists.error.message);
    }

    const normalizedPrompt = normalizeModePromptDefinition({
        roleDefinition: input.roleDefinition,
        customInstructions: input.customInstructions,
    });
    if (Object.keys(normalizedPrompt).length === 0) {
        const normalizedOverrides = normalizePreparedContextModeOverrides(input.promptLayerOverrides);
        const hasOverrideEntries = JSON.stringify(normalizedOverrides) !== JSON.stringify(createDefaultPreparedContextModeOverrides());
        if (!hasOverrideEntries) {
            await builtInModePromptOverrideStore.delete(input.profileId, input.topLevelTab, input.modeKey);
        } else {
            await builtInModePromptOverrideStore.setPrompt({
                profileId: input.profileId,
                topLevelTab: input.topLevelTab,
                modeKey: input.modeKey,
                prompt: normalizedPrompt,
                promptLayerOverrides: normalizedOverrides,
            });
        }
    } else {
        await builtInModePromptOverrideStore.setPrompt({
            profileId: input.profileId,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            prompt: normalizedPrompt,
            promptLayerOverrides: normalizePreparedContextModeOverrides(input.promptLayerOverrides),
        });
    }

    return okOp(await getPromptLayerSettings(input.profileId));
}

export async function resetBuiltInModePrompt(input: {
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
}): Promise<OperationalResult<PromptLayerSettings>> {
    const builtInModeExists = await assertBuiltInModeExists(input.profileId, input.topLevelTab, input.modeKey);
    if (builtInModeExists.isErr()) {
        return errOp(builtInModeExists.error.code, builtInModeExists.error.message);
    }

    await builtInModePromptOverrideStore.delete(input.profileId, input.topLevelTab, input.modeKey);
    return okOp(await getPromptLayerSettings(input.profileId));
}

export async function setPreparedContextProfileDefaults(input: {
    profileId: string;
    defaults: PreparedContextProfileDefaults;
}): Promise<PromptLayerSettings> {
    const normalizedDefaults = normalizePreparedContextProfileDefaults(input.defaults);
    await settingsStore.setJson(input.profileId, PREPARED_CONTEXT_PROFILE_DEFAULTS_KEY, normalizedDefaults);
    return getPromptLayerSettings(input.profileId);
}

export async function resetPreparedContextProfileDefaults(profileId: string): Promise<PromptLayerSettings> {
    await settingsStore.setJson(profileId, PREPARED_CONTEXT_PROFILE_DEFAULTS_KEY, createDefaultPreparedContextProfileDefaults());
    return getPromptLayerSettings(profileId);
}
