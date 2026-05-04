import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { researchCheckoutStore } from '@/app/backend/persistence/stores';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { generatePlainTextFromMessages } from '@/app/backend/runtime/services/common/plainTextGeneration';
import { resolveSummaryGenerationTarget } from '@/app/backend/runtime/services/common/summaryGenerationTarget';
import {
    defaultResearchCheckoutCommandRunner,
    type ResearchCheckoutCommandResult,
    type ResearchCheckoutCommandRunner,
} from '@/app/backend/runtime/services/researchCheckouts/commandRunner';

import type {
    RepoCommitChangeSummary,
    RepoCommitCommandReceipt,
    RepoChangedFileEntry,
    RepoChangedFileStatus,
    RepoMutationGuardrail,
    RepoVcsFamily,
    RuntimeApplyRepoCommitInput,
    RuntimeApplyRepoCommitResult,
    RuntimeApplyRepoPushInput,
    RuntimeApplyRepoPushResult,
    RuntimeGenerateRepoTextDraftInput,
    RuntimeGenerateRepoTextDraftResult,
    RuntimePreviewRepoCommitResult,
    RuntimePreviewRepoPushResult,
    RuntimeRepoCommitInput,
    RuntimeRepoPushInput,
} from '@/shared/contracts';

const REPO_COMMIT_COMMAND_TIMEOUT_MS = 10_000;
const CHANGED_PATH_SAMPLE_LIMIT = 20;

interface RepoCommitInspection {
    family: RepoVcsFamily;
    statusOutput: string;
    changeSummary: RepoCommitChangeSummary;
    commitDigest?: string;
    guardrail: RepoMutationGuardrail;
}

interface RepoPushInspection {
    family: RepoVcsFamily;
    guardrail: RepoMutationGuardrail;
    branch?: string;
    upstream?: string;
    aheadCount?: number;
    pushDigest?: string;
}

function toPathKey(absolutePath: string): string {
    return process.platform === 'win32' ? absolutePath.toLowerCase() : absolutePath;
}

function isPathInside(parentAbsolutePath: string, childAbsolutePath: string): boolean {
    const parentKey = toPathKey(path.resolve(parentAbsolutePath));
    const childKey = toPathKey(path.resolve(childAbsolutePath));
    return childKey === parentKey || childKey.startsWith(`${parentKey}${path.sep}`);
}

async function directoryExists(absolutePath: string): Promise<boolean> {
    try {
        return (await fs.stat(absolutePath)).isDirectory();
    } catch {
        return false;
    }
}

function normalizeStatusLines(output: string): string[] {
    return output
        .split(/\r?\n/u)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0);
}

function digestText(input: string): string {
    return createHash('sha256').update(input).digest('hex');
}

function digestCommit(input: {
    family: RepoVcsFamily;
    checkoutPath: string;
    statusOutput: string;
    selectedPaths: string[];
}): string {
    return createHash('sha256')
        .update(input.family)
        .update('\0')
        .update(path.resolve(input.checkoutPath))
        .update('\0')
        .update(input.statusOutput)
        .update('\0')
        .update(input.selectedPaths.join('\0'))
        .digest('hex');
}

function buildGuardrail(
    intent: RepoMutationGuardrail['intent'],
    outcome: RepoMutationGuardrail['outcome'],
    reason: string
): RepoMutationGuardrail {
    return {
        intent,
        outcome,
        reason,
    };
}

function mapGitStatus(code: string): RepoChangedFileStatus {
    if (code.includes('?')) {
        return 'untracked';
    }
    if (code.includes('A')) {
        return 'added';
    }
    if (code.includes('D')) {
        return 'deleted';
    }
    if (code.includes('R')) {
        return 'renamed';
    }
    if (code.includes('C')) {
        return 'copied';
    }
    if (code.includes('M')) {
        return 'modified';
    }
    return 'unknown';
}

function parseGitStatusPath(line: string): string {
    const rawPath = line.slice(3).trim();
    const renameTarget = rawPath.split(' -> ').at(-1);
    return renameTarget?.trim() ?? rawPath;
}

