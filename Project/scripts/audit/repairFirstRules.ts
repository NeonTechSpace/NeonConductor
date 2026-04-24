import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { collectSourceFiles, isGeneratedSourceFile, isTestFile } from '@/scripts/audit/sourceFiles';

export type RepairFirstPriority = 'P0' | 'P1' | 'P2';

export interface RepairFirstFinding {
    id: string;
    priority: RepairFirstPriority;
    title: string;
    path: string;
    line: number;
    message: string;
    owner: string;
}

export interface RepairFirstReport {
    status: 'blocked' | 'clear';
    rootDir: string;
    counts: Record<RepairFirstPriority, number>;
    findings: RepairFirstFinding[];
}

interface ProjectFile {
    relativePath: string;
    absolutePath: string;
    content: string;
    lineCount: number;
}

const repairFirstOwner = 'Research/Repair-First Stabilization Track.md';
const hardSourceLineLimit = 1500;

const priorityOrder: Record<RepairFirstPriority, number> = {
    P0: 0,
    P1: 1,
    P2: 2,
};

function normalizeRelativePath(rootDir: string, absolutePath: string): string {
    return path.relative(rootDir, absolutePath).replaceAll('\\', '/');
}

function resolveRepositoryRoot(rootDir: string): string {
    const parentDir = path.resolve(rootDir, '..');
    const parentMarkers = ['AGENTS.md', 'README.md', 'Research', '.github'];
    return parentMarkers.some((marker) => existsSync(path.join(parentDir, marker))) ? parentDir : rootDir;
}

function readProjectFile(rootDir: string, relativePath: string): ProjectFile | null {
    const absolutePath = path.join(rootDir, relativePath);
    if (!existsSync(absolutePath)) {
        return null;
    }

    const content = readFileSync(absolutePath, 'utf8');
    return {
        absolutePath,
        relativePath,
        content,
        lineCount: content.length === 0 ? 0 : content.split(/\r?\n/).length,
    };
}

function readRepositoryFile(rootDir: string, repositoryRelativePath: string): ProjectFile | null {
    const repositoryRoot = resolveRepositoryRoot(rootDir);
    const absolutePath = path.join(repositoryRoot, repositoryRelativePath);
    if (!existsSync(absolutePath)) {
        return null;
    }

    const content = readFileSync(absolutePath, 'utf8');
    return {
        absolutePath,
        relativePath: normalizeRelativePath(rootDir, absolutePath),
        content,
        lineCount: content.length === 0 ? 0 : content.split(/\r?\n/).length,
    };
}

function findLine(content: string, needle: string): number {
    const lineIndex = content.split(/\r?\n/).findIndex((line) => line.includes(needle));
    return lineIndex === -1 ? 1 : lineIndex + 1;
}

function buildFinding(input: {
    id: string;
    priority: RepairFirstPriority;
    title: string;
    file: ProjectFile;
    needle?: string;
    message: string;
}): RepairFirstFinding {
    return {
        id: input.id,
        priority: input.priority,
        title: input.title,
        path: input.file.relativePath,
        line: input.needle ? findLine(input.file.content, input.needle) : 1,
        message: input.message,
        owner: repairFirstOwner,
    };
}

