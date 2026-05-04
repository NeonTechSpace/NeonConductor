import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { researchCheckoutStore } from '@/app/backend/persistence/stores';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import {
    defaultResearchCheckoutCommandRunner,
    type ResearchCheckoutCommandResult,
    type ResearchCheckoutCommandRunner,
} from '@/app/backend/runtime/services/researchCheckouts/commandRunner';

import type {
    RepoCommitChangeSummary,
    RepoCommitCommandReceipt,
    RepoMutationGuardrail,
    RepoVcsFamily,
    RuntimeApplyRepoCommitInput,
    RuntimeApplyRepoCommitResult,
    RuntimePreviewRepoCommitResult,
    RuntimeRepoCommitInput,
} from '@/shared/contracts';

const REPO_COMMIT_COMMAND_TIMEOUT_MS = 10_000;
const CHANGED_PATH_SAMPLE_LIMIT = 20;

interface RepoCommitInspection {
    family: RepoVcsFamily;
    statusOutput: string;
    changeSummary: RepoCommitChangeSummary;
    workingTreeDigest?: string;
    guardrail: RepoMutationGuardrail;
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

function digestWorkingTree(input: { family: RepoVcsFamily; checkoutPath: string; statusOutput: string }): string {
    return createHash('sha256')
        .update(input.family)
        .update('\0')
        .update(path.resolve(input.checkoutPath))
        .update('\0')
        .update(input.statusOutput)
        .digest('hex');
}

function buildGuardrail(outcome: RepoMutationGuardrail['outcome'], reason: string): RepoMutationGuardrail {
    return {
        intent: 'commit',
        outcome,
        reason,
    };
}

function summarizeGitChanges(statusOutput: string): RepoCommitChangeSummary {
    const changedPaths = normalizeStatusLines(statusOutput)
        .filter((line) => !line.startsWith('## '))
        .map((line) => line.slice(3).trim())
        .filter((line) => line.length > 0);

    return {
        changedFileCount: changedPaths.length,
        changedPathSamples: changedPaths.slice(0, CHANGED_PATH_SAMPLE_LIMIT),
    };
}

function summarizeJjChanges(statusOutput: string): RepoCommitChangeSummary {
    const changedPaths = normalizeStatusLines(statusOutput)
        .filter((line) => /^[AMDRC?!] /u.test(line))
        .map((line) => line.slice(2).trim())
        .filter((line) => line.length > 0);

    return {
        changedFileCount: changedPaths.length,
        changedPathSamples: changedPaths.slice(0, CHANGED_PATH_SAMPLE_LIMIT),
    };
}

function commandReceipt(command: RepoCommitCommandReceipt['command'], result: ResearchCheckoutCommandResult) {
    return {
        command,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        timedOut: result.timedOut,
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

        const inspection = await this.inspect(checkoutResult.value.resolvedCheckoutPath, checkoutResult.value.effectiveVcs);
        return okOp({
            available: inspection.guardrail.outcome === 'approval_required',
            guardrail: inspection.guardrail,
            vcsFamily: inspection.family,
            researchCheckoutRecordId: input.researchCheckoutRecordId,
            resolvedCheckoutPath: checkoutResult.value.resolvedCheckoutPath,
            changeSummary: inspection.changeSummary,
            ...(inspection.workingTreeDigest ? { expectedWorkingTreeDigest: inspection.workingTreeDigest } : {}),
        });
    }

    async apply(input: RuntimeApplyRepoCommitInput): Promise<OperationalResult<RuntimeApplyRepoCommitResult>> {
        const checkoutResult = await this.loadCheckout(input);
        if (checkoutResult.isErr()) {
            return errOp(checkoutResult.error.code, checkoutResult.error.message);
        }

        const checkout = checkoutResult.value;
        const inspection = await this.inspect(checkout.resolvedCheckoutPath, checkout.effectiveVcs);
        if (inspection.guardrail.outcome !== 'approval_required' || !inspection.workingTreeDigest) {
            return errOp('mode_policy_invalid', inspection.guardrail.reason);
        }
        if (inspection.workingTreeDigest !== input.expectedWorkingTreeDigest) {
            return errOp(
                'mode_policy_invalid',
                'Repo commit was blocked because the working tree changed after preview.'
            );
        }

        if (inspection.family === 'git') {
            return this.applyGitCommit(input, checkout.resolvedCheckoutPath, inspection);
        }
        if (inspection.family === 'jj') {
            return this.applyJjCommit(input, checkout.resolvedCheckoutPath, inspection);
        }

        return errOp('mode_policy_invalid', inspection.guardrail.reason);
    }

    private async loadCheckout(input: RuntimeRepoCommitInput) {
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

    private async inspect(checkoutPath: string, family: RepoVcsFamily): Promise<RepoCommitInspection> {
        if (family === 'git') {
            return this.inspectGit(checkoutPath);
        }
        if (family === 'jj') {
            return this.inspectJj(checkoutPath);
        }

        return {
            family,
            statusOutput: '',
            changeSummary: { changedFileCount: 0, changedPathSamples: [] },
            guardrail: buildGuardrail('blocked', 'Repo commit requires a Git or JJ checkout.'),
        };
    }

    private async inspectGit(checkoutPath: string): Promise<RepoCommitInspection> {
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
                changeSummary: { changedFileCount: 0, changedPathSamples: [] },
                guardrail: buildGuardrail(
                    'blocked',
                    result.timedOut ? 'Git status timed out before commit preview.' : 'Git status could not inspect the checkout.'
                ),
            };
        }

        const summary = summarizeGitChanges(result.stdout);
        if (result.stdout.includes('[ahead') && result.stdout.includes('behind')) {
            return {
                family: 'git',
                statusOutput: result.stdout,
                changeSummary: summary,
                guardrail: buildGuardrail('blocked', 'Git checkout is diverged; commit requires operator review first.'),
            };
        }
        if (summary.changedFileCount === 0) {
            return {
                family: 'git',
                statusOutput: result.stdout,
                changeSummary: summary,
                guardrail: buildGuardrail('blocked', 'Git checkout has no changes to commit.'),
            };
        }

        return {
            family: 'git',
            statusOutput: result.stdout,
            changeSummary: summary,
            workingTreeDigest: digestWorkingTree({ family: 'git', checkoutPath, statusOutput: result.stdout }),
            guardrail: buildGuardrail('approval_required', 'Git checkout changes can be committed after operator approval.'),
        };
    }