function summarizeGitChanges(statusOutput: string, selectedPaths?: string[]): RepoCommitChangeSummary {
    const selected = new Set(selectedPaths ?? []);
    const files = normalizeStatusLines(statusOutput)
        .filter((line) => !line.startsWith('## '))
        .map((line): RepoChangedFileEntry => {
            const code = line.slice(0, 2);
            return {
                relativePath: parseGitStatusPath(line),
                status: mapGitStatus(code),
                staged: code[0] !== ' ' && code[0] !== '?',
                selectable: true,
            };
        })
        .filter((file) => file.relativePath.length > 0);

    return {
        changedFileCount: files.length,
        changedPathSamples: files.map((file) => file.relativePath).slice(0, CHANGED_PATH_SAMPLE_LIMIT),
        files,
        selectedPathCount:
            selected.size > 0 ? files.filter((file) => selected.has(file.relativePath)).length : files.length,
    };
}

function mapJjStatus(status: string): RepoChangedFileStatus {
    switch (status) {
        case 'A':
            return 'added';
        case 'M':
            return 'modified';
        case 'D':
            return 'deleted';
        case 'R':
            return 'renamed';
        case 'C':
            return 'copied';
        case '?':
            return 'untracked';
        default:
            return 'unknown';
    }
}

function summarizeJjChanges(statusOutput: string, selectedPaths?: string[]): RepoCommitChangeSummary {
    const selected = new Set(selectedPaths ?? []);
    const files = normalizeStatusLines(statusOutput)
        .filter((line) => /^[AMDRC?!] /u.test(line))
        .map(
            (line): RepoChangedFileEntry => ({
                relativePath: line.slice(2).trim(),
                status: mapJjStatus(line[0] ?? ''),
                staged: true,
                selectable: false,
            })
        )
        .filter((file) => file.relativePath.length > 0);

    return {
        changedFileCount: files.length,
        changedPathSamples: files.map((file) => file.relativePath).slice(0, CHANGED_PATH_SAMPLE_LIMIT),
        files,
        selectedPathCount:
            selected.size > 0 ? files.filter((file) => selected.has(file.relativePath)).length : files.length,
    };
}

function commandReceipt(
    command: RepoCommitCommandReceipt['command'],
    result: ResearchCheckoutCommandResult
): RepoCommitCommandReceipt {
    return {
        command,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        timedOut: result.timedOut,
    };
}

function normalizeSelectedPaths(input: string[] | undefined): string[] {
    return [...new Set(input ?? [])].sort((left, right) => left.localeCompare(right));
}

function validateSelectedPaths(input: {
    selectedPaths: string[];
    files: RepoChangedFileEntry[];
}): OperationalResult<string[]> {
    if (input.selectedPaths.length === 0) {
        return okOp([]);
    }
    const changedPathSet = new Set(input.files.map((file) => file.relativePath));
    for (const selectedPath of input.selectedPaths) {
        if (!changedPathSet.has(selectedPath)) {
            return errOp('invalid_input', `Selected path "${selectedPath}" is not a changed checkout file.`);
        }
    }
    return okOp(input.selectedPaths);
}

function parseGitBranchStatus(output: string): {
    branch?: string;
    upstream?: string;
    detached: boolean;
    aheadCount: number;
    behindCount: number;
    hasUpstream: boolean;
} {
    const firstLine = output.split(/\r?\n/u).find((line) => line.startsWith('## ')) ?? '';
    const statusText = firstLine.slice(3);
    const detached = statusText.includes('HEAD (no branch)') || statusText.includes('No commits yet on');
    const branchAndRemote = statusText.split(' ')[0] ?? '';
    const [branch, upstream] = branchAndRemote.split('...');
    const aheadMatch = /\bahead (\d+)/u.exec(statusText);
    const behindMatch = /\bbehind (\d+)/u.exec(statusText);
    return {
        ...(branch && !detached ? { branch } : {}),
        ...(upstream ? { upstream } : {}),
        detached,
        aheadCount: aheadMatch?.[1] ? Number.parseInt(aheadMatch[1], 10) : 0,
        behindCount: behindMatch?.[1] ? Number.parseInt(behindMatch[1], 10) : 0,
        hasUpstream: Boolean(upstream),
    };
}

function parseGitRevisionId(output: string): string | undefined {
    const revision = output.trim();
    return /^[0-9a-f]{7,64}$/iu.test(revision) ? revision : undefined;
}

function parseJjRevisionId(output: string): string | undefined {
    const changeIdMatch = /\b([kmn-z]{8,})\b/iu.exec(output);
    if (changeIdMatch?.[1]) {
        return changeIdMatch[1];
    }
    const commitIdMatch = /\b([0-9a-f]{7,64})\b/iu.exec(output);
    return commitIdMatch?.[1];
}

