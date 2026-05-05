import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolvePnpmInvocation } from '@/scripts/healthRunner';

export type CodeQualityMode = 'lint' | 'format' | 'format:check';

export const codeQualityLintTargets = [
    'scripts/**/*.ts',
    'electron/main/runtime/**/*.ts',
    'electron/main/logging/fileDrain.ts',
    'electron/main/updates/__tests__/updater.channel-switch.test.ts',
    'electron/main/window/workspaceIconProtocol.ts',
    'electron/main/window/workspaceIconProtocol.test.ts',
    'electron/backend/providers/adapters/kilo/runtime.ts',
    'electron/backend/providers/adapters/kilo/runtime.test.ts',
    'electron/backend/persistence/schemaTables/researchCheckoutRecordsTable.ts',
    'electron/backend/persistence/stores/runtime/planPhaseVerificationStore.ts',
    'electron/backend/persistence/stores/runtime/researchCheckoutStore.ts',
    'electron/backend/runtime/contracts/parsers/index.ts',
    'electron/backend/runtime/contracts/parsers/marketplace.ts',
    'electron/backend/runtime/contracts/parsers/marketplace.test.ts',
    'electron/backend/runtime/contracts/parsers/runtime.ts',
    'electron/backend/runtime/contracts/types/index.ts',
    'electron/backend/runtime/contracts/types/marketplace.ts',
    'electron/backend/runtime/contracts/types/research.ts',
    'electron/backend/runtime/services/environment/vendoredNodeResolver.ts',
    'electron/backend/runtime/services/environment/vendoredRipgrepResolver.ts',
    'electron/backend/runtime/services/researchCheckouts/commandRunner.ts',
    'electron/backend/runtime/services/researchCheckouts/commitService.ts',
    'electron/backend/runtime/services/researchCheckouts/commitService.test.ts',
    'electron/backend/runtime/services/researchCheckouts/locator.ts',
    'electron/backend/runtime/services/researchCheckouts/service.ts',
    'electron/backend/runtime/services/researchCheckouts/service.test.ts',
    'electron/backend/runtime/services/researchCheckouts/settings.ts',
    'electron/backend/runtime/services/runExecution/researchTarget.ts',
    'electron/backend/runtime/services/workspaceIcons/service.ts',
    'electron/backend/runtime/services/workspaceIcons/service.test.ts',
    'electron/backend/secrets/store.ts',
    'electron/backend/trpc/__tests__/runtime-contracts.shared.ts',
    'electron/backend/trpc/__tests__/runtime-contracts.conversation-media-sandboxes.test.ts',
    'electron/backend/trpc/__tests__/runtime-contracts.memory.test.ts',
    'electron/backend/trpc/__tests__/runtime-contracts.memory-projection.test.ts',
    'electron/backend/trpc/__tests__/runtime-contracts.repo-research.test.ts',
    'electron/backend/trpc/routers/runtime/index.ts',
    'electron/shared/contracts/types/index.ts',
    'electron/shared/contracts/types/marketplace.ts',
    'electron/shared/contracts/types/research.ts',
    'src/components/conversation/hooks/useConversationShellComposer.ts',
    'src/components/conversation/messages/flow/messageFlowBody.tsx',
    'src/components/conversation/messages/messageFlow.test.ts',
    'src/components/conversation/messages/messageFlowModel.ts',
    'src/components/conversation/messages/messageFlowModel.test.ts',
    'src/components/conversation/messages/messageTimeline.test.tsx',
    'src/components/conversation/messages/messageTimelineModel.ts',
    'src/components/conversation/messages/messageTimelineModel.test.ts',
    'src/components/conversation/messages/timeline/messageTimelineBody.tsx',
    'src/components/conversation/messages/workbenchStatusRow.tsx',
    'src/components/conversation/messages/workbenchRowPrimitives.tsx',
    'src/components/conversation/messages/workbenchRowFormatting.ts',
    'src/components/conversation/messages/workbenchToolRows.tsx',
    'src/components/conversation/panels/pendingPermissionsPanel.tsx',
    'src/components/conversation/panels/runChangeSummaryPanel.tsx',
    'src/components/conversation/panels/workbenchApprovalRow.tsx',
    'src/components/conversation/panels/workbenchDiffModel.ts',
    'src/components/conversation/panels/workbenchDiffRows.tsx',
    'src/components/conversation/panels/workbenchExecutionReceiptRow.tsx',
    'src/components/conversation/panels/workbenchRows.test.tsx',
    'src/components/conversation/sessions/workspace/workspacePanelModel.ts',
    'src/components/conversation/messages/workbenchTimelineModel.ts',
    'src/components/conversation/messages/workbenchTimelineModel.test.ts',
    'src/components/conversation/panels/cloudSessionsPanel.tsx',
    'src/components/conversation/panels/composerActionPanel.tsx',
    'src/components/conversation/panels/composerActionPanel/ComposerRunContractPreviewSection.tsx',
    'src/components/conversation/panels/modeExecutionPanel.test.ts',
    'src/components/conversation/panels/modeExecutionPanelState.test.ts',
    'src/components/conversation/shell/actions/promptSubmit.ts',
    'src/components/conversation/shell/composition/buildConversationWorkspaceProjection.tsx',
    'src/components/settings/profileSettings/useProfilePreferencesController.test.tsx',
    'src/components/settings/providerSettings/providerSettingsCache.test.ts',
    'src/components/settings/registrySettings/registryReadModel.ts',
    'src/components/settings/workspaceIdentitySettings.tsx',
    'src/components/workspaces/useWorkspaceEnvironmentPreview.ts',
    'src/components/workspaces/workspaceIcon.tsx',
    'src/components/workspaces/workspaceIconModel.ts',
    'src/components/workspaces/workspaceIcon.test.tsx',
    'src/components/conversation/hooks/useComposerSlashCommands.ts',
    'src/components/conversation/panels/composerSlashCommands.ts',
    'src/components/conversation/panels/composerSlashCommands.test.ts',
    'src/components/conversation/panels/composerActionPanel/useComposerSlashCommandController.ts',
    'src/components/conversation/panels/composerActionPanel/types.ts',
    'src/components/conversation/panels/queuedRunReviewModel.ts',
    'src/components/conversation/panels/queuedRunReviewSummary.tsx',
    'src/components/conversation/panels/sessionOutboxPanel.tsx',
    'src/components/conversation/sessions/sessionWorkspacePanel.tsx',
    'src/components/conversation/sessions/sessionWorkspacePanel.test.ts',
    'src/components/conversation/sessions/workspaceInspector.tsx',
    'src/components/conversation/sessions/workspaceInspector.test.tsx',
    'src/components/conversation/sessions/workspaceShellModel.ts',
    'src/components/conversation/sessions/workspace/workspacePrimaryColumn.tsx',
    'src/components/conversation/sessions/workspace/workspaceSelectionHeader.tsx',
    'src/components/conversation/sessions/workspace/workspaceShell.tsx',
    'src/components/conversation/shell/actions/useConversationMutations.ts',
    'electron/backend/runtime/contracts/types/runtime.ts',
    'electron/backend/runtime/contracts/types/runContract.ts',
    'electron/backend/runtime/services/environment/sandboxPolicySummaryBuilder.ts',
    'electron/backend/runtime/services/environment/sandboxPolicySummaryBuilder.test.ts',
    'electron/backend/runtime/services/environment/service.ts',
    'electron/backend/runtime/services/environment/workspaceEnvironmentGuidanceBuilder.ts',
    'electron/backend/runtime/services/environment/workspaceEnvironmentGuidanceBuilder.test.ts',
    'electron/backend/runtime/services/environment/workspaceEnvironmentSnapshotBuilder.ts',
    'electron/backend/runtime/services/environment/workspaceEnvironmentSnapshotBuilder.test.ts',
    'electron/backend/runtime/services/runContract/service.ts',
    'electron/backend/runtime/services/runContract/service.test.ts',
    'electron/backend/runtime/services/runExecution/runtimeToolDescriptionBuilder.ts',
    'electron/backend/runtime/services/runExecution/runtimeToolDescriptionBuilder.test.ts',
    'electron/backend/runtime/services/runExecution/runtimeToolGuidanceContext.ts',
    'electron/backend/runtime/services/runExecution/tools.test.ts',
    'electron/backend/runtime/services/runExecution/types.ts',
    'src/components/workspaces/workspaceEnvironmentSection.tsx',
    'src/components/workspaces/workspaceEnvironmentSection.test.tsx',
    'src/lib/operatorDiagnostics.ts',
    'src/lib/operatorDiagnostics.test.ts',
    'electron/backend/runtime/contracts/types/context.ts',
    'electron/backend/runtime/services/runExecution/contextPrelude.ts',
    'electron/backend/runtime/services/runExecution/contextPrelude.test.ts',
    'electron/backend/runtime/services/runExecution/promptOrchestrationFragments.ts',
    'electron/backend/runtime/services/runExecution/contextBuilder.ts',
    'electron/backend/runtime/services/runExecution/prepareRunStart.ts',
    'electron/backend/runtime/services/common/delegatedChildLane.ts',
    'electron/backend/runtime/services/common/delegatedChildLane.test.ts',
    'electron/backend/runtime/services/plan/researchLifecycle.ts',
    'electron/shared/contracts/enums.ts',
    'electron/shared/modeRoleCatalog.ts',
    'electron/shared/workerPresetCatalog.ts',
    'electron/shared/workerPresetCatalog.test.ts',
    'src/components/settings/modesSettings/modesInstructionsControllerShared.test.ts',
    'electron/backend/trpc/__tests__/app-router.prompt-provider.types.test.ts',
] as const;

