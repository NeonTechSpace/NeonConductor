import { contextBudgets, runtimeResetTargets } from '@/app/backend/runtime/contracts/enums';
import {
    createParser,
    readArray,
    readBoolean,
    readEntityId,
    readEnumValue,
    readObject,
    readOptionalBoolean,
    readOptionalNumber,
    readOptionalString,
    readProviderId,
    readString,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import type {
    ContextBudgetInput,
    NeonObservabilitySubscriptionInput,
    RuntimeFactoryResetInput,
    RuntimeEventsSubscriptionInput,
    RuntimeInspectWorkspaceEnvironmentInput,
    RuntimeApplyRepoCommitInput,
    RuntimeApplyRepoPushInput,
    RuntimeGenerateRepoTextDraftInput,
    RuntimePatchWorkspaceRootInput,
    RuntimeRepoCommitInput,
    RuntimeRepoPushInput,
    RuntimePreviewResearchTargetInput,
    RuntimeRegisterWorkspaceRootInput,
    RuntimeResetInput,
    RuntimeSetResearchCheckoutRootSettingsInput,
    RuntimeSetWorkspacePreferenceInput,
    WindowStateSubscriptionInput,
} from '@/app/backend/runtime/contracts/types';
import { FACTORY_RESET_CONFIRMATION_TEXT } from '@/app/backend/runtime/contracts/types';
import {
    repoGeneratedDraftKinds,
    repoMutationIntents,
    researchCheckoutRootPolicies,
} from '@/app/backend/runtime/contracts/types/research';
import {
    workspacePreferredPackageManagerValues,
    workspacePreferredVcsValues,
} from '@/app/backend/runtime/contracts/types/runtime';

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
        throw new Error(`Invalid "confirmationText": expected exact phrase "${FACTORY_RESET_CONFIRMATION_TEXT}".`);
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

export function parseRuntimePatchWorkspaceRootInput(input: unknown): RuntimePatchWorkspaceRootInput {
    const source = readObject(input, 'input');
    const profileId = readOptionalString(source.profileId, 'profileId');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const label = readOptionalString(source.label, 'label');
    const iconActionSource = source.iconAction === undefined ? undefined : readObject(source.iconAction, 'iconAction');

    if (!profileId || profileId.trim().length === 0) {
        throw new Error('Invalid "profileId": expected non-empty string.');
    }

    if (!workspaceFingerprint || workspaceFingerprint.trim().length === 0) {
        throw new Error('Invalid "workspaceFingerprint": expected non-empty string.');
    }

    if (label !== undefined && label.trim().length === 0) {
        throw new Error('Invalid "label": expected non-empty string when provided.');
    }

    const iconAction =
        iconActionSource === undefined
            ? undefined
            : (() => {
                  const kind = readEnumValue(iconActionSource.kind, 'iconAction.kind', [
                      'set_manual',
                      'clear_manual',
                      'refresh_detected',
                  ] as const);
                  if (kind === 'set_manual') {
                      return {
                          kind,
                          sourceAbsolutePath: readString(
                              iconActionSource.sourceAbsolutePath,
                              'iconAction.sourceAbsolutePath'
                          ),
                      };
                  }

                  return { kind };
              })();

    return {
        profileId: profileId.trim(),
        workspaceFingerprint: workspaceFingerprint.trim(),
        ...(label !== undefined ? { label: label.trim() } : {}),
        ...(iconAction ? { iconAction } : {}),
    };
}

export function parseRuntimeSetWorkspacePreferenceInput(input: unknown): RuntimeSetWorkspacePreferenceInput {
    const source = readObject(input, 'input');
    const profileId = readOptionalString(source.profileId, 'profileId');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const defaultTopLevelTab =
        source.defaultTopLevelTab === undefined
            ? undefined
            : readEnumValue(source.defaultTopLevelTab, 'defaultTopLevelTab', topLevelTabs);
    const defaultProviderId =
        source.defaultProviderId === undefined
            ? undefined
            : readEnumValue(source.defaultProviderId, 'defaultProviderId', providerIds);
    const defaultModelId = readOptionalString(source.defaultModelId, 'defaultModelId');
    const preferredVcs =
        source.preferredVcs === undefined
            ? undefined
            : readEnumValue(source.preferredVcs, 'preferredVcs', workspacePreferredVcsValues);
    const preferredPackageManager =
        source.preferredPackageManager === undefined
            ? undefined
            : readEnumValue(
                  source.preferredPackageManager,
                  'preferredPackageManager',
                  workspacePreferredPackageManagerValues
              );

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
        ...(preferredVcs ? { preferredVcs } : {}),
        ...(preferredPackageManager ? { preferredPackageManager } : {}),
    };
}