export class RepoCommitService {
    constructor(private readonly commandRunner: ResearchCheckoutCommandRunner = defaultResearchCheckoutCommandRunner) {}

    async preview(input: RuntimeRepoCommitInput): Promise<OperationalResult<RuntimePreviewRepoCommitResult>> {
        const checkoutResult = await this.loadCheckout(input);
        if (checkoutResult.isErr()) {
            return errOp(checkoutResult.error.code, checkoutResult.error.message);
        }

        const inspection = await this.inspect({
            checkoutPath: checkoutResult.value.resolvedCheckoutPath,
            family: checkoutResult.value.effectiveVcs,
            selectedPaths: normalizeSelectedPaths(input.selectedPaths),
        });
        return okOp({
            available: inspection.guardrail.outcome === 'approval_required',
            guardrail: inspection.guardrail,
            vcsFamily: inspection.family,
            researchCheckoutRecordId: input.researchCheckoutRecordId,
            resolvedCheckoutPath: checkoutResult.value.resolvedCheckoutPath,
            changeSummary: inspection.changeSummary,
            ...(inspection.commitDigest ? { expectedCommitDigest: inspection.commitDigest } : {}),
        });
    }

    async apply(input: RuntimeApplyRepoCommitInput): Promise<OperationalResult<RuntimeApplyRepoCommitResult>> {
        const checkoutResult = await this.loadCheckout(input);
        if (checkoutResult.isErr()) {
            return errOp(checkoutResult.error.code, checkoutResult.error.message);
        }

        const checkout = checkoutResult.value;
        const selectedPaths = normalizeSelectedPaths(input.selectedPaths);
        const inspection = await this.inspect({
            checkoutPath: checkout.resolvedCheckoutPath,
            family: checkout.effectiveVcs,
            selectedPaths,
        });
        if (inspection.guardrail.outcome !== 'approval_required' || !inspection.commitDigest) {
            return errOp('mode_policy_invalid', inspection.guardrail.reason);
        }
        if (inspection.commitDigest !== input.expectedCommitDigest) {
            return errOp(
                'mode_policy_invalid',
                'Repo commit was blocked because the changed file set or selection changed after preview.'
            );
        }

        if (inspection.family === 'git') {
            return this.applyGitCommit(input, checkout.resolvedCheckoutPath, inspection, selectedPaths);
        }
        if (inspection.family === 'jj') {
            if (selectedPaths.length > 0) {
                return errOp(
                    'mode_policy_invalid',
                    'JJ file-scoped commit selection requires future split/change support.'
                );
            }
            return this.applyJjCommit(input, checkout.resolvedCheckoutPath, inspection);
        }

        return errOp('mode_policy_invalid', inspection.guardrail.reason);
    }

    private async loadCheckout(input: {
        profileId: string;
        researchCheckoutRecordId: RuntimeRepoCommitInput['researchCheckoutRecordId'];
    }) {
        const checkout = await researchCheckoutStore.getById(input.profileId, input.researchCheckoutRecordId);
        if (!checkout) {
            return errOp('not_found', 'Repo-research checkout record was not found.');
        }
        if (!isPathInside(checkout.rootAbsolutePath, checkout.resolvedCheckoutPath)) {
            return errOp('invalid_input', 'Repo-research checkout path escaped its configured root.');
        }
        if (!(await directoryExists(checkout.resolvedCheckoutPath))) {
            return errOp('execution_target_unavailable', 'Repo-research checkout directory does not exist.');
        }

        return okOp(checkout);
    }

    async previewPush(input: RuntimeRepoPushInput): Promise<OperationalResult<RuntimePreviewRepoPushResult>> {
        const checkoutResult = await this.loadCheckout(input);
        if (checkoutResult.isErr()) {
            return errOp(checkoutResult.error.code, checkoutResult.error.message);
        }

        const inspection = await this.inspectPush(
            checkoutResult.value.resolvedCheckoutPath,
            checkoutResult.value.effectiveVcs
        );
        return okOp({
            available: inspection.guardrail.outcome === 'approval_required',
            guardrail: inspection.guardrail,
            vcsFamily: inspection.family,
            researchCheckoutRecordId: input.researchCheckoutRecordId,
            resolvedCheckoutPath: checkoutResult.value.resolvedCheckoutPath,
            ...(inspection.branch ? { branch: inspection.branch } : {}),
            ...(inspection.upstream ? { upstream: inspection.upstream } : {}),
            ...(inspection.aheadCount !== undefined ? { aheadCount: inspection.aheadCount } : {}),
            ...(inspection.pushDigest ? { expectedPushDigest: inspection.pushDigest } : {}),
        });
    }

