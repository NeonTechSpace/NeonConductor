import { sessionAttachedSkillStore } from '@/app/backend/persistence/stores';
import type { RulesetDefinition, SkillfileDefinition, TopLevelTab } from '@/app/backend/runtime/contracts';
import type { ModeDefinition } from '@/app/backend/runtime/contracts';
import { listResolvedRegistry, resolveSkillfilesByAssetKeys } from '@/app/backend/runtime/services/registry/service';
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
    return {
        role: 'system',
        text: `${label}\n\n${body.trim()}`,
    };
}

function buildAgentPrelude(input: {
    mode: ModeDefinition;
    rulesets: RulesetDefinition[];
    skillfiles: SkillfileDefinition[];
}): RunContextMessage[] {
    const prelude: RunContextMessage[] = [];
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

export async function buildSessionSystemPrelude(input: {
    profileId: string;
    sessionId: `sess_${string}`;
    topLevelTab: TopLevelTab;
    workspaceFingerprint?: string;
    resolvedMode: {
        mode: ModeDefinition;
    };
}): Promise<RunExecutionResult<RunContextMessage[]>> {
    if (input.topLevelTab === 'chat' || input.topLevelTab === 'orchestrator') {
        return okRunExecution([]);
    }

    const [resolvedRegistry, attachedSkillRows] = await Promise.all([
        listResolvedRegistry({
            profileId: input.profileId,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        }),
        sessionAttachedSkillStore.listBySession(input.profileId, input.sessionId),
    ]);
    const resolvedSkills = await resolveSkillfilesByAssetKeys({
        profileId: input.profileId,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        assetKeys: attachedSkillRows.map((skill) => skill.assetKey),
    });

    if (resolvedSkills.missingAssetKeys.length > 0) {
        const missingList = resolvedSkills.missingAssetKeys.map((assetKey) => `"${assetKey}"`).join(', ');
        return errRunExecution(
            'invalid_payload',
            `Session references unresolved attached skills: ${missingList}. Refresh the registry or update attached skills.`
        );
    }

    return okRunExecution(
        buildAgentPrelude({
            mode: input.resolvedMode.mode,
            rulesets: resolvedRegistry.resolved.rulesets,
            skillfiles: resolvedSkills.skillfiles,
        })
    );
}