function collectKnownSecurityFindings(rootDir: string): RepairFirstFinding[] {
    const findings: RepairFirstFinding[] = [];
    const shellApproval = readProjectFile(rootDir, 'electron/backend/runtime/services/toolExecution/shellApproval.ts');
    if (
        shellApproval &&
        shellApproval.content.includes('buildPrefixResource') &&
        shellApproval.content.includes('Allow commands that start with') &&
        shellApproval.content.includes('overrideResources: approvalCandidates.map')
    ) {
        findings.push(
            buildFinding({
                id: 'p0-shell-approval-prefix-broadening',
                priority: 'P0',
                title: 'Reusable shell approvals can broaden command authority',
                file: shellApproval,
                needle: 'buildPrefixResource',
                message:
                    'Reusable run_command approvals are still derived from executable prefixes; replace prefix grants with exact-command or structured argv authority.',
            })
        );
    }

    const safety = readProjectFile(rootDir, 'electron/backend/runtime/services/toolExecution/safety.ts');
    if (
        safety &&
        safety.content.includes('isPathInsideWorkspace') &&
        safety.content.includes('path.relative') &&
        !safety.content.includes('realpath')
    ) {
        findings.push(
            buildFinding({
                id: 'p0-file-tool-canonical-confinement',
                priority: 'P0',
                title: 'File-tool containment is not enforced canonically at low-level I/O',
                file: safety,
                needle: 'isPathInsideWorkspace',
                message:
                    'File-tool safety still relies on lexical path.relative checks; low-level handlers need execution-root authority and canonical symlink/junction escape rejection.',
            })
        );
    }

    const workspaceContext = readProjectFile(rootDir, 'electron/backend/runtime/services/workspaceContext/service.ts');
    if (workspaceContext && workspaceContext.content.includes('Unresolved workspace root')) {
        findings.push(
            buildFinding({
                id: 'p0-unresolved-workspace-sentinel',
                priority: 'P0',
                title: 'Unresolved workspaces still flow as placeholder paths',
                file: workspaceContext,
                needle: 'Unresolved workspace root',
                message:
                    'Unresolved runtime/workspace contexts need typed fail-closed state instead of a placeholder absolutePath string.',
            })
        );
    }

    const schema = readProjectFile(rootDir, 'electron/backend/persistence/schema.ts');
    const providerSecretStore = readProjectFile(
        rootDir,
        'electron/backend/persistence/stores/profile/providerSecretStore.ts'
    );
    const mcpStore = readProjectFile(rootDir, 'electron/backend/persistence/stores/runtime/mcpStore.ts');
    if (
        schema &&
        providerSecretStore &&
        mcpStore &&
        schema.content.includes('secret_value: string') &&
        providerSecretStore.content.includes('secret_value') &&
        mcpStore.content.includes('secret_value')
    ) {
        findings.push(
            buildFinding({
                id: 'p0-plaintext-secret-storage',
                priority: 'P0',
                title: 'Provider and MCP secrets are still persisted as plaintext',
                file: schema,
                needle: 'secret_value: string',
                message:
                    'Provider credentials and MCP env secrets still use raw secret_value persistence; move secrets to an explicit encrypted or OS-keychain-backed design.',
            })
        );
    }

    const devBrowserPolicy = readProjectFile(
        rootDir,
        'electron/backend/runtime/services/devBrowser/localTargetPolicy.ts'
    );
    const controller = readProjectFile(rootDir, 'electron/main/window/devBrowser/controller.ts');
    if (
        devBrowserPolicy &&
        controller &&
        devBrowserPolicy.content.includes("from 'node:dns/promises'") &&
        devBrowserPolicy.content.includes('lookup(resolvedHostname') &&
        controller.content.includes('loadURL(validation.normalizedUrl)')
    ) {
        findings.push(
            buildFinding({
                id: 'p0-dev-browser-dns-rebinding',
                priority: 'P0',
                title: 'Dev-browser local-target validation has a DNS rebinding window',
                file: devBrowserPolicy,
                needle: 'lookup(resolvedHostname',
                message:
                    'The dev browser validates DNS once and later loads the original hostname; pin or revalidate the resolved local target at navigation time.',
            })
        );
    }

    return findings;
}

function collectHardSourceSizeFindings(rootDir: string): RepairFirstFinding[] {
    return collectSourceFiles(rootDir)
        .filter((file) => file.lineCount >= hardSourceLineLimit)
        .filter((file) => !isTestFile(file.relativePath))
        .filter((file) => !isGeneratedSourceFile(file.relativePath, file.content))
        .map((file) => ({
            id: `p1-hard-source-line-limit:${file.relativePath}`,
            priority: 'P1' as const,
            title: 'Production source exceeds the repair-first hard line limit',
            path: file.relativePath,
            line: file.lineCount,
            message: `Non-generated production source is ${String(file.lineCount)} lines; split it below the ${String(
                hardSourceLineLimit
            )}-line hard repair threshold.`,
            owner: repairFirstOwner,
        }));
}

