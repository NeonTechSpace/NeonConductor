import { sessionAttachedRuleStore, sessionAttachedSkillStore } from '@/app/backend/persistence/stores';
import type { WorkspaceEnvironmentSnapshot } from '@/app/backend/runtime/contracts/types/runtime';
import { buildWorkspaceEnvironmentGuidance, workspaceEnvironmentService } from '@/app/backend/runtime/services/environment/service';
import {
    resolveProjectInstructionDocuments,
    type ProjectInstructionDocument,
} from '@/app/backend/runtime/services/projectInstructions/service';
import { getPromptLayerSettings } from '@/app/backend/runtime/services/promptLayers/service';
import { readRegistryMarkdownBody } from '@/app/backend/runtime/services/registry/filesystem';
import { resolveContextualAssetDefinitions } from '@/app/backend/runtime/services/registry/resolution';
import {
    listResolvedRegistry,
    resolveRulesetsByAssetKeys,
    resolveSkillfilesByAssetKeys,
} from '@/app/backend/runtime/services/registry/service';
import { createTextMessage } from '@/app/backend/runtime/services/runExecution/contextParts';
import {
    errRunExecution,
    okRunExecution,
    type RunExecutionResult,
} from '@/app/backend/runtime/services/runExecution/errors';
import type { RunContextMessage, RuntimeToolGuidanceContext } from '@/app/backend/runtime/services/runExecution/types';
import { getWorkspacePreference } from '@/app/backend/runtime/services/workspace/preferences';
import { workspaceContextService } from '@/app/backend/runtime/services/workspaceContext/service';
import type { PreparedContextContributorSpec } from '@/app/backend/runtime/services/context/preparedContextLedger';
import type {
    PreparedContextModeOverrides,
    PreparedContextProfileDefaults,
} from '@/app/backend/runtime/contracts';

import { getRegistryPresetKeysForMode, type ModeDefinition } from '@/shared/contracts';
import type {
    RegistryPresetKey,
    RulesetDefinition,
    SkillfileDefinition,
    TopLevelTab,
} from '@/shared/contracts';

type LoadedSkillfileDefinition = SkillfileDefinition & { bodyMarkdown: string };

function readPromptText(value: string | undefined): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function createSystemMessage(label: string, body: string): RunContextMessage {
    return createTextMessage('system', `${label}\n\n${body.trim()}`);
}

function createContributorSpec(input: {
    id: string;
    kind: PreparedContextContributorSpec['kind'];
    group: PreparedContextContributorSpec['group'];
    label: string;
    source: PreparedContextContributorSpec['source'];
    body: string;
    fixedCheckpoint?: PreparedContextContributorSpec['fixedCheckpoint'];
    eligiblePromptLayerGroup?: PreparedContextContributorSpec['eligiblePromptLayerGroup'];
    inclusionReason?: string;
}): PreparedContextContributorSpec {
    return {
        id: input.id,
        kind: input.kind,
        group: input.group,
        label: input.label,
        source: input.source,
        messages: [createSystemMessage(input.label, input.body)],
        ...(input.fixedCheckpoint ? { fixedCheckpoint: input.fixedCheckpoint } : {}),
        ...(input.eligiblePromptLayerGroup ? { eligiblePromptLayerGroup: input.eligiblePromptLayerGroup } : {}),
        ...(input.inclusionReason ? { inclusionReason: input.inclusionReason } : {}),
    };
}

function buildWorkspacePrelude(input: {
    workspaceContext: Exclude<
        Awaited<ReturnType<typeof workspaceContextService.resolveForSession>>,
        null | { kind: 'detached' }
    >;
}): RunContextMessage {
    if (input.workspaceContext.kind === 'sandbox') {
        return createSystemMessage(
            'Execution environment',
            [
                `This session runs inside the managed sandbox "${input.workspaceContext.label}" at ${input.workspaceContext.absolutePath}.`,
                `The base workspace is "${input.workspaceContext.baseWorkspace.label}" at ${input.workspaceContext.baseWorkspace.absolutePath}.`,
                'If any provider or tool output refers to a generic alias like "/workspace", treat it as an alias only and prefer these concrete paths.',
            ].join(' ')
        );
    }

    return createSystemMessage(
        'Execution environment',
        [
            `This session is bound to the workspace "${input.workspaceContext.label}" at ${input.workspaceContext.absolutePath}.`,
            'Workspace tools and command execution resolve relative paths from that directory.',
            'If any provider or tool output refers to a generic alias like "/workspace", treat it as an alias only and prefer this concrete path.',
        ].join(' ')
    );
}

