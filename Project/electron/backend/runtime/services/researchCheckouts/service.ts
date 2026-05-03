import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { researchCheckoutStore, threadStore, workspaceRootStore } from '@/app/backend/persistence/stores';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import {
    defaultResearchCheckoutCommandRunner,
    type ResearchCheckoutCommandRunner,
} from '@/app/backend/runtime/services/researchCheckouts/commandRunner';
import { canonicalizeResearchRepoLocator } from '@/app/backend/runtime/services/researchCheckouts/locator';
import {
    getResearchCheckoutRootSettings,
    setResearchCheckoutRootSettings,
} from '@/app/backend/runtime/services/researchCheckouts/settings';

import type {
    RepoMutationGuardrail,
    RepoVcsFamily,
    RepoWorkflowState,
    ResearchCheckoutRootSettings,
    ResearchTargetKind,
    RuntimePreviewResearchTargetInput,
    RuntimePreviewResearchTargetResult,
    RuntimeSetResearchCheckoutRootSettingsInput,
    RuntimeSetResearchCheckoutRootSettingsResult,
    RunResearchTarget,
} from '@/shared/contracts';

const RESEARCH_COMMAND_TIMEOUT_MS = 5_000;

function toPathKey(absolutePath: string): string {
    return process.platform === 'win32' ? absolutePath.toLowerCase() : absolutePath;
}

function digestLocatorKey(canonicalKey: string): string {
    return createHash('sha256').update(canonicalKey).digest('hex').slice(0, 16);
}

function deterministicCheckoutPath(rootAbsolutePath: string, repoName: string, canonicalKey: string): string {
    return path.join(rootAbsolutePath, `${repoName}-${digestLocatorKey(canonicalKey)}`);
}

function isMissingFileError(error: unknown): boolean {
    return error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT';
}

async function pathExists(absolutePath: string): Promise<boolean> {
    try {
        await fs.stat(absolutePath);
        return true;
    } catch (error) {
        if (isMissingFileError(error)) {
            return false;
        }
        return false;
    }
}

async function directoryExists(absolutePath: string): Promise<boolean> {
    try {
        const stat = await fs.stat(absolutePath);
        return stat.isDirectory();
    } catch (error) {
        if (isMissingFileError(error)) {
            return false;
        }
        return false;
    }
}

async function resolveRootAbsolutePath(input: {
    profileId: string;
    sessionId?: string;
    workspaceFingerprint?: string;
    settings: ResearchCheckoutRootSettings;
}): Promise<OperationalResult<string>> {
    if (input.settings.policy === 'os_temp') {
        return okOp(path.join(os.tmpdir(), 'neonconductor', 'research-repos', input.profileId));
    }

    if (input.settings.policy === 'custom_path') {
        if (!input.settings.customAbsolutePath || !path.isAbsolute(input.settings.customAbsolutePath)) {
            return errOp('invalid_input', 'Custom repo-research checkout root is not an absolute path.');
        }
        return okOp(path.resolve(input.settings.customAbsolutePath));
    }

    const workspaceFingerprint =
        input.workspaceFingerprint ??
        (input.sessionId
            ? (await threadStore.getBySessionId(input.profileId, input.sessionId))?.workspaceFingerprint
            : undefined);
    if (!workspaceFingerprint) {
        return errOp(
            'execution_target_unavailable',
            'Repo-research current-workspace checkout root requires a workspace-backed session.'
        );
    }

    const workspaceRoot = await workspaceRootStore.getByFingerprint(input.profileId, workspaceFingerprint);
    if (!workspaceRoot) {
        return errOp('not_found', 'Selected workspace root was not found for repo-research checkout resolution.');
    }

    return okOp(path.join(workspaceRoot.absolutePath, '.neonconductor', 'research-repos'));
}

function parseGitBranchLine(output: string): {
    branch?: string;
    detached: boolean;
    syncStatus: RepoWorkflowState['syncStatus'];
} {
    const firstLine = output.split(/\r?\n/u).find((line) => line.startsWith('## '));
    if (!firstLine) {
        return { detached: false, syncStatus: 'unknown' };
    }

    const statusText = firstLine.slice(3);
    const detached = statusText.includes('HEAD (no branch)') || statusText.includes('No commits yet on');
    const branch = detached ? undefined : statusText.split('...')[0]?.trim();
    const hasRemote = statusText.includes('...');
    const ahead = /\bahead \d+/u.test(statusText);
    const behind = /\bbehind \d+/u.test(statusText);
    if (!hasRemote) {
        return { ...(branch ? { branch } : {}), detached, syncStatus: 'unknown' };
    }
    if (ahead && behind) {
        return { ...(branch ? { branch } : {}), detached, syncStatus: 'diverged' };
    }
    if (ahead) {
        return { ...(branch ? { branch } : {}), detached, syncStatus: 'ahead' };
    }
    if (behind) {
        return { ...(branch ? { branch } : {}), detached, syncStatus: 'behind' };
    }
    return { ...(branch ? { branch } : {}), detached, syncStatus: 'up_to_date' };
}