export function parseResearchTargetRequest(value: unknown, field: string) {
    const source = readObject(value, field);
    const repoUrl = readString(source.repoUrl, `${field}.repoUrl`).trim();
    if (repoUrl.length === 0) {
        throw new Error(`Invalid "${field}.repoUrl": expected non-empty string.`);
    }

    const requestedTargetSource =
        source.requestedTarget === undefined
            ? undefined
            : readObject(source.requestedTarget, `${field}.requestedTarget`);
    const requestedTarget =
        requestedTargetSource === undefined
            ? undefined
            : (() => {
                  const kind = readEnumValue(requestedTargetSource.kind, `${field}.requestedTarget.kind`, [
                      'default_branch',
                      'branch',
                      'pull_request',
                      'commit',
                  ] as const);
                  if (kind === 'branch') {
                      const name = readString(requestedTargetSource.name, `${field}.requestedTarget.name`).trim();
                      if (name.length === 0) {
                          throw new Error(`Invalid "${field}.requestedTarget.name": expected non-empty string.`);
                      }
                      return { kind, name };
                  }
                  if (kind === 'pull_request') {
                      const id = readString(requestedTargetSource.id, `${field}.requestedTarget.id`).trim();
                      if (id.length === 0) {
                          throw new Error(`Invalid "${field}.requestedTarget.id": expected non-empty string.`);
                      }
                      return { kind, id };
                  }
                  if (kind === 'commit') {
                      const sha = readString(requestedTargetSource.sha, `${field}.requestedTarget.sha`).trim();
                      if (!/^[0-9a-f]{7,64}$/iu.test(sha)) {
                          throw new Error(`Invalid "${field}.requestedTarget.sha": expected commit SHA.`);
                      }
                      return { kind, sha };
                  }
                  return { kind };
              })();
    const mutationIntent =
        source.mutationIntent === undefined
            ? undefined
            : readEnumValue(source.mutationIntent, `${field}.mutationIntent`, repoMutationIntents);

    return {
        repoUrl,
        ...(requestedTarget ? { requestedTarget } : {}),
        ...(mutationIntent ? { mutationIntent } : {}),
    };
}

export function parseRuntimeSetResearchCheckoutRootSettingsInput(
    input: unknown
): RuntimeSetResearchCheckoutRootSettingsInput {
    const source = readObject(input, 'input');
    const profileId = readOptionalString(source.profileId, 'profileId');
    const policy = readEnumValue(source.policy, 'policy', researchCheckoutRootPolicies);
    const customAbsolutePath = readOptionalString(source.customAbsolutePath, 'customAbsolutePath')?.trim();

    if (!profileId || profileId.trim().length === 0) {
        throw new Error('Invalid "profileId": expected non-empty string.');
    }

    if (policy === 'custom_path' && !customAbsolutePath) {
        throw new Error('Invalid "customAbsolutePath": required when policy is "custom_path".');
    }

    if (policy !== 'custom_path' && customAbsolutePath) {
        throw new Error('Invalid "customAbsolutePath": only valid when policy is "custom_path".');
    }

    return {
        profileId: profileId.trim(),
        policy,
        ...(customAbsolutePath ? { customAbsolutePath } : {}),
    };
}