    async applyPush(input: RuntimeApplyRepoPushInput): Promise<OperationalResult<RuntimeApplyRepoPushResult>> {
        const checkoutResult = await this.loadCheckout(input);
        if (checkoutResult.isErr()) {
            return errOp(checkoutResult.error.code, checkoutResult.error.message);
        }

        const checkout = checkoutResult.value;
        const inspection = await this.inspectPush(checkout.resolvedCheckoutPath, checkout.effectiveVcs);
        if (inspection.guardrail.outcome !== 'approval_required' || !inspection.pushDigest) {
            return errOp('mode_policy_invalid', inspection.guardrail.reason);
        }
        if (inspection.pushDigest !== input.expectedPushDigest) {
            return errOp(
                'mode_policy_invalid',
                'Repo push was blocked because branch sync state changed after preview.'
            );
        }
        if (inspection.family !== 'git') {
            return errOp('mode_policy_invalid', inspection.guardrail.reason);
        }

        const pushResult = await this.commandRunner.run({
            command: 'git',
            args: ['push', '--porcelain'],
            cwd: checkout.resolvedCheckoutPath,
            timeoutMs: REPO_COMMIT_COMMAND_TIMEOUT_MS,
        });
        if (pushResult.exitCode !== 0 || pushResult.timedOut) {
            return errOp('request_failed', pushResult.timedOut ? 'Git push timed out.' : 'Git push failed.');
        }

        return okOp({
            pushed: true,
            guardrail: buildGuardrail('push', 'safe_to_proceed', 'Git push completed.'),
            vcsFamily: 'git',
            researchCheckoutRecordId: input.researchCheckoutRecordId,
            resolvedCheckoutPath: checkout.resolvedCheckoutPath,
            ...(inspection.branch ? { branch: inspection.branch } : {}),
            ...(inspection.upstream ? { upstream: inspection.upstream } : {}),
            ...(inspection.aheadCount !== undefined ? { aheadCount: inspection.aheadCount } : {}),
            receipt: commandReceipt('git push', pushResult),
        });
    }

    async generateTextDraft(
        input: RuntimeGenerateRepoTextDraftInput
    ): Promise<OperationalResult<RuntimeGenerateRepoTextDraftResult>> {
        const preview = await this.preview(input);
        if (preview.isErr()) {
            return errOp(preview.error.code, preview.error.message);
        }
        const previewValue = preview.value;
        if (!input.providerId || !input.modelId) {
            return okOp({
                available: false,
                draftKind: input.draftKind,
                reason: 'Repo text draft generation requires a selected provider and model.',
            });
        }

        const target = await resolveSummaryGenerationTarget({
            profileId: input.profileId,
            fallbackProviderId: input.providerId,
            fallbackModelId: input.modelId,
            summaryMessages: this.buildDraftMessages(input, previewValue.changeSummary),
        });
        if (!target) {
            return okOp({
                available: false,
                draftKind: input.draftKind,
                reason: 'No configured model can generate this repo text draft.',
            });
        }

        const generated = await generatePlainTextFromMessages({
            profileId: input.profileId,
            providerId: target.providerId,
            modelId: target.modelId,
            messages: this.buildDraftMessages(input, previewValue.changeSummary),
            timeoutMs: 15_000,
        });
        if (generated.isErr()) {
            return okOp({
                available: false,
                draftKind: input.draftKind,
                reason: generated.error.message,
            });
        }

        const text = this.parseGeneratedDraftText(input.draftKind, generated.value);
        if (!text) {
            return okOp({
                available: false,
                draftKind: input.draftKind,
                reason: 'Generated repo text draft was empty or invalid.',
            });
        }

        return okOp({
            available: true,
            draftKind: input.draftKind,
            text,
            source: target.source,
        });
    }