async function inspectGitCheckout(
    checkoutPath: string,
    commandRunner: ResearchCheckoutCommandRunner
): Promise<RepoWorkflowState> {
    const result = await commandRunner.run({
        command: 'git',
        args: ['status', '--porcelain=v1', '--branch'],
        cwd: checkoutPath,
        timeoutMs: RESEARCH_COMMAND_TIMEOUT_MS,
    });
    if (result.exitCode !== 0 || result.timedOut) {
        return {
            family: 'git',
            status: 'unknown',
            detached: false,
            remoteAvailable: false,
            syncStatus: 'unknown',
            explanation: result.timedOut ? 'Git status timed out.' : 'Git status could not inspect the checkout.',
        };
    }

    const { branch, detached, syncStatus } = parseGitBranchLine(result.stdout);
    const bodyLines = result.stdout.split(/\r?\n/u).filter((line) => line.length > 0 && !line.startsWith('## '));
    const dirty = bodyLines.length > 0;
    const status = dirty ? 'dirty' : syncStatus === 'diverged' ? 'diverged' : 'clean';
    return {
        family: 'git',
        status,
        ...(branch ? { branch } : {}),
        detached,
        remoteAvailable: syncStatus !== 'unknown',
        syncStatus,
        explanation: dirty
            ? 'Git checkout has uncommitted changes; repo-research pauses update and target switching.'
            : 'Git checkout is clean and can be reused conservatively.',
    };
}

async function inspectJjCheckout(
    checkoutPath: string,
    commandRunner: ResearchCheckoutCommandRunner
): Promise<RepoWorkflowState> {
    const result = await commandRunner.run({
        command: 'jj',
        args: ['--no-pager', 'status'],
        cwd: checkoutPath,
        timeoutMs: RESEARCH_COMMAND_TIMEOUT_MS,
    });
    if (result.exitCode !== 0 || result.timedOut) {
        return {
            family: 'jj',
            status: 'unknown',
            detached: false,
            remoteAvailable: false,
            syncStatus: 'unknown',
            explanation: result.timedOut ? 'JJ status timed out.' : 'JJ status could not inspect the checkout.',
        };
    }

    const clean =
        result.stdout.includes('The working copy has no changes.') || !result.stdout.includes('Working copy changes:');
    return {
        family: 'jj',
        status: clean ? 'clean' : 'dirty',
        detached: false,
        remoteAvailable: true,
        syncStatus: 'unknown',
        explanation: clean
            ? 'JJ checkout is clean; repo-research will only plan fetch-only remote awareness.'
            : 'JJ checkout has working copy changes; repo-research pauses update and target switching.',
    };
}

async function inspectCheckout(
    checkoutPath: string,
    commandRunner: ResearchCheckoutCommandRunner
): Promise<{ detectedVcs: RepoVcsFamily; effectiveVcs: RepoVcsFamily; state: RepoWorkflowState }> {
    if (!(await directoryExists(checkoutPath))) {
        return {
            detectedVcs: 'unknown',
            effectiveVcs: 'unknown',
            state: {
                family: 'unknown',
                status: 'missing',
                detached: false,
                remoteAvailable: false,
                syncStatus: 'not_applicable',
                explanation: 'Checkout path does not exist yet; clone is required before execution.',
            },
        };
    }

    const hasJj = await pathExists(path.join(checkoutPath, '.jj'));
    const hasGit = await pathExists(path.join(checkoutPath, '.git'));
    if (hasJj) {
        const state = await inspectJjCheckout(checkoutPath, commandRunner);
        return { detectedVcs: 'jj', effectiveVcs: 'jj', state };
    }
    if (hasGit) {
        const state = await inspectGitCheckout(checkoutPath, commandRunner);
        return { detectedVcs: 'git', effectiveVcs: 'git', state };
    }

    return {
        detectedVcs: 'unknown',
        effectiveVcs: 'unknown',
        state: {
            family: 'unknown',
            status: 'unknown',
            detached: false,
            remoteAvailable: false,
            syncStatus: 'unknown',
            explanation: 'Checkout path exists but is not recognized as a Git or JJ repository.',
        },
    };
}

function chooseUpdateAction(state: RepoWorkflowState): RunResearchTarget['updateAction'] {
    if (state.status === 'missing') {
        return 'unavailable';
    }
    if (state.status !== 'clean') {
        return 'pause_for_review';
    }
    if (state.family === 'jj') {
        return 'fetch_only';
    }
    if (state.family === 'git' && state.syncStatus === 'behind') {
        return 'fast_forward';
    }
    if (state.family === 'git' && state.syncStatus === 'diverged') {
        return 'pause_for_review';
    }
    return 'none';
}

