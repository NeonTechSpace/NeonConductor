import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import { isRecord, readLiteral, readNumber, readString } from '@/web/lib/runtime/eventPatches/readers/shared';

import type { CheckpointRecord, DiffRecord } from '@/app/backend/persistence/types';

import { topLevelTabs } from '@/shared/contracts';

export function readCheckpointRecord(value: unknown): CheckpointRecord | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = readString(value['id']);
    const profileId = readString(value['profileId']);
    const sessionId = readString(value['sessionId']);
    const threadId = readString(value['threadId']);
    const runId = value['runId'] === null ? null : readString(value['runId']);
    const diffId = value['diffId'] === null ? null : readString(value['diffId']);
    const workspaceFingerprint = readString(value['workspaceFingerprint']);
    const executionTargetKey = readString(value['executionTargetKey']);
    const executionTargetKind = readLiteral(value['executionTargetKind'], ['workspace', 'sandbox'] as const);
    const executionTargetLabel = readString(value['executionTargetLabel']);
    const createdByKind = readLiteral(value['createdByKind'], ['system', 'user'] as const);
    const checkpointKind = readLiteral(value['checkpointKind'], ['auto', 'safety', 'named'] as const);
    const snapshotFileCount = readNumber(value['snapshotFileCount']);
    const topLevelTab = readLiteral(value['topLevelTab'], topLevelTabs);
    const modeKey = readString(value['modeKey']);
    const summary = readString(value['summary']);
    const createdAt = readString(value['createdAt']);
    const updatedAt = readString(value['updatedAt']);
    const sandboxId = readString(value['sandboxId']);
    const milestoneTitle = readString(value['milestoneTitle']);
    const retentionDisposition = readLiteral(value['retentionDisposition'], [
        'milestone',
        'protected_recent',
        'eligible_for_cleanup',
    ] as const);
    if (
        !id ||
        !isEntityId(id, 'ckpt') ||
        !profileId ||
        !sessionId ||
        !isEntityId(sessionId, 'sess') ||
        !threadId ||
        !isEntityId(threadId, 'thr') ||
        !workspaceFingerprint ||
        !executionTargetKey ||
        !executionTargetKind ||
        !executionTargetLabel ||
        !createdByKind ||
        !checkpointKind ||
        snapshotFileCount === undefined ||
        !topLevelTab ||
        !modeKey ||
        !summary ||
        !createdAt ||
        !updatedAt
    ) {
        return undefined;
    }

    return {
        id,
        profileId,
        sessionId,
        threadId,
        ...(runId && isEntityId(runId, 'run') ? { runId } : {}),
        ...(diffId ? { diffId } : {}),
        workspaceFingerprint,
        ...(sandboxId && isEntityId(sandboxId, 'sb') ? { sandboxId } : {}),
        executionTargetKey,
        executionTargetKind,
        executionTargetLabel,
        createdByKind,
        checkpointKind,
        ...(milestoneTitle ? { milestoneTitle } : {}),
        ...(retentionDisposition ? { retentionDisposition } : {}),
        snapshotFileCount,
        topLevelTab,
        modeKey,
        summary,
        createdAt,
        updatedAt,
    };
}

export function readDiffRecord(value: unknown): DiffRecord | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = readString(value['id']);
    const profileId = readString(value['profileId']);
    const sessionId = readString(value['sessionId']);
    const runId = value['runId'] === null ? null : readString(value['runId']);
    const summary = readString(value['summary']);
    const artifact = readDiffArtifact(value['artifact']);
    const createdAt = readString(value['createdAt']);
    const updatedAt = readString(value['updatedAt']);
    if (!id || !profileId || !sessionId || summary === undefined || !artifact || !createdAt || !updatedAt) {
        return undefined;
    }

    return {
        id,
        profileId,
        sessionId,
        runId: runId ?? null,
        summary,
        artifact,
        createdAt,
        updatedAt,
    };
}

export function readDiffArtifact(value: unknown): DiffRecord['artifact'] | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const kind = readLiteral(value['kind'], ['git', 'unsupported'] as const);
    const workspaceRootPath = readString(value['workspaceRootPath']);
    const workspaceLabel = readString(value['workspaceLabel']);
    if (!kind || !workspaceRootPath || !workspaceLabel) {
        return undefined;
    }

    if (kind === 'git') {
        const baseRef = readLiteral(value['baseRef'], ['HEAD'] as const);
        const fileCount = readNumber(value['fileCount']);
        const fullPatch = readString(value['fullPatch']);
        const filesValue = value['files'];
        const patchesByPathValue = value['patchesByPath'];
        if (
            !baseRef ||
            fileCount === undefined ||
            !fullPatch ||
            !Array.isArray(filesValue) ||
            !isRecord(patchesByPathValue)
        ) {
            return undefined;
        }

        const files = filesValue
            .map((entry) => {
                if (!isRecord(entry)) {
                    return undefined;
                }

                const path = readString(entry['path']);
                const status = readLiteral(entry['status'], [
                    'added',
                    'modified',
                    'deleted',
                    'renamed',
                    'copied',
                    'type_changed',
                    'untracked',
                ] as const);
                const previousPath = readString(entry['previousPath']);
                const addedLines = readNumber(entry['addedLines']);
                const deletedLines = readNumber(entry['deletedLines']);
                if (!path || !status) {
                    return undefined;
                }

                return {
                    path,
                    status,
                    ...(previousPath ? { previousPath } : {}),
                    ...(addedLines !== undefined ? { addedLines } : {}),
                    ...(deletedLines !== undefined ? { deletedLines } : {}),
                };
            })
            .filter(
                (
                    entry
                ): entry is {
                    path: string;
                    status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'type_changed' | 'untracked';
                    previousPath?: string;
                    addedLines?: number;
                    deletedLines?: number;
                } => entry !== undefined
            );
        const patchEntries = Object.entries(patchesByPathValue).filter(
            (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'
        );
        if (files.length !== filesValue.length || patchEntries.length !== Object.keys(patchesByPathValue).length) {
            return undefined;
        }

        const totalAddedLines = readNumber(value['totalAddedLines']);
        const totalDeletedLines = readNumber(value['totalDeletedLines']);
        return {
            kind,
            workspaceRootPath,
            workspaceLabel,
            baseRef,
            fileCount,
            ...(totalAddedLines !== undefined ? { totalAddedLines } : {}),
            ...(totalDeletedLines !== undefined ? { totalDeletedLines } : {}),
            files,
            fullPatch,
            patchesByPath: Object.fromEntries(patchEntries),
        };
    }

    const reason = readLiteral(value['reason'], [
        'workspace_not_git',
        'git_unavailable',
        'workspace_unresolved',
        'capture_failed',
    ] as const);
    const detail = readString(value['detail']);
    if (!reason || !detail) {
        return undefined;
    }

    return {
        kind,
        workspaceRootPath,
        workspaceLabel,
        reason,
        detail,
    };
}

