import { sessionAttachedRuleStore, sessionAttachedSkillStore } from '@/app/backend/persistence/stores';
import type { RegistryPresetKey, RulesetDefinition, SkillfileDefinition, TopLevelTab } from '@/app/backend/runtime/contracts';
import { getRegistryPresetKeysForMode, type ModeDefinition } from '@/app/backend/runtime/contracts';
import { readRegistryMarkdownBody } from '@/app/backend/runtime/services/registry/filesystem';
import { resolveContextualAssetDefinitions } from '@/app/backend/runtime/services/registry/resolution';
import { listResolvedRegistry, resolveRulesetsByAssetKeys, resolveSkillfilesByAssetKeys } from '@/app/backend/runtime/services/registry/service';
import { createTextMessage } from '@/app/backend/runtime/services/runExecution/contextParts';
import { workspaceContextService } from '@/app/backend/runtime/services/workspaceContext/service';
import {
    errRunExecution,
    okRunExecution,
    type RunExecutionResult,
} from '@/app/backend/runtime/services/runExecution/errors';
import type { RunContextMessage } from '@/app/backend/runtime/services/runExecution/types';

function readModeInstructions(mode: ModeDefinition): string | undefined {
    const instructions = mode.prompt['instructionsMarkdown'];
    return typeof instructions === 'string' && instructions.trim().length > 0 ? instructions.trim() : undefined;
}

function createSystemMessage(label: string, body: string): RunContextMessage {
    return createTextMessage('system', `${label}\n\n${body.trim()}`);
}

function buildWorkspacePrelude(input: {
    workspaceContext: Exclude<Awaited<ReturnType<typeof workspaceContextService.resolveForSession>>, null | { kind: 'detached' }>;
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

function buildAgentPrelude(input: {
    mode: ModeDefinition;
    rulesets: RulesetDefinition[];
    skillfiles: SkillfileDefinition[];
    workspacePrelude?: RunContextMessage;
}): RunContextMessage[] {
    const prelude: RunContextMessage[] = [];
    if (input.workspacePrelude) {
        prelude.push(input.workspacePrelude);
    }

    const modeInstructions = readModeInstructions(input.mode);
    if (modeInstructions) {
        prelude.push(createSystemMessage(`Active mode: ${input.mode.label}`, modeInstructions));
    }

    for (const ruleset of input.rulesets) {
        prelude.push(createSystemMessage(`Ruleset: ${ruleset.name}`, ruleset.bodyMarkdown));
    }

    for (const skillfile of input.skillfiles) {
        prelude.push(createSystemMessage(`Attached skill: ${skillfile.name}`, skillfile.bodyMarkdown));
    }

    return prelude;
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

async function loadActiveSkillBodies(skillfiles: SkillfileDefinition[]): Promise<SkillfileDefinition[]> {
    return Promise.all(
        skillfiles.map(async (skillfile) => {
            if (!skillfile.originPath) {
                return skillfile;
            }

            try {
                const bodyMarkdown = await readRegistryMarkdownBody(skillfile.originPath);
                return {
                    ...skillfile,
                    bodyMarkdown,
                };
            } catch {
                return skillfile;
            }
        })
    );
}

export async function buildSessionSystemPrelude(input: {
    profileId: string;
    sessionId: `sess_${string}`;
    prompt: string;
    topLevelTab: TopLevelTab;
    workspaceFingerprint?: string;
    resolvedMode: {
        mode: ModeDefinition;
    };
}): Promise<RunExecutionResult<RunContextMessage[]>> {
    if (input.topLevelTab === 'chat') {
        return okRunExecution([]);
    }

    const presetKeys = getRegistryPresetKeysForMode({
        topLevelTab: input.topLevelTab,
        modeKey: input.resolvedMode.mode.modeKey,
    });
    const [resolvedRegistry, attachedRuleRows, attachedSkillRows] = await Promise.all([
        listResolvedRegistry({
            profileId: input.profileId,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        }),
        sessionAttachedRuleStore.listBySession(input.profileId, input.sessionId),
        sessionAttachedSkillStore.listBySession(input.profileId, input.sessionId),
    ]);
    const workspaceContext = input.workspaceFingerprint
        ? await workspaceContextService.resolveForSession({
              profileId: input.profileId,
              sessionId: input.sessionId,
              topLevelTab: input.topLevelTab,
              allowLazySandboxCreation: false,
          })
        : null;
    const contextualRulesets = resolveContextualAssetDefinitions({
        items: resolvedRegistry.resolved.rulesets,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        activePresetKeys: presetKeys,
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

    const activeRulesetsByAssetKey = new Map<string, RulesetDefinition>();
    for (const ruleset of [...alwaysRulesets, ...autoRulesets, ...resolvedRules.rulesets]) {
        if (!activeRulesetsByAssetKey.has(ruleset.assetKey)) {
            activeRulesetsByAssetKey.set(ruleset.assetKey, ruleset);
        }
    }
    const activeSkillfiles = await loadActiveSkillBodies(resolvedSkills.skillfiles);

    return okRunExecution(
        buildAgentPrelude({
            mode: input.resolvedMode.mode,
            rulesets: Array.from(activeRulesetsByAssetKey.values()),
            skillfiles: activeSkillfiles,
            ...(workspaceContext && workspaceContext.kind !== 'detached'
                ? { workspacePrelude: buildWorkspacePrelude({ workspaceContext }) }
                : {}),
        })
    );
}