function chooseTargetSwitchAction(
    requestedTarget: ResearchTargetKind | undefined,
    state: RepoWorkflowState
): RunResearchTarget['targetSwitchAction'] {
    if (!requestedTarget || requestedTarget.kind === 'default_branch') {
        return 'none';
    }
    if (state.status !== 'clean') {
        return 'pause_for_review';
    }
    if (requestedTarget.kind === 'branch') {
        return 'checkout_branch';
    }
    if (requestedTarget.kind === 'pull_request') {
        return 'checkout_pull_request';
    }
    return 'checkout_commit';
}

function buildMutationGuardrail(input: RuntimePreviewResearchTargetInput['target']): RepoMutationGuardrail {
    const intent = input.mutationIntent ?? 'inspect';
    if (intent === 'inspect') {
        return {
            intent,
            outcome: 'safe_to_proceed',
            reason: 'Repo-research inspect runs are read-only by default.',
        };
    }

    return {
        intent,
        outcome: 'blocked',
        reason: 'Repo-research commit and push intents are not implemented in Slice 8I.',
    };
}

function buildExplanation(input: {
    state: RepoWorkflowState;
    updateAction: RunResearchTarget['updateAction'];
    targetSwitchAction: RunResearchTarget['targetSwitchAction'];
}): string {
    if (input.state.status === 'missing') {
        return 'Checkout is not present; repo-research reports a deterministic clone target but does not clone during this slice.';
    }
    if (input.updateAction === 'pause_for_review' || input.targetSwitchAction === 'pause_for_review') {
        return 'Checkout reuse requires review because the repository is dirty, diverged, or unknown.';
    }
    return input.state.explanation;
}

export class ResearchCheckoutService {
    constructor(private readonly commandRunner: ResearchCheckoutCommandRunner = defaultResearchCheckoutCommandRunner) {}

    async getRootSettings(profileId: string): Promise<ResearchCheckoutRootSettings> {
        return getResearchCheckoutRootSettings(profileId);
    }

    async setRootSettings(
        input: RuntimeSetResearchCheckoutRootSettingsInput
    ): Promise<OperationalResult<RuntimeSetResearchCheckoutRootSettingsResult>> {
        const settingsResult = await setResearchCheckoutRootSettings(input);
        if (settingsResult.isErr()) {
            return errOp(settingsResult.error.code, settingsResult.error.message);
        }

        return okOp({ settings: settingsResult.value });
    }

    async previewResearchTarget(
        input: RuntimePreviewResearchTargetInput
    ): Promise<OperationalResult<RuntimePreviewResearchTargetResult>> {
        const locatorResult = canonicalizeResearchRepoLocator(input.target.repoUrl);
        if (locatorResult.isErr()) {
            return errOp(locatorResult.error.code, locatorResult.error.message);
        }

        const settings = await getResearchCheckoutRootSettings(input.profileId);
        const rootResult = await resolveRootAbsolutePath({
            profileId: input.profileId,
            ...(input.sessionId ? { sessionId: input.sessionId } : {}),
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            settings,
        });
        if (rootResult.isErr()) {
            return errOp(rootResult.error.code, rootResult.error.message);
        }

        const rootAbsolutePath = path.resolve(rootResult.value);
        const locator = locatorResult.value;
        const resolvedCheckoutPath = deterministicCheckoutPath(rootAbsolutePath, locator.name, locator.canonicalKey);
        if (!toPathKey(resolvedCheckoutPath).startsWith(`${toPathKey(rootAbsolutePath)}${path.sep}`)) {
            return errOp('invalid_input', 'Resolved repo-research checkout path escaped the configured root.');
        }

        const inspected = await inspectCheckout(resolvedCheckoutPath, this.commandRunner);
        const checkoutAction = inspected.state.status === 'missing' ? 'clone_required' : 'reuse_existing';
        const updateAction = chooseUpdateAction(inspected.state);
        const targetSwitchAction = chooseTargetSwitchAction(input.target.requestedTarget, inspected.state);
        const now = nowIso();
        const researchTarget: RunResearchTarget = {
            requested: input.target,
            locator,
            rootPolicy: settings.policy,
            rootAbsolutePath,
            resolvedCheckoutPath,
            checkoutAction,
            updateAction,
            targetSwitchAction,
            detectedVcs: inspected.detectedVcs,
            effectiveVcs: inspected.effectiveVcs,
            repoWorkflowState: inspected.state,
            mutationGuardrail: buildMutationGuardrail(input.target),
            explanation: buildExplanation({
                state: inspected.state,
                updateAction,
                targetSwitchAction,
            }),
            updatedAt: now,
        };
        const record = await researchCheckoutStore.upsertFromResearchTarget({
            profileId: input.profileId,
            researchTarget,
        });

        return okOp({
            researchTarget: {
                ...researchTarget,
                checkoutRecordId: record.id,
            },
        });
    }
}

export const researchCheckoutService = new ResearchCheckoutService();