const codeQualityFormatOnlyTargets = [
    'package.json',
    '../AGENTS.md',
    '../Markdown/CONTRIBUTING.md',
    '../.github/pull_request_template.md',
    '../.github/workflows/project-checks.yml',
    '../.github/workflows/security-health.yml',
    '../.github/workflows/pr-auto-fix.yml',
] as const;

export const codeQualityFormatTargets = [...codeQualityFormatOnlyTargets, ...codeQualityLintTargets] as const;

const maxChunkArgumentLength = 6000;

function isDirectExecution(importMetaUrl: string): boolean {
    const entryPath = process.argv[1];
    if (!entryPath) {
        return false;
    }

    return importMetaUrl === pathToFileURL(path.resolve(entryPath)).href;
}

function chunkTargets(targets: readonly string[], baseArgs: readonly string[]): string[][] {
    const chunks: string[][] = [];
    let currentChunk: string[] = [];
    let currentLength = baseArgs.join(' ').length;

    for (const target of targets) {
        const nextLength = currentLength + target.length + 1;
        if (currentChunk.length > 0 && nextLength > maxChunkArgumentLength) {
            chunks.push(currentChunk);
            currentChunk = [];
            currentLength = baseArgs.join(' ').length;
        }

        currentChunk.push(target);
        currentLength += target.length + 1;
    }

    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }

    return chunks;
}

