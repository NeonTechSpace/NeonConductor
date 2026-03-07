import { checkpointStore, diffStore, runStore, threadStore, workspaceRootStore } from '@/app/backend/persistence/stores';
import type { CheckpointRecord, DiffRecord } from '@/app/backend/persistence/types';
import type { CheckpointRollbackInput, CheckpointRollbackResult, TopLevelTab } from '@/app/backend/runtime/contracts';
import { captureGitWorkspaceArtifact, rollbackWorkspaceToArtifact } from '@/app/backend/runtime/services/checkpoint/gitWorkspace';

function isMutatingCheckpointMode(topLevelTab: TopLevelTab, modeKey: string): boolean {
    return (topLevelTab === 'agent' && modeKey === 'code') || topLevelTab === 'orchestrator';
}

function summarizeDiff(diff: DiffRecord): string {
    if (diff.artifact.kind === 'unsupported') {
        return 'Diff capture unavailable';
    }

    if (diff.artifact.fileCount === 0) {
        return 'No file changes';
    }

    return `${String(diff.artifact.fileCount)} changed ${diff.artifact.fileCount === 1 ? 'file' : 'files'}`;
}

export async function ensureCheckpointForRun(input: {
    profileId: string;
    runId: CheckpointRecord['runId'];
    sessionId: CheckpointRecord['sessionId'];
    topLevelTab: TopLevelTab;
    modeKey: string;
    workspaceFingerprint?: string;
}): Promise<{ diff: DiffRecord; checkpoint?: CheckpointRecord } | null> {
    if (!isMutatingCheckpointMode(input.topLevelTab, input.modeKey) || !input.workspaceFingerprint) {
        return null;
    }

    const existingDiffs = await diffStore.listByRun(input.profileId, input.runId);
    const existingCheckpoint = await checkpointStore.getByRunId(input.profileId, input.runId);
    const firstDiff = existingDiffs[0];
    if (firstDiff) {
        return {
            diff: firstDiff,
            ...(existingCheckpoint ? { checkpoint: existingCheckpoint } : {}),
        };
    }

    const workspaceRoot = await workspaceRootStore.getByFingerprint(input.profileId, input.workspaceFingerprint);
    const artifact = workspaceRoot
        ? await captureGitWorkspaceArtifact({
              workspaceRootPath: workspaceRoot.absolutePath,
              workspaceLabel: workspaceRoot.label,
          })
        : {
              kind: 'unsupported' as const,
              workspaceRootPath: 'Unresolved workspace root',
              workspaceLabel: input.workspaceFingerprint,
              reason: 'workspace_unresolved' as const,
              detail: 'Workspace root could not be resolved for this session.',
          };

    const diff = await diffStore.create({
        profileId: input.profileId,
        sessionId: input.sessionId,
        runId: input.runId,
        summary:
            artifact.kind === 'git'
                ? artifact.fileCount === 0
                    ? 'No file changes'
                    : `${String(artifact.fileCount)} changed ${artifact.fileCount === 1 ? 'file' : 'files'}`
                : 'Diff capture unavailable',
        artifact,
    });

    if (artifact.kind !== 'git') {
        return { diff };
    }

    const checkpoint = await checkpointStore.create({
        profileId: input.profileId,
        sessionId: input.sessionId,
        runId: input.runId,
        diffId: diff.id,
        workspaceFingerprint: input.workspaceFingerprint,
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
        summary: summarizeDiff(diff),
    });

    return {
        diff,
        checkpoint,
    };
}

export async function listCheckpoints(input: {
    profileId: string;
    sessionId: CheckpointRecord['sessionId'];
}): Promise<{ checkpoints: CheckpointRecord[] }> {
    return {
        checkpoints: await checkpointStore.listBySession(input.profileId, input.sessionId),
    };
}

export async function createCheckpoint(input: {
    profileId: string;
    runId: CheckpointRecord['runId'];
}): Promise<{ created: boolean; reason?: 'not_found' | 'unsupported_run'; diff?: DiffRecord; checkpoint?: CheckpointRecord }> {
    const run = await runStore.getById(input.runId);
    if (!run || run.profileId !== input.profileId) {
        return {
            created: false,
            reason: 'not_found',
        };
    }

    const sessionThread = await threadStore.getBySessionId(input.profileId, run.sessionId);
    if (!sessionThread || !isMutatingCheckpointMode(sessionThread.thread.topLevelTab, sessionThread.thread.topLevelTab === 'agent' ? 'code' : 'orchestrate')) {
        return {
            created: false,
            reason: 'unsupported_run',
        };
    }

    const result = await ensureCheckpointForRun({
        profileId: input.profileId,
        runId: run.id,
        sessionId: run.sessionId,
        topLevelTab: sessionThread.thread.topLevelTab,
        modeKey: sessionThread.thread.topLevelTab === 'agent' ? 'code' : 'orchestrate',
        ...(sessionThread.workspaceFingerprint ? { workspaceFingerprint: sessionThread.workspaceFingerprint } : {}),
    });
    if (!result) {
        return {
            created: false,
            reason: 'unsupported_run',
        };
    }

    return {
        created: Boolean(result.checkpoint),
        diff: result.diff,
        ...(result.checkpoint ? { checkpoint: result.checkpoint } : {}),
    };
}

export async function rollbackCheckpoint(input: CheckpointRollbackInput): Promise<CheckpointRollbackResult> {
    if (!input.confirm) {
        return {
            rolledBack: false,
            reason: 'confirmation_required',
            message: 'Checkpoint rollback requires explicit confirmation.',
        };
    }

    const checkpoint = await checkpointStore.getById(input.profileId, input.checkpointId);
    if (!checkpoint) {
        return {
            rolledBack: false,
            reason: 'not_found',
        };
    }

    const workspaceRoot = await workspaceRootStore.getByFingerprint(input.profileId, checkpoint.workspaceFingerprint);
    if (!workspaceRoot) {
        return {
            rolledBack: false,
            reason: 'workspace_unresolved',
            message: 'Workspace root could not be resolved for this checkpoint.',
        };
    }

    const diff = await diffStore.getById(input.profileId, checkpoint.diffId);
    if (!diff || diff.artifact.kind !== 'git') {
        return {
            rolledBack: false,
            reason: diff ? 'unsupported_artifact' : 'not_found',
            message: 'Checkpoint does not have a git-backed diff artifact.',
        };
    }

    const rollback = await rollbackWorkspaceToArtifact({
        workspaceRootPath: workspaceRoot.absolutePath,
        artifact: diff.artifact,
    });
    if (rollback.isErr()) {
        return {
            rolledBack: false,
            reason: rollback.error.reason,
            message: rollback.error.detail,
        };
    }

    return {
        rolledBack: true,
        checkpoint: {
            id: checkpoint.id,
            sessionId: checkpoint.sessionId,
            runId: checkpoint.runId,
            topLevelTab: checkpoint.topLevelTab,
            modeKey: checkpoint.modeKey,
        },
    };
}
