import { contextBudgets, runtimeResetTargets } from '@/app/backend/runtime/contracts/enums';
import {
    createParser,
    readEnumValue,
    readBoolean,
    readEntityId,
    readObject,
    readOptionalBoolean,
    readOptionalNumber,
    readOptionalString,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import type {
    ContextBudgetInput,
    NeonObservabilitySubscriptionInput,
    RuntimeFactoryResetInput,
    RuntimeEventsSubscriptionInput,
    RuntimeRegisterWorkspaceRootInput,
    RuntimeResetInput,
    RuntimeSetWorkspacePreferenceInput,
    WindowStateSubscriptionInput,
} from '@/app/backend/runtime/contracts/types';
import { FACTORY_RESET_CONFIRMATION_TEXT } from '@/app/backend/runtime/contracts/types';
import { providerIds, topLevelTabs } from '@/shared/contracts';

export function parseRuntimeEventsSubscriptionInput(input: unknown): RuntimeEventsSubscriptionInput {
    if (input === undefined) {
        return {};
    }

    const source = readObject(input, 'input');
    const afterSequence = readOptionalNumber(source.afterSequence, 'afterSequence');

    if (afterSequence !== undefined && (!Number.isInteger(afterSequence) || afterSequence < 0)) {
        throw new Error('Invalid "afterSequence": expected non-negative integer.');
    }

    return {
        ...(afterSequence !== undefined ? { afterSequence } : {}),
    };
}

export function parseWindowStateSubscriptionInput(input: unknown): WindowStateSubscriptionInput {
    if (input === undefined) {
        return {};
    }

    const source = readObject(input, 'input');
    const afterSequence = readOptionalNumber(source.afterSequence, 'afterSequence');

    if (afterSequence !== undefined && (!Number.isInteger(afterSequence) || afterSequence < 0)) {
        throw new Error('Invalid "afterSequence": expected non-negative integer.');
    }

    return {
        ...(afterSequence !== undefined ? { afterSequence } : {}),
    };
}

export function parseRuntimeResetInput(input: unknown): RuntimeResetInput {
    const source = readObject(input, 'input');

    const target = readEnumValue(source.target, 'target', runtimeResetTargets);
    const profileId = readOptionalString(source.profileId, 'profileId');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const dryRun = readOptionalBoolean(source.dryRun, 'dryRun') ?? false;
    const confirm = readOptionalBoolean(source.confirm, 'confirm');

    if (target === 'workspace' && !workspaceFingerprint) {
        throw new Error('Invalid "workspaceFingerprint": required when target is "workspace".');
    }

    if ((target === 'profile_settings' || target === 'full') && !profileId) {
        throw new Error('Invalid "profileId": required when target is "profile_settings" or "full".');
    }

    if (!dryRun && confirm !== true) {
        throw new Error('Invalid "confirm": expected true when dryRun is false.');
    }

    return {
        target,
        ...(profileId ? { profileId } : {}),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(dryRun ? { dryRun } : {}),
        ...(confirm !== undefined ? { confirm } : {}),
    };
}

export function parseNeonObservabilitySubscriptionInput(input: unknown): NeonObservabilitySubscriptionInput {
    if (input === undefined) {
        return {};
    }

    const source = readObject(input, 'input');
    const afterSequence = readOptionalNumber(source.afterSequence, 'afterSequence');
    const profileId = readOptionalString(source.profileId, 'profileId');
    const sessionId = source.sessionId !== undefined ? readEntityId(source.sessionId, 'sessionId', 'sess') : undefined;
    const runId = source.runId !== undefined ? readEntityId(source.runId, 'runId', 'run') : undefined;

    if (afterSequence !== undefined && (!Number.isInteger(afterSequence) || afterSequence < 0)) {
        throw new Error('Invalid "afterSequence": expected non-negative integer.');
    }

    return {
        ...(afterSequence !== undefined ? { afterSequence } : {}),
        ...(profileId ? { profileId } : {}),
        ...(sessionId ? { sessionId } : {}),
        ...(runId ? { runId } : {}),
    };
}

export function parseRuntimeFactoryResetInput(input: unknown): RuntimeFactoryResetInput {
    const source = readObject(input, 'input');
    const confirm = readBoolean(source.confirm, 'confirm');
    const confirmationText = readOptionalString(source.confirmationText, 'confirmationText') ?? '';

    if (!confirm) {
        throw new Error('Invalid "confirm": expected true for factory reset.');
    }

    if (confirmationText !== FACTORY_RESET_CONFIRMATION_TEXT) {
        throw new Error(
            `Invalid "confirmationText": expected exact phrase "${FACTORY_RESET_CONFIRMATION_TEXT}".`
        );
    }

    return {
        confirm,
        confirmationText,
    };
}

export function parseContextBudgetInput(input: unknown): ContextBudgetInput {
    const source = readObject(input, 'input');
    return {
        contextBudget: readEnumValue(source.contextBudget, 'contextBudget', contextBudgets),
    };
}

export function parseRuntimeRegisterWorkspaceRootInput(input: unknown): RuntimeRegisterWorkspaceRootInput {
    const source = readObject(input, 'input');
    const profileId = readOptionalString(source.profileId, 'profileId');
    const absolutePath = readOptionalString(source.absolutePath, 'absolutePath');
    const label = readOptionalString(source.label, 'label');

    if (!profileId || profileId.trim().length === 0) {
        throw new Error('Invalid "profileId": expected non-empty string.');
    }

    if (!absolutePath || absolutePath.trim().length === 0) {
        throw new Error('Invalid "absolutePath": expected non-empty string.');
    }

    return {
        profileId: profileId.trim(),
        absolutePath: absolutePath.trim(),
        ...(label?.trim().length ? { label: label.trim() } : {}),
    };
}

export function parseRuntimeSetWorkspacePreferenceInput(input: unknown): RuntimeSetWorkspacePreferenceInput {
    const source = readObject(input, 'input');
    const profileId = readOptionalString(source.profileId, 'profileId');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const defaultTopLevelTab = source.defaultTopLevelTab === undefined
        ? undefined
        : readEnumValue(source.defaultTopLevelTab, 'defaultTopLevelTab', topLevelTabs);
    const defaultProviderId = source.defaultProviderId === undefined
        ? undefined
        : readEnumValue(source.defaultProviderId, 'defaultProviderId', providerIds);
    const defaultModelId = readOptionalString(source.defaultModelId, 'defaultModelId');

    if (!profileId || profileId.trim().length === 0) {
        throw new Error('Invalid "profileId": expected non-empty string.');
    }

    if (!workspaceFingerprint || workspaceFingerprint.trim().length === 0) {
        throw new Error('Invalid "workspaceFingerprint": expected non-empty string.');
    }

    if ((defaultProviderId && !defaultModelId) || (!defaultProviderId && defaultModelId)) {
        throw new Error('Invalid workspace default model selection: provider and model must be set together.');
    }

    return {
        profileId: profileId.trim(),
        workspaceFingerprint: workspaceFingerprint.trim(),
        ...(defaultTopLevelTab ? { defaultTopLevelTab } : {}),
        ...(defaultProviderId ? { defaultProviderId } : {}),
        ...(defaultModelId?.trim().length ? { defaultModelId: defaultModelId.trim() } : {}),
    };
}

export const runtimeEventsSubscriptionInputSchema = createParser(parseRuntimeEventsSubscriptionInput);
export const neonObservabilitySubscriptionInputSchema = createParser(parseNeonObservabilitySubscriptionInput);
export const windowStateSubscriptionInputSchema = createParser(parseWindowStateSubscriptionInput);
export const runtimeResetInputSchema = createParser(parseRuntimeResetInput);
export const runtimeFactoryResetInputSchema = createParser(parseRuntimeFactoryResetInput);
export const contextBudgetInputSchema = createParser(parseContextBudgetInput);
export const runtimeRegisterWorkspaceRootInputSchema = createParser(parseRuntimeRegisterWorkspaceRootInput);
export const runtimeSetWorkspacePreferenceInputSchema = createParser(parseRuntimeSetWorkspacePreferenceInput);