export function parseRuntimePreviewResearchTargetInput(input: unknown): RuntimePreviewResearchTargetInput {
    const source = readObject(input, 'input');
    const profileId = readOptionalString(source.profileId, 'profileId');
    const sessionId = source.sessionId !== undefined ? readEntityId(source.sessionId, 'sessionId', 'sess') : undefined;
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint')?.trim();

    if (!profileId || profileId.trim().length === 0) {
        throw new Error('Invalid "profileId": expected non-empty string.');
    }

    return {
        profileId: profileId.trim(),
        ...(sessionId ? { sessionId } : {}),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        target: parseResearchTargetRequest(source.target, 'target'),
    };
}

function readCommitMessage(value: unknown, field: string): string {
    const message = readString(value, field);
    if (message.includes('\0')) {
        throw new Error(`Invalid "${field}": NUL bytes are not allowed.`);
    }
    if (message.length > 4000) {
        throw new Error(`Invalid "${field}": expected 4000 characters or fewer.`);
    }
    return message;
}

function readSelectedPaths(value: unknown, field: string): string[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    const paths: string[] = readArray(value, field).map((item: unknown, index: number) =>
        readString(item, `${field}[${String(index)}]`)
    );
    for (const selectedPath of paths) {
        if (selectedPath.includes('\0') || selectedPath.startsWith('/') || /^[a-z]:/iu.test(selectedPath)) {
            throw new Error(`Invalid "${field}": selected paths must be relative checkout paths.`);
        }
        const segments: string[] = selectedPath.split(/[\\/]+/u);
        if (segments.some((segment) => segment === '..' || segment.trim().length === 0)) {
            throw new Error(`Invalid "${field}": selected paths must stay inside the checkout.`);
        }
    }
    return [...new Set(paths)];
}

export function parseRuntimeRepoCommitInput(input: unknown): RuntimeRepoCommitInput {
    const source = readObject(input, 'input');
    const profileId = readOptionalString(source.profileId, 'profileId');
    if (!profileId || profileId.trim().length === 0) {
        throw new Error('Invalid "profileId": expected non-empty string.');
    }

    const selectedPaths = readSelectedPaths(source.selectedPaths, 'selectedPaths');
    return {
        profileId: profileId.trim(),
        researchCheckoutRecordId: readEntityId(source.researchCheckoutRecordId, 'researchCheckoutRecordId', 'rch'),
        message: readCommitMessage(source.message, 'message'),
        ...(selectedPaths ? { selectedPaths } : {}),
    };
}

export function parseRuntimeApplyRepoCommitInput(input: unknown): RuntimeApplyRepoCommitInput {
    const parsed = parseRuntimeRepoCommitInput(input);
    const source = readObject(input, 'input');

    return {
        ...parsed,
        expectedCommitDigest: readString(source.expectedCommitDigest, 'expectedCommitDigest'),
    };
}

export function parseRuntimeRepoPushInput(input: unknown): RuntimeRepoPushInput {
    const source = readObject(input, 'input');
    const profileId = readOptionalString(source.profileId, 'profileId');
    if (!profileId || profileId.trim().length === 0) {
        throw new Error('Invalid "profileId": expected non-empty string.');
    }

    return {
        profileId: profileId.trim(),
        researchCheckoutRecordId: readEntityId(source.researchCheckoutRecordId, 'researchCheckoutRecordId', 'rch'),
    };
}

export function parseRuntimeApplyRepoPushInput(input: unknown): RuntimeApplyRepoPushInput {
    const parsed = parseRuntimeRepoPushInput(input);
    const source = readObject(input, 'input');

    return {
        ...parsed,
        expectedPushDigest: readString(source.expectedPushDigest, 'expectedPushDigest'),
    };
}