    private async inspectJj(checkoutPath: string): Promise<RepoCommitInspection> {
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
                changeSummary: { changedFileCount: 0, changedPathSamples: [] },
                guardrail: buildGuardrail(
                    'blocked',
                    result.timedOut ? 'JJ status timed out before commit preview.' : 'JJ status could not inspect the checkout.'
                ),
            };
        }

        const summary = summarizeJjChanges(result.stdout);
        if (summary.changedFileCount === 0) {
            return {
                family: 'jj',
                statusOutput: result.stdout,
                changeSummary: summary,
                guardrail: buildGuardrail('blocked', 'JJ checkout has no working-copy changes to describe.'),
            };
        }

        return {
            family: 'jj',
            statusOutput: result.stdout,
            changeSummary: summary,
            workingTreeDigest: digestWorkingTree({ family: 'jj', checkoutPath, statusOutput: result.stdout }),
            guardrail: buildGuardrail(
                'approval_required',
                'JJ working-copy changes can be described after operator approval.'
            ),
        };
    }

    private async applyGitCommit(
        input: RuntimeApplyRepoCommitInput,
        checkoutPath: string,
        inspection: RepoCommitInspection
    ): Promise<OperationalResult<RuntimeApplyRepoCommitResult>> {
        const addResult = await this.commandRunner.run({
            command: 'git',
            args: ['add', '-A', '--', '.'],
            cwd: checkoutPath,
            timeoutMs: REPO_COMMIT_COMMAND_TIMEOUT_MS,
        });
        if (addResult.exitCode !== 0 || addResult.timedOut) {
            return errOp('request_failed', addResult.timedOut ? 'Git add timed out.' : 'Git add failed.');
        }

        const commitResult = await this.commandRunner.run({
            command: 'git',
            args: ['commit', '-m', input.message],
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
            guardrail: buildGuardrail('safe_to_proceed', 'Git commit completed.'),
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
            guardrail: buildGuardrail('safe_to_proceed', 'JJ change description completed.'),
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
}

export const repoCommitService = new RepoCommitService();
