import { createHash } from 'node:crypto';

import type { CheckpointSnapshotEntryRecord } from '@/app/backend/persistence/stores/runtime/checkpointSnapshotStore';
import type { CheckpointChangesetEntryRecord, CheckpointChangesetRecord } from '@/app/backend/persistence/types';

interface SnapshotFileRecord {
    relativePath: string;
    bytes: Uint8Array;
    byteSize: number;
    blobSha256: string;
}

export interface DerivedChangeset {
    entries: CheckpointChangesetRecord['entries'];
    summary: string;
}

export interface RevertApplicabilityResult {
    canRevertSafely: boolean;
    reason?: 'changeset_missing' | 'changeset_empty' | 'workspace_unresolved' | 'snapshot_invalid' | 'target_drifted';
    restoredFiles?: Array<{ relativePath: string; bytes: Uint8Array }>;
}

function hashBytes(bytes: Uint8Array): string {
    return createHash('sha256').update(bytes).digest('hex');
}

function compareBytes(left: Uint8Array, right: Uint8Array): boolean {
    return Buffer.compare(Buffer.from(left), Buffer.from(right)) === 0;
}

function summarizeChangeCount(changeCount: number): string {
    if (changeCount === 0) {
        return 'No file changes';
    }

    return `${String(changeCount)} changed ${changeCount === 1 ? 'file' : 'files'}`;
}

export function buildSnapshotIndexFromCapture(
    files: Array<{ relativePath: string; bytes: Uint8Array }>
): Map<string, SnapshotFileRecord> {
    const index = new Map<string, SnapshotFileRecord>();
    for (const file of files) {
        index.set(file.relativePath, {
            relativePath: file.relativePath,
            bytes: file.bytes,
            byteSize: file.bytes.byteLength,
            blobSha256: hashBytes(file.bytes),
        });
    }

    return index;
}

export function buildSnapshotIndexFromEntries(
    entries: CheckpointSnapshotEntryRecord[]
): Map<string, SnapshotFileRecord> {
    const index = new Map<string, SnapshotFileRecord>();
    for (const entry of entries) {
        index.set(entry.relativePath, {
            relativePath: entry.relativePath,
            bytes: entry.bytes,
            byteSize: entry.byteSize,
            blobSha256: entry.blobSha256,
        });
    }

    return index;
}

export function deriveChangesetFromSnapshots(input: {
    beforeFiles: Map<string, SnapshotFileRecord>;
    afterFiles: Map<string, SnapshotFileRecord>;
}): DerivedChangeset {
    const allPaths = [...new Set([...input.beforeFiles.keys(), ...input.afterFiles.keys()])].sort((left, right) =>
        left.localeCompare(right)
    );
    const entries: CheckpointChangesetEntryRecord[] = [];

    for (const relativePath of allPaths) {
        const beforeFile = input.beforeFiles.get(relativePath);
        const afterFile = input.afterFiles.get(relativePath);

        if (!beforeFile && afterFile) {
            entries.push({
                relativePath,
                changeKind: 'added',
                afterBlobSha256: afterFile.blobSha256,
                afterByteSize: afterFile.byteSize,
                afterBytes: afterFile.bytes,
            });
            continue;
        }

        if (beforeFile && !afterFile) {
            entries.push({
                relativePath,
                changeKind: 'deleted',
                beforeBlobSha256: beforeFile.blobSha256,
                beforeByteSize: beforeFile.byteSize,
                beforeBytes: beforeFile.bytes,
            });
            continue;
        }

        if (!beforeFile || !afterFile) {
            continue;
        }

        if (beforeFile.blobSha256 === afterFile.blobSha256 && compareBytes(beforeFile.bytes, afterFile.bytes)) {
            continue;
        }

        entries.push({
            relativePath,
            changeKind: 'modified',
            beforeBlobSha256: beforeFile.blobSha256,
            beforeByteSize: beforeFile.byteSize,
            beforeBytes: beforeFile.bytes,
            afterBlobSha256: afterFile.blobSha256,
            afterByteSize: afterFile.byteSize,
            afterBytes: afterFile.bytes,
        });
    }

    return {
        entries,
        summary: summarizeChangeCount(entries.length),
    };
}

export function evaluateRevertApplicability(
    changeset: CheckpointChangesetRecord | null,
    currentFiles: Map<string, SnapshotFileRecord>
): RevertApplicabilityResult {
    if (!changeset) {
        return {
            canRevertSafely: false,
            reason: 'changeset_missing',
        };
    }

    if (changeset.entries.length === 0) {
        return {
            canRevertSafely: false,
            reason: 'changeset_empty',
        };
    }

    const restoredFiles = new Map(currentFiles);

    for (const entry of changeset.entries) {
        const currentFile = currentFiles.get(entry.relativePath);

        if (entry.changeKind === 'added') {
            if (!currentFile || !entry.afterBytes || !compareBytes(currentFile.bytes, entry.afterBytes)) {
                return {
                    canRevertSafely: false,
                    reason: 'target_drifted',
                };
            }

            restoredFiles.delete(entry.relativePath);
            continue;
        }

        if (entry.changeKind === 'deleted') {
            if (currentFile || !entry.beforeBytes) {
                return {
                    canRevertSafely: false,
                    reason: 'target_drifted',
                };
            }

            restoredFiles.set(entry.relativePath, {
                relativePath: entry.relativePath,
                bytes: entry.beforeBytes,
                byteSize: entry.beforeByteSize ?? entry.beforeBytes.byteLength,
                blobSha256: entry.beforeBlobSha256 ?? hashBytes(entry.beforeBytes),
            });
            continue;
        }

        if (
            !currentFile ||
            !entry.afterBytes ||
            !entry.beforeBytes ||
            !compareBytes(currentFile.bytes, entry.afterBytes)
        ) {
            return {
                canRevertSafely: false,
                reason: 'target_drifted',
            };
        }

        restoredFiles.set(entry.relativePath, {
            relativePath: entry.relativePath,
            bytes: entry.beforeBytes,
            byteSize: entry.beforeByteSize ?? entry.beforeBytes.byteLength,
            blobSha256: entry.beforeBlobSha256 ?? hashBytes(entry.beforeBytes),
        });
    }

    return {
        canRevertSafely: true,
        restoredFiles: [...restoredFiles.values()]
            .sort((left, right) => left.relativePath.localeCompare(right.relativePath))
            .map((file) => ({
                relativePath: file.relativePath,
                bytes: file.bytes,
            })),
    };
}