async function buildWorkspacePreludeMessages(input: {
    profileId: string;
    workspaceFingerprint: string;
    workspaceContext: Exclude<
        Awaited<ReturnType<typeof workspaceContextService.resolveForSession>>,
        null | { kind: 'detached' }
    >;
    workspaceEnvironmentSnapshot?: WorkspaceEnvironmentSnapshot;
    runtimeToolGuidanceContext?: RuntimeToolGuidanceContext;
}): Promise<RunContextMessage[]> {
    const messages = [buildWorkspacePrelude({ workspaceContext: input.workspaceContext })];
    const environmentSnapshot =
        input.workspaceEnvironmentSnapshot ??
        (await (async () => {
            const workspacePreference = await getWorkspacePreference(input.profileId, input.workspaceFingerprint);
            const environmentSnapshotResult = await workspaceEnvironmentService.inspectWorkspaceEnvironment({
                workspaceRootPath: input.workspaceContext.absolutePath,
                ...(input.workspaceContext.kind === 'sandbox'
                    ? { baseWorkspaceRootPath: input.workspaceContext.baseWorkspace.absolutePath }
                    : {}),
                ...(workspacePreference
                    ? {
                          overrides: {
                              ...(workspacePreference.preferredVcs
                                  ? { preferredVcs: workspacePreference.preferredVcs }
                                  : {}),
                              ...(workspacePreference.preferredPackageManager
                                  ? { preferredPackageManager: workspacePreference.preferredPackageManager }
                                  : {}),
                          },
                      }
                    : {}),
            });

            return environmentSnapshotResult.isOk() ? environmentSnapshotResult.value : undefined;
        })());

    if (environmentSnapshot) {
        const environmentGuidanceOptions = input.runtimeToolGuidanceContext
            ? {
                  vendoredRipgrepAvailable: input.runtimeToolGuidanceContext.vendoredRipgrepAvailable,
              }
            : undefined;
        messages.push(
            createSystemMessage(
                'Environment guidance',
                buildWorkspaceEnvironmentGuidance(environmentSnapshot, environmentGuidanceOptions)
            )
        );
    }

    return messages;
}