function collectKnownArchitectureFindings(rootDir: string): RepairFirstFinding[] {
    const findings: RepairFirstFinding[] = [];
    const planStore = readProjectFile(rootDir, 'electron/backend/persistence/stores/runtime/planStore.ts');
    if (planStore && planStore.content.includes('class PlanStore')) {
        findings.push(
            buildFinding({
                id: 'p1-plan-store-split',
                priority: 'P1',
                title: 'planStore still owns too many planning persistence concerns',
                file: planStore,
                needle: 'class PlanStore',
                message:
                    'Split plan creation, revisions, research workers, evidence, variants, follow-ups, projections, and lifecycle transitions into focused owners.',
            })
        );
    }

    const flowExecution = readProjectFile(rootDir, 'electron/backend/runtime/services/flows/executionService.ts');
    if (
        flowExecution &&
        flowExecution.content.includes('export class FlowExecutionService') &&
        flowExecution.content.includes('startDelegatedChildLaneRun') &&
        flowExecution.content.includes('startPlanFlow')
    ) {
        findings.push(
            buildFinding({
                id: 'p1-flow-execution-service-split',
                priority: 'P1',
                title: 'FlowExecutionService still mixes flow, planning, and child-lane authority',
                file: flowExecution,
                needle: 'export class FlowExecutionService',
                message:
                    'Extract lifecycle, step execution, delegated child-lane, and planning handoff responsibilities before adding repo-research execution roots.',
            })
        );
    }

    const runExecution = readProjectFile(rootDir, 'electron/backend/runtime/services/runExecution/service.ts');
    if (
        runExecution &&
        runExecution.content.includes('export class RunExecutionService') &&
        runExecution.content.includes('previewRunContractInternal') &&
        runExecution.content.includes('processOutboxEntry') &&
        runExecution.content.includes('getExecutionReceipt')
    ) {
        findings.push(
            buildFinding({
                id: 'p1-run-execution-service-split',
                priority: 'P1',
                title: 'RunExecutionService still combines contract, outbox, receipt, and active-run authority',
                file: runExecution,
                needle: 'export class RunExecutionService',
                message:
                    'Split run contract preparation, outbox lifecycle, receipt lookup, and active-run execution before more execution-target complexity lands.',
            })
        );
    }

    const toolRequestContext = readProjectFile(
        rootDir,
        'electron/backend/runtime/services/toolExecution/toolRequestContextResolver.ts'
    );
    if (
        toolRequestContext &&
        toolRequestContext.content.includes('workspaceRootPath') &&
        toolRequestContext.content.includes('workspaceRequirement')
    ) {
        findings.push(
            buildFinding({
                id: 'p1-execution-root-vocabulary',
                priority: 'P1',
                title: 'Runtime targeting still relies on workspace-only vocabulary',
                file: toolRequestContext,
                needle: 'workspaceRootPath',
                message:
                    'Broaden runtime targeting toward explicit executionRoot language before implementing repo-research checkouts.',
            })
        );
    }

    return findings;
}