    private async inspect(input: {
        checkoutPath: string;
        family: RepoVcsFamily;
        selectedPaths: string[];
    }): Promise<RepoCommitInspection> {
        if (input.family === 'git') {
            return this.inspectGit(input.checkoutPath, input.selectedPaths);
        }
        if (input.family === 'jj') {
            return this.inspectJj(input.checkoutPath, input.selectedPaths);
        }

        return {
            family: input.family,
            statusOutput: '',
            changeSummary: { changedFileCount: 0, changedPathSamples: [], files: [], selectedPathCount: 0 },
            guardrail: buildGuardrail('commit', 'blocked', 'Repo commit requires a Git or JJ checkout.'),
        };
    }

    private async inspectGit(checkoutPath: string, selectedPaths: string[]): Promise<RepoCommitInspection> {
        const result = await this.commandRunner.run({
            command: 'git',
            args: ['status', '--porcelain=v1', '--branch'],
            cwd: checkoutPath,
            timeoutMs: REPO_COMMIT_COMMAND_TIMEOUT_MS,
        });
        if (result.exitCode !== 0 || result.timedOut) {
            return {
                family: 'git',
                statusOutput: result.stdout,
                changeSummary: { changedFileCount: 0, changedPathSamples: [], files: [], selectedPathCount: 0 },
                guardrail: buildGuardrail(
                    'commit',
                    'blocked',
                    result.timedOut
                        ? 'Git status timed out before commit preview.'
                        : 'Git status could not inspect the checkout.'
                ),
            };
        }

        const summary = summarizeGitChanges(result.stdout, selectedPaths);
        const selectedResult = validateSelectedPaths({ selectedPaths, files: summary.files });
        if (selectedResult.isErr()) {
            return {
                family: 'git',
                statusOutput: result.stdout,
                changeSummary: summary,
                guardrail: buildGuardrail('commit', 'blocked', selectedResult.error.message),
            };
        }
        if (result.stdout.includes('[ahead') && result.stdout.includes('behind')) {
            return {
                family: 'git',
                statusOutput: result.stdout,
                changeSummary: summary,
                guardrail: buildGuardrail(
                    'commit',
                    'blocked',
                    'Git checkout is diverged; commit requires operator review first.'
                ),
            };
        }
        if (summary.changedFileCount === 0) {
            return {
                family: 'git',
                statusOutput: result.stdout,
                changeSummary: summary,
                guardrail: buildGuardrail('commit', 'blocked', 'Git checkout has no changes to commit.'),
            };
        }
        if (selectedPaths.length > 0 && summary.selectedPathCount === 0) {
            return {
                family: 'git',
                statusOutput: result.stdout,
                changeSummary: summary,
                guardrail: buildGuardrail(
                    'commit',
                    'blocked',
                    'Repo commit requires at least one selected changed file.'
                ),
            };
        }

        return {
            family: 'git',
            statusOutput: result.stdout,
            changeSummary: summary,
            commitDigest: digestCommit({ family: 'git', checkoutPath, statusOutput: result.stdout, selectedPaths }),
            guardrail: buildGuardrail(
                'commit',
                'approval_required',
                'Git checkout changes can be committed after operator approval.'
            ),
        };
    }

    private async inspectJj(checkoutPath: string, selectedPaths: string[]): Promise<RepoCommitInspection> {
        const result = await this.commandRunner.run({
            command: 'jj',
            args: ['--no-pager', 'status'],
            cwd: checkoutPath,
            timeoutMs: REPO_COMMIT_COMMAND_TIMEOUT_MS,
        });
        if (result.exitCode !== 0 || result.timedOut) {
            return {
                family: 'jj',
                statusOutput: result.stdout,
                changeSummary: { changedFileCount: 0, changedPathSamples: [], files: [], selectedPathCount: 0 },
                guardrail: buildGuardrail(
                    'commit',
                    'blocked',
                    result.timedOut
                        ? 'JJ status timed out before commit preview.'
                        : 'JJ status could not inspect the checkout.'
                ),
            };
        }

        const summary = summarizeJjChanges(result.stdout, selectedPaths);
        if (selectedPaths.length > 0) {
            return {
                family: 'jj',
                statusOutput: result.stdout,
                changeSummary: summary,
                guardrail: buildGuardrail(
                    'commit',
                    'blocked',
                    'JJ file-scoped commit selection requires future split/change support.'
                ),
            };
        }
        if (summary.changedFileCount === 0) {
            return {
                family: 'jj',
                statusOutput: result.stdout,
                changeSummary: summary,
                guardrail: buildGuardrail('commit', 'blocked', 'JJ checkout has no working-copy changes to describe.'),
            };
        }

        return {
            family: 'jj',
            statusOutput: result.stdout,
            changeSummary: summary,
            commitDigest: digestCommit({ family: 'jj', checkoutPath, statusOutput: result.stdout, selectedPaths }),
            guardrail: buildGuardrail(
                'commit',
                'approval_required',
                'JJ working-copy changes can be described after operator approval.'
            ),
        };
    }

