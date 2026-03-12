import { sessionAttachedSkillStore } from '@/app/backend/persistence/stores';
import type { RulesetDefinition, SkillfileDefinition, TopLevelTab } from '@/app/backend/runtime/contracts';
import type { ModeDefinition } from '@/app/backend/runtime/contracts';
import { listResolvedRegistry, resolveSkillfilesByAssetKeys } from '@/app/backend/runtime/services/registry/service';
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
    if (input.workspaceContext.kind === 'worktree') {
        return createSystemMessage(
            'Execution environment',
            [
                `This session runs inside the managed worktree "${input.workspaceContext.label}" at ${input.workspaceContext.absolutePath}.`,
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
    const workspaceContext = input.workspaceFingerprint
        ? await workspaceContextService.resolveForSession({
              profileId: input.profileId,
              sessionId: input.sessionId,
              topLevelTab: input.topLevelTab,
              allowLazyWorktreeCreation: false,
          })
        : null;
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
            ...(workspaceContext && workspaceContext.kind !== 'detached'
                ? { workspacePrelude: buildWorkspacePrelude({ workspaceContext }) }
                : {}),
        })
    );
}