function runProcess(command: string, args: string[], cwd: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            stdio: 'inherit',
        });

        child.once('error', reject);
        child.once('exit', (code) => {
            resolve(code ?? 1);
        });
    });
}

async function runChunkedTool(input: {
    tool: 'eslint' | 'prettier';
    baseArgs: string[];
    targets: readonly string[];
    cwd: string;
}): Promise<number> {
    const pnpm = resolvePnpmInvocation();
    const toolBaseArgs = [...pnpm.argsPrefix, 'exec', input.tool, ...input.baseArgs];
    const chunks = chunkTargets(input.targets, toolBaseArgs);

    for (const chunk of chunks) {
        const exitCode = await runProcess(pnpm.command, [...toolBaseArgs, ...chunk], input.cwd);
        if (exitCode !== 0) {
            return exitCode;
        }
    }

    return 0;
}

export async function runCodeQualityCommand(input: {
    mode: CodeQualityMode;
    extraArgs?: string[];
    cwd?: string;
}): Promise<number> {
    const cwd = input.cwd ?? process.cwd();
    const extraArgs = input.extraArgs ?? [];

    if (input.mode === 'lint') {
        const unknownArgs = extraArgs.filter((arg) => arg !== '--fix');
        if (unknownArgs.length > 0) {
            process.stderr.write(`Unknown lint argument: ${unknownArgs.join(', ')}\n`);
            return 1;
        }
        return runChunkedTool({
            tool: 'eslint',
            baseArgs: extraArgs,
            targets: codeQualityLintTargets,
            cwd,
        });
    }

    if (extraArgs.length > 0) {
        process.stderr.write(`Unexpected ${input.mode} argument: ${extraArgs.join(', ')}\n`);
        return 1;
    }

    return runChunkedTool({
        tool: 'prettier',
        baseArgs: [input.mode === 'format' ? '--write' : '--check'],
        targets: codeQualityFormatTargets,
        cwd,
    });
}

export async function runCodeQualityCli(args = process.argv.slice(2)): Promise<number> {
    const [mode, ...extraArgs] = args;
    if (mode !== 'lint' && mode !== 'format' && mode !== 'format:check') {
        process.stderr.write('Usage: tsx scripts/code-quality.ts <lint|format|format:check> [--fix]\n');
        return 1;
    }

    return runCodeQualityCommand({ mode, extraArgs });
}

if (isDirectExecution(import.meta.url)) {
    runCodeQualityCli()
        .then((exitCode) => {
            process.exitCode = exitCode;
        })
        .catch((error: unknown) => {
            process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
            process.exitCode = 1;
        });
}