    private async applyGitCommit(
        input: RuntimeApplyRepoCommitInput,
        checkoutPath: string,
        inspection: RepoCommitInspection,
        selectedPaths: string[]
    ): Promise<OperationalResult<RuntimeApplyRepoCommitResult>> {
        const pathspecs = selectedPaths.length > 0 ? selectedPaths : ['.'];
        const addResult = await this.commandRunner.run({
            command: 'git',
            args: ['add', '-A', '--', ...pathspecs],
            cwd: checkoutPath,
            timeoutMs: REPO_COMMIT_COMMAND_TIMEOUT_MS,
        });
        if (addResult.exitCode !== 0 || addResult.timedOut) {
            return errOp('request_failed', addResult.timedOut ? 'Git add timed out.' : 'Git add failed.');
        }

        const commitArgs = [
            'commit',
            '-m',
            input.message,
            ...(selectedPaths.length > 0 ? ['--', ...selectedPaths] : []),
        ];
        const commitResult = await this.commandRunner.run({
            command: 'git',
            args: commitArgs,
            cwd: checkoutPath,
            timeoutMs: REPO_COMMIT_COMMAND_TIMEOUT_MS,
        });
        if (commitResult.exitCode !== 0 || commitResult.timedOut) {
            return errOp('request_failed', commitResult.timedOut ? 'Git commit timed out.' : 'Git commit failed.');
        }

        const revisionResult = await this.commandRunner.run({
            command: 'git',
            args: ['rev-parse', 'HEAD'],
            cwd: checkoutPath,
            timeoutMs: REPO_COMMIT_COMMAND_TIMEOUT_MS,
        });

        const revisionId = revisionResult.exitCode === 0 ? parseGitRevisionId(revisionResult.stdout) : undefined;
        const result: RuntimeApplyRepoCommitResult = {
            committed: true,
            guardrail: buildGuardrail('commit', 'safe_to_proceed', 'Git commit completed.'),
            vcsFamily: 'git',
            researchCheckoutRecordId: input.researchCheckoutRecordId,
            resolvedCheckoutPath: checkoutPath,
            changeSummary: inspection.changeSummary,
            receipt: commandReceipt('git commit', commitResult),
        };
        if (revisionId) {
            result.revisionId = revisionId;
        }

        return okOp(result);
    }

    private async applyJjCommit(
        input: RuntimeApplyRepoCommitInput,
        checkoutPath: string,
        inspection: RepoCommitInspection
    ): Promise<OperationalResult<RuntimeApplyRepoCommitResult>> {
        const describeResult = await this.commandRunner.run({
            command: 'jj',
            args: ['describe', '-m', input.message],
            cwd: checkoutPath,
            timeoutMs: REPO_COMMIT_COMMAND_TIMEOUT_MS,
        });
        if (describeResult.exitCode !== 0 || describeResult.timedOut) {
            return errOp('request_failed', describeResult.timedOut ? 'JJ describe timed out.' : 'JJ describe failed.');
        }

        const revisionResult = await this.commandRunner.run({
            command: 'jj',
            args: ['--no-pager', 'log', '-r', '@', '--no-graph', '--color', 'never'],
            cwd: checkoutPath,
            timeoutMs: REPO_COMMIT_COMMAND_TIMEOUT_MS,
        });

        const revisionId = revisionResult.exitCode === 0 ? parseJjRevisionId(revisionResult.stdout) : undefined;
        const result: RuntimeApplyRepoCommitResult = {
            committed: true,
            guardrail: buildGuardrail('commit', 'safe_to_proceed', 'JJ change description completed.'),
            vcsFamily: 'jj',
            researchCheckoutRecordId: input.researchCheckoutRecordId,
            resolvedCheckoutPath: checkoutPath,
            changeSummary: inspection.changeSummary,
            receipt: commandReceipt('jj describe', describeResult),
        };
        if (revisionId) {
            result.revisionId = revisionId;
        }

        return okOp(result);
    }