function buildAgentPreludeContributorSpecs(input: {
    appGlobalInstructions?: string;
    profileGlobalInstructions?: string;
    topLevelInstructions?: string;
    mode: ModeDefinition;
    rulesets: Array<{ ruleset: RulesetDefinition; inclusionReason: string }>;
    projectInstructions: ProjectInstructionDocument[];
    skillfiles: LoadedSkillfileDefinition[];
    workspacePrelude?: RunContextMessage[];
    workspaceContextLabel?: string;
}): PreparedContextContributorSpec[] {
    const prelude: PreparedContextContributorSpec[] = [];
    if (input.workspacePrelude) {
        input.workspacePrelude.forEach((message, index) => {
            prelude.push({
                id: index === 0 ? 'workspace_prelude' : 'environment_guidance',
                kind: index === 0 ? 'workspace_prelude' : 'environment_guidance',
                group: 'runtime_environment',
                label: extractPreludeLabel(message),
                source: {
                    kind: index === 0 ? 'workspace' : 'environment',
                    key: index === 0 ? 'workspace_prelude' : 'environment_guidance',
                    label: index === 0 ? (input.workspaceContextLabel ?? 'Workspace') : 'Environment guidance',
                },
                messages: [message],
                fixedCheckpoint: 'bootstrap',
                inclusionReason: 'Included by runtime-owned workspace context resolution.',
            });
        });
    }

    const appGlobalInstructions = readPromptText(input.appGlobalInstructions);
    if (appGlobalInstructions) {
        prelude.push(
            createContributorSpec({
                id: 'prompt_layer_app_global_instructions',
                kind: 'prompt_layer',
                group: 'shared_prompt_layer',
                label: 'App instructions',
                source: {
                    kind: 'prompt_layer',
                    key: 'app_global_instructions',
                    label: 'App instructions',
                },
                body: appGlobalInstructions,
                eligiblePromptLayerGroup: 'app_global_instructions',
            })
        );
    }

    const profileGlobalInstructions = readPromptText(input.profileGlobalInstructions);
    if (profileGlobalInstructions) {
        prelude.push(
            createContributorSpec({
                id: 'prompt_layer_profile_global_instructions',
                kind: 'prompt_layer',
                group: 'shared_prompt_layer',
                label: 'Profile instructions',
                source: {
                    kind: 'prompt_layer',
                    key: 'profile_global_instructions',
                    label: 'Profile instructions',
                },
                body: profileGlobalInstructions,
                eligiblePromptLayerGroup: 'profile_global_instructions',
            })
        );
    }

    const topLevelInstructions = readPromptText(input.topLevelInstructions);
    if (topLevelInstructions) {
        prelude.push(
            createContributorSpec({
                id: `prompt_layer_top_level_instructions_${input.mode.topLevelTab}`,
                kind: 'prompt_layer',
                group: 'shared_prompt_layer',
                label: `Built-in ${input.mode.topLevelTab} instructions`,
                source: {
                    kind: 'prompt_layer',
                    key: `top_level_instructions:${input.mode.topLevelTab}`,
                    label: `Built-in ${input.mode.topLevelTab} instructions`,
                },
                body: topLevelInstructions,
                eligiblePromptLayerGroup: 'top_level_instructions',
            })
        );
    }

    const roleDefinition = readPromptText(input.mode.prompt.roleDefinition);
    if (roleDefinition) {
        prelude.push(
            createContributorSpec({
                id: `mode_role_definition:${input.mode.modeKey}`,
                kind: 'mode_role_definition',
                group: 'mode_prompt',
                label: `Active mode role: ${input.mode.label}`,
                source: {
                    kind: 'mode',
                    key: `${input.mode.topLevelTab}:${input.mode.modeKey}:role_definition`,
                    label: input.mode.label,
                },
                body: roleDefinition,
                fixedCheckpoint: 'bootstrap',
                inclusionReason: 'Included by the active mode prompt definition.',
            })
        );
    }

    const customInstructions = readPromptText(input.mode.prompt.customInstructions);
    if (customInstructions) {
        prelude.push(
            createContributorSpec({
                id: `mode_custom_instructions:${input.mode.modeKey}`,
                kind: 'mode_custom_instructions',
                group: 'mode_prompt',
                label: `Active mode instructions: ${input.mode.label}`,
                source: {
                    kind: 'mode',
                    key: `${input.mode.topLevelTab}:${input.mode.modeKey}:custom_instructions`,
                    label: input.mode.label,
                },
                body: customInstructions,
                fixedCheckpoint: 'bootstrap',
                inclusionReason: 'Included by the active mode prompt definition.',
            })
        );
    }

    for (const entry of input.rulesets) {
        const { ruleset } = entry;
        prelude.push(
            createContributorSpec({
                id: `ruleset:${ruleset.assetKey}`,
                kind: 'ruleset',
                group: 'ruleset',
                label: `Ruleset: ${ruleset.name}`,
                source: {
                    kind: 'ruleset',
                    key: ruleset.assetKey,
                    label: ruleset.name,
                },
                body: ruleset.bodyMarkdown,
                fixedCheckpoint: 'bootstrap',
                inclusionReason: entry.inclusionReason,
            })
        );
    }

    for (const projectInstruction of input.projectInstructions) {
        prelude.push(
            createContributorSpec({
                id: `project_instruction:${projectInstruction.displayPath}`,
                kind: 'project_instruction',
                group: 'project_instruction',
                label: `Project instructions: ${projectInstruction.displayPath}`,
                source: {
                    kind: 'project_instruction',
                    key: projectInstruction.displayPath,
                    label: projectInstruction.displayPath,
                },
                body: projectInstruction.bodyMarkdown,
                fixedCheckpoint: 'bootstrap',
                inclusionReason: 'Included by repo-local instruction discovery.',
            })
        );
    }

    for (const skillfile of input.skillfiles) {
        prelude.push(
            createContributorSpec({
                id: `attached_skill:${skillfile.assetKey}`,
                kind: 'attached_skill',
                group: 'attached_skill',
                label: `Attached skill: ${skillfile.name}`,
                source: {
                    kind: 'skill',
                    key: skillfile.assetKey,
                    label: skillfile.name,
                },
                body: skillfile.bodyMarkdown,
                fixedCheckpoint: 'bootstrap',
                inclusionReason: 'Included because the skill is attached to the active session.',
            })
        );
    }

    return prelude;
}