function collectKnownDxFindings(rootDir: string): RepairFirstFinding[] {
    const findings: RepairFirstFinding[] = [];
    const modeExecutionState = readProjectFile(
        rootDir,
        'src/components/conversation/panels/modeExecutionPanelState.ts'
    );
    if (modeExecutionState && modeExecutionState.lineCount >= 900) {
        findings.push(
            buildFinding({
                id: 'p2-mode-execution-panel-state-split',
                priority: 'P2',
                title: 'modeExecutionPanelState remains a large multi-slice state module',
                file: modeExecutionState,
                message:
                    'Split plan artifact state/history/recovery, phase state, and research artifact state into smaller feature owners.',
            })
        );
    }

    const modeInstructions = readProjectFile(
        rootDir,
        'src/components/settings/modesSettings/modesInstructionsSections.tsx'
    );
    if (modeInstructions && (modeInstructions.content.match(/\bexport function\b/g)?.length ?? 0) > 1) {
        findings.push(
            buildFinding({
                id: 'p2-modes-instructions-sections-split',
                priority: 'P2',
                title: 'modesInstructionsSections still exports multiple UI sections from one file',
                file: modeInstructions,
                needle: 'export function',
                message:
                    'Split prompt-layer cards, prepared-context controls, inventory sections, and draft review into focused modules.',
            })
        );
    }

    const devBrowserPanel = readProjectFile(rootDir, 'src/components/conversation/panels/devBrowserPanel.tsx');
    if (devBrowserPanel && devBrowserPanel.lineCount >= 900) {
        findings.push(
            buildFinding({
                id: 'p2-dev-browser-panel-controller-split',
                priority: 'P2',
                title: 'devBrowserPanel still bundles controller logic and rendering',
                file: devBrowserPanel,
                message:
                    'Extract target editing, mount synchronization, mutation orchestration, and designer/comment staging into focused controller code.',
            })
        );
    }

    const nativeTools = readProjectFile(
        rootDir,
        'electron/backend/runtime/services/toolExecution/builtInNativeTools.ts'
    );
    if (nativeTools && nativeTools.content.includes('Run a command in a sandboxed shell')) {
        findings.push(
            buildFinding({
                id: 'p2-run-command-wording',
                priority: 'P2',
                title: 'run_command wording still overclaims shell sandboxing',
                file: nativeTools,
                needle: 'Run a command in a sandboxed shell',
                message:
                    'Describe run_command as executing in the resolved execution target under policy, not as providing sandboxing by itself.',
            })
        );
    }

    const readme = readRepositoryFile(rootDir, 'README.md');
    if (
        readme &&
        (!readme.content.includes('## Engineering Start') ||
            !readme.content.includes('Repair-First Stabilization Track.md'))
    ) {
        findings.push(
            buildFinding({
                id: 'p2-root-engineering-onboarding',
                priority: 'P2',
                title: 'Root README does not expose the repair-first engineering entrypoint',
                file: readme,
                message:
                    'Add concise engineering onboarding links to AGENTS, CONTRIBUTING, the blueprint, first-alpha track, and repair-first track.',
            })
        );
    }

    return findings;
}

function compareFindings(left: RepairFirstFinding, right: RepairFirstFinding): number {
    const priorityDelta = priorityOrder[left.priority] - priorityOrder[right.priority];
    if (priorityDelta !== 0) {
        return priorityDelta;
    }

    return left.id.localeCompare(right.id);
}

export function collectRepairFirstFindings(rootDir: string): RepairFirstFinding[] {
    return [
        ...collectKnownSecurityFindings(rootDir),
        ...collectHardSourceSizeFindings(rootDir),
        ...collectKnownArchitectureFindings(rootDir),
        ...collectKnownDxFindings(rootDir),
    ].sort(compareFindings);
}

export function buildRepairFirstReport(rootDir: string): RepairFirstReport {
    const findings = collectRepairFirstFindings(rootDir);
    const counts: Record<RepairFirstPriority, number> = {
        P0: 0,
        P1: 0,
        P2: 0,
    };

    for (const finding of findings) {
        counts[finding.priority] += 1;
    }

    return {
        status: findings.length > 0 ? 'blocked' : 'clear',
        rootDir,
        counts,
        findings,
    };
}

export function formatRepairFirstWorklist(report: RepairFirstReport): string {
    const lines = [
        'Repair-first audit worklist',
        `status: ${report.status}`,
        `P0: ${String(report.counts.P0)}`,
        `P1: ${String(report.counts.P1)}`,
        `P2: ${String(report.counts.P2)}`,
        '',
    ];

    for (const priority of ['P0', 'P1', 'P2'] as const) {
        const priorityFindings = report.findings.filter((finding) => finding.priority === priority);
        if (priorityFindings.length === 0) {
            continue;
        }

        lines.push(`## ${priority}`);
        for (const finding of priorityFindings) {
            lines.push(
                `- ${finding.path}:${String(finding.line)} [${finding.id}] ${finding.title} - ${finding.message}`
            );
        }
        lines.push('');
    }

    return lines.join('\n').trimEnd();
}

export function formatRepairFirstSummary(report: RepairFirstReport): string {
    return [
        'Repair-first audit completed.',
        `status: ${report.status}`,
        `findings: ${String(report.findings.length)}`,
        `P0: ${String(report.counts.P0)}`,
        `P1: ${String(report.counts.P1)}`,
        `P2: ${String(report.counts.P2)}`,
    ].join('\n');
}