    private async inspectPush(checkoutPath: string, family: RepoVcsFamily): Promise<RepoPushInspection> {
        if (family === 'jj') {
            return {
                family,
                guardrail: buildGuardrail(
                    'push',
                    'blocked',
                    'JJ push requires a first-class bookmark and remote design.'
                ),
            };
        }
        if (family !== 'git') {
            return {
                family,
                guardrail: buildGuardrail('push', 'blocked', 'Repo push requires a Git checkout.'),
            };
        }

        const result = await this.commandRunner.run({
            command: 'git',
            args: ['status', '--porcelain=v1', '--branch'],
            cwd: checkoutPath,
            timeoutMs: REPO_COMMIT_COMMAND_TIMEOUT_MS,
        });
        if (result.exitCode !== 0 || result.timedOut) {
            return {
                family,
                guardrail: buildGuardrail(
                    'push',
                    'blocked',
                    result.timedOut
                        ? 'Git status timed out before push preview.'
                        : 'Git status could not inspect the checkout.'
                ),
            };
        }

        const summary = summarizeGitChanges(result.stdout);
        const branch = parseGitBranchStatus(result.stdout);
        const shared = {
            family,
            ...(branch.branch ? { branch: branch.branch } : {}),
            ...(branch.upstream ? { upstream: branch.upstream } : {}),
            aheadCount: branch.aheadCount,
        };
        if (summary.changedFileCount > 0) {
            return {
                ...shared,
                guardrail: buildGuardrail('push', 'blocked', 'Git push requires a clean checkout.'),
            };
        }
        if (branch.detached) {
            return {
                ...shared,
                guardrail: buildGuardrail('push', 'blocked', 'Git push requires a branch checkout, not detached HEAD.'),
            };
        }
        if (!branch.hasUpstream) {
            return {
                ...shared,
                guardrail: buildGuardrail('push', 'blocked', 'Git push requires a configured upstream.'),
            };
        }
        if (branch.behindCount > 0) {
            return {
                ...shared,
                guardrail: buildGuardrail('push', 'blocked', 'Git push requires ahead-only sync state.'),
            };
        }
        if (branch.aheadCount === 0) {
            return {
                ...shared,
                guardrail: buildGuardrail('push', 'blocked', 'Git checkout has no local commits to push.'),
            };
        }

        return {
            ...shared,
            pushDigest: digestText(['git', path.resolve(checkoutPath), result.stdout].join('\0')),
            guardrail: buildGuardrail('push', 'approval_required', 'Git branch can be pushed after operator approval.'),
        };
    }

    private buildDraftMessages(input: RuntimeGenerateRepoTextDraftInput, summary: RepoCommitChangeSummary) {
        const selectedFiles =
            summary.files
                .filter((file) =>
                    input.selectedPaths?.length ? input.selectedPaths.includes(file.relativePath) : true
                )
                .map((file) => `- ${file.status}: ${file.relativePath}`)
                .join('\n') || '- No selected files';
        const shape =
            input.draftKind === 'commit_message'
                ? 'Return one concise conventional commit message only. No markdown, no quotes.'
                : 'Return one concise pull request title only. No markdown, no quotes.';
        return [
            {
                role: 'system' as const,
                parts: [
                    {
                        type: 'text' as const,
                        text: [
                            'Generate editable assistive repo workflow text for NeonConductor.',
                            'The operator will review and may edit this text before use.',
                            shape,
                        ].join('\n'),
                    },
                ],
            },
            {
                role: 'user' as const,
                parts: [
                    {
                        type: 'text' as const,
                        text: [
                            `Draft kind: ${input.draftKind}`,
                            `Current message field: ${input.message}`,
                            '',
                            'Changed files:',
                            selectedFiles,
                        ].join('\n'),
                    },
                ],
            },
        ];
    }

    private parseGeneratedDraftText(
        kind: RuntimeGenerateRepoTextDraftInput['draftKind'],
        rawText: string
    ): string | null {
        const firstLine = rawText
            .trim()
            .replace(/^```(?:text)?/iu, '')
            .replace(/```$/u, '')
            .split(/\r?\n/u)
            .map((line) => line.trim())
            .find((line) => line.length > 0);
        if (!firstLine) {
            return null;
        }
        const text = firstLine.replace(/^["']|["']$/gu, '').trim();
        if (text.length === 0 || text.length > (kind === 'commit_message' ? 200 : 140)) {
            return null;
        }
        return text;
    }
}

export const repoCommitService = new RepoCommitService();