function extractPreludeLabel(message: RunContextMessage): string {
    const firstTextPart = message.parts.find((part) => part.type === 'text');
    if (!firstTextPart || firstTextPart.type !== 'text') {
        return 'Prepared context';
    }

    return firstTextPart.text.split('\n\n', 1)[0]?.trim() || 'Prepared context';
}

function shouldAutoApplyRuleset(input: {
    ruleset: RulesetDefinition;
    prompt: string;
    presetKeys: RegistryPresetKey[];
    topLevelTab: TopLevelTab;
    modeKey: string;
}): boolean {
    if (input.ruleset.activationMode !== 'auto') {
        return false;
    }

    const normalizedPrompt = input.prompt.trim().toLowerCase();
    const normalizedHaystacks = [
        input.ruleset.name,
        input.ruleset.description ?? '',
        ...(input.ruleset.tags ?? []),
        input.topLevelTab,
        input.modeKey,
        ...input.presetKeys,
    ]
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0);

    if (normalizedHaystacks.length === 0) {
        return false;
    }

    return normalizedHaystacks.some((value) => normalizedPrompt.includes(value));
}

function describeAutoApplyRulesetReason(input: {
    ruleset: RulesetDefinition;
    prompt: string;
    presetKeys: RegistryPresetKey[];
    topLevelTab: TopLevelTab;
    modeKey: string;
}): string | undefined {
    if (input.ruleset.activationMode !== 'auto') {
        return undefined;
    }

    const normalizedPrompt = input.prompt.trim().toLowerCase();
    const candidates = [
        { label: 'rule name', value: input.ruleset.name },
        { label: 'rule description', value: input.ruleset.description ?? '' },
        ...(input.ruleset.tags ?? []).map((tag) => ({ label: 'rule tag', value: tag })),
        { label: 'active top-level tab', value: input.topLevelTab },
        { label: 'active mode key', value: input.modeKey },
        ...input.presetKeys.map((presetKey) => ({ label: 'active preset', value: presetKey })),
    ]
        .map((candidate) => ({
            label: candidate.label,
            value: candidate.value.trim().toLowerCase(),
        }))
        .filter((candidate) => candidate.value.length > 0);

    const match = candidates.find((candidate) => normalizedPrompt.includes(candidate.value));
    return match ? `Included because the prompt matched the ${match.label} "${match.value}".` : undefined;
}

async function loadActiveSkillBodies(
    skillfiles: SkillfileDefinition[]
): Promise<RunExecutionResult<LoadedSkillfileDefinition[]>> {
    const loadedSkillfiles: LoadedSkillfileDefinition[] = [];

    for (const skillfile of skillfiles) {
        if (skillfile.bodyMarkdown && skillfile.bodyMarkdown.trim().length > 0) {
            loadedSkillfiles.push({
                ...skillfile,
                bodyMarkdown: skillfile.bodyMarkdown,
            });
            continue;
        }

        if (!skillfile.originPath) {
            return errRunExecution(
                'invalid_payload',
                `Attached skill "${skillfile.name}" is missing its origin path and cannot be loaded from disk.`
            );
        }

        try {
            const bodyMarkdown = await readRegistryMarkdownBody(skillfile.originPath);
            loadedSkillfiles.push({
                ...skillfile,
                bodyMarkdown,
            });
        } catch {
            return errRunExecution(
                'invalid_payload',
                `Attached skill "${skillfile.name}" could not be loaded from "${skillfile.originPath}". Refresh the registry or repair the skill package.`
            );
        }
    }

    return okRunExecution(loadedSkillfiles);
}