export function parseRuntimeGenerateRepoTextDraftInput(input: unknown): RuntimeGenerateRepoTextDraftInput {
    const parsed = parseRuntimeRepoCommitInput(input);
    const source = readObject(input, 'input');
    const providerId = source.providerId === undefined ? undefined : readProviderId(source.providerId, 'providerId');
    const modelId = readOptionalString(source.modelId, 'modelId');
    if ((providerId && !modelId) || (!providerId && modelId)) {
        throw new Error('Invalid repo text draft model selection: provider and model must be set together.');
    }

    return {
        ...parsed,
        draftKind: readEnumValue(source.draftKind, 'draftKind', repoGeneratedDraftKinds),
        ...(providerId ? { providerId } : {}),
        ...(modelId ? { modelId } : {}),
    };
}

export function parseRuntimeInspectWorkspaceEnvironmentInput(input: unknown): RuntimeInspectWorkspaceEnvironmentInput {
    const source = readObject(input, 'input');
    const profileId = readOptionalString(source.profileId, 'profileId');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const absolutePath = readOptionalString(source.absolutePath, 'absolutePath');

    if (!profileId || profileId.trim().length === 0) {
        throw new Error('Invalid "profileId": expected non-empty string.');
    }

    const hasWorkspaceFingerprint = Boolean(workspaceFingerprint && workspaceFingerprint.trim().length > 0);
    const hasAbsolutePath = Boolean(absolutePath && absolutePath.trim().length > 0);

    if (hasWorkspaceFingerprint === hasAbsolutePath) {
        throw new Error(
            'Invalid workspace environment target: provide exactly one of "workspaceFingerprint" or "absolutePath".'
        );
    }

    if (hasWorkspaceFingerprint) {
        const trimmedWorkspaceFingerprint = workspaceFingerprint?.trim();
        if (!trimmedWorkspaceFingerprint) {
            throw new Error('Invalid "workspaceFingerprint": expected non-empty string.');
        }

        return {
            profileId: profileId.trim(),
            workspaceFingerprint: trimmedWorkspaceFingerprint,
        };
    }

    const trimmedAbsolutePath = absolutePath?.trim();
    if (!trimmedAbsolutePath) {
        throw new Error('Invalid "absolutePath": expected non-empty string.');
    }

    return {
        profileId: profileId.trim(),
        absolutePath: trimmedAbsolutePath,
    };
}

export const runtimeEventsSubscriptionInputSchema = createParser(parseRuntimeEventsSubscriptionInput);
export const neonObservabilitySubscriptionInputSchema = createParser(parseNeonObservabilitySubscriptionInput);
export const windowStateSubscriptionInputSchema = createParser(parseWindowStateSubscriptionInput);
export const runtimeResetInputSchema = createParser(parseRuntimeResetInput);
export const runtimeFactoryResetInputSchema = createParser(parseRuntimeFactoryResetInput);
export const contextBudgetInputSchema = createParser(parseContextBudgetInput);
export const runtimeRegisterWorkspaceRootInputSchema = createParser(parseRuntimeRegisterWorkspaceRootInput);
export const runtimePatchWorkspaceRootInputSchema = createParser(parseRuntimePatchWorkspaceRootInput);
export const runtimeSetWorkspacePreferenceInputSchema = createParser(parseRuntimeSetWorkspacePreferenceInput);
export const runtimeSetResearchCheckoutRootSettingsInputSchema = createParser(
    parseRuntimeSetResearchCheckoutRootSettingsInput
);
export const runtimePreviewResearchTargetInputSchema = createParser(parseRuntimePreviewResearchTargetInput);
export const runtimeRepoCommitInputSchema = createParser(parseRuntimeRepoCommitInput);
export const runtimeApplyRepoCommitInputSchema = createParser(parseRuntimeApplyRepoCommitInput);
export const runtimeRepoPushInputSchema = createParser(parseRuntimeRepoPushInput);
export const runtimeApplyRepoPushInputSchema = createParser(parseRuntimeApplyRepoPushInput);
export const runtimeGenerateRepoTextDraftInputSchema = createParser(parseRuntimeGenerateRepoTextDraftInput);
export const runtimeInspectWorkspaceEnvironmentInputSchema = createParser(parseRuntimeInspectWorkspaceEnvironmentInput);