export async function buildSessionSystemPrelude(input: {
    profileId: string;
    sessionId: `sess_${string}`;
    prompt: string;
    topLevelTab: TopLevelTab;
    workspaceFingerprint?: string;
    workspaceContext?: Awaited<ReturnType<typeof workspaceContextService.resolveForSession>>;
    workspaceEnvironmentSnapshot?: WorkspaceEnvironmentSnapshot;
    runtimeToolGuidanceContext?: RuntimeToolGuidanceContext;
    resolvedMode: {
        mode: ModeDefinition;
    };
}): Promise<
    RunExecutionResult<{
        contributorSpecs: PreparedContextContributorSpec[];
        preparedContextProfileDefaults: PreparedContextProfileDefaults;
        modePromptLayerOverrides: PreparedContextModeOverrides;
        attachedSkillfiles: SkillfileDefinition[];
        resolvedWorkspaceContext?: Awaited<ReturnType<typeof workspaceContextService.resolveForSession>>;
    }>
> {
    const presetKeys = getRegistryPresetKeysForMode({
        topLevelTab: input.topLevelTab,
        modeKey: input.resolvedMode.mode.modeKey,
    });
    const [promptLayerSettings, resolvedRegistry, attachedRuleRows, attachedSkillRows] = await Promise.all([
        getPromptLayerSettings(input.profileId),
        listResolvedRegistry({
            profileId: input.profileId,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        }),
        sessionAttachedRuleStore.listBySession(input.profileId, input.sessionId),
        sessionAttachedSkillStore.listBySession(input.profileId, input.sessionId),
    ]);
    const workspaceContext =
        input.workspaceContext ??
        (input.workspaceFingerprint
            ? await workspaceContextService.resolveForSession({
                  profileId: input.profileId,
                  sessionId: input.sessionId,
                  topLevelTab: input.topLevelTab,
                  allowLazySandboxCreation: false,
              })
            : null);
    const projectInstructions =
        workspaceContext && workspaceContext.kind !== 'detached'
            ? await resolveProjectInstructionDocuments({
                  workspaceRootPath: workspaceContext.absolutePath,
              })
            : [];
    const contextualRulesets = resolveContextualAssetDefinitions({
        items: resolvedRegistry.resolved.rulesets,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        activePresetKeys: presetKeys,
        topLevelTab: input.topLevelTab,
        modeKey: input.resolvedMode.mode.modeKey,
    });
    const alwaysRulesets = contextualRulesets.filter((ruleset) => ruleset.activationMode === 'always');
    const autoRulesets = contextualRulesets.filter((ruleset) =>
        shouldAutoApplyRuleset({
            ruleset,
            prompt: input.prompt,
            presetKeys,
            topLevelTab: input.topLevelTab,
            modeKey: input.resolvedMode.mode.modeKey,
        })
    );
    const resolvedRules = await resolveRulesetsByAssetKeys({
        profileId: input.profileId,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        assetKeys: attachedRuleRows.map((rule) => rule.assetKey),
        topLevelTab: input.topLevelTab,
        modeKey: input.resolvedMode.mode.modeKey,
    });
    const resolvedSkills = await resolveSkillfilesByAssetKeys({
        profileId: input.profileId,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        assetKeys: attachedSkillRows.map((skill) => skill.assetKey),
        topLevelTab: input.topLevelTab,
        modeKey: input.resolvedMode.mode.modeKey,
    });

    if (resolvedRules.missingAssetKeys.length > 0) {
        const missingList = resolvedRules.missingAssetKeys.map((assetKey) => `"${assetKey}"`).join(', ');
        return errRunExecution(
            'invalid_payload',
            `Session references unresolved attached rules: ${missingList}. Refresh the registry or update attached rules.`
        );
    }

    if (resolvedSkills.missingAssetKeys.length > 0) {
        const missingList = resolvedSkills.missingAssetKeys.map((assetKey) => `"${assetKey}"`).join(', ');
        return errRunExecution(
            'invalid_payload',
            `Session references unresolved attached skills: ${missingList}. Refresh the registry or update attached skills.`
        );
    }

    const activeRulesetsByAssetKey = new Map<string, { ruleset: RulesetDefinition; inclusionReason: string }>();
    for (const ruleset of alwaysRulesets) {
        if (!activeRulesetsByAssetKey.has(ruleset.assetKey)) {
            activeRulesetsByAssetKey.set(ruleset.assetKey, {
                ruleset,
                inclusionReason: 'Included because this ruleset is marked always for the active mode context.',
            });
        }
    }
    for (const ruleset of autoRulesets) {
        if (!activeRulesetsByAssetKey.has(ruleset.assetKey)) {
            activeRulesetsByAssetKey.set(ruleset.assetKey, {
                ruleset,
                inclusionReason:
                    describeAutoApplyRulesetReason({
                        ruleset,
                        prompt: input.prompt,
                        presetKeys,
                        topLevelTab: input.topLevelTab,
                        modeKey: input.resolvedMode.mode.modeKey,
                    }) ?? 'Included because this auto ruleset matched the active prompt and mode context.',
            });
        }
    }
    for (const ruleset of resolvedRules.rulesets) {
        if (!activeRulesetsByAssetKey.has(ruleset.assetKey)) {
            activeRulesetsByAssetKey.set(ruleset.assetKey, {
                ruleset,
                inclusionReason: 'Included because this manual ruleset is explicitly attached to the active session.',
            });
        }
    }
    const activeSkillfilesResult = await loadActiveSkillBodies(resolvedSkills.skillfiles);
    if (activeSkillfilesResult.isErr()) {
        return errRunExecution(activeSkillfilesResult.error.code, activeSkillfilesResult.error.message, {
            ...(activeSkillfilesResult.error.action ? { action: activeSkillfilesResult.error.action } : {}),
        });
    }
    const activeSkillfiles = activeSkillfilesResult.value;
    const workspacePrelude =
        workspaceContext && workspaceContext.kind !== 'detached' && input.workspaceFingerprint
            ? await buildWorkspacePreludeMessages({
                  profileId: input.profileId,
                  workspaceFingerprint: input.workspaceFingerprint,
                  workspaceContext,
                  ...(input.workspaceEnvironmentSnapshot
                      ? { workspaceEnvironmentSnapshot: input.workspaceEnvironmentSnapshot }
                      : {}),
                  ...(input.runtimeToolGuidanceContext
                      ? { runtimeToolGuidanceContext: input.runtimeToolGuidanceContext }
                      : {}),
              })
            : undefined;

    return okRunExecution(
        {
            contributorSpecs: buildAgentPreludeContributorSpecs({
                appGlobalInstructions: promptLayerSettings.appGlobalInstructions,
                profileGlobalInstructions: promptLayerSettings.profileGlobalInstructions,
                topLevelInstructions: promptLayerSettings.topLevelInstructions[input.topLevelTab],
                mode: input.resolvedMode.mode,
                rulesets: Array.from(activeRulesetsByAssetKey.values()),
                projectInstructions,
                skillfiles: activeSkillfiles,
                ...(workspacePrelude ? { workspacePrelude } : {}),
                ...(workspaceContext && workspaceContext.kind !== 'detached'
                    ? { workspaceContextLabel: workspaceContext.label }
                    : {}),
            }),
            preparedContextProfileDefaults: promptLayerSettings.preparedContextProfileDefaults,
            modePromptLayerOverrides: input.resolvedMode.mode.promptLayerOverrides,
            attachedSkillfiles: activeSkillfiles,
            ...(workspaceContext ? { resolvedWorkspaceContext: workspaceContext } : {}),
        }
    );
}

