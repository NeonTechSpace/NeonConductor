import { err, ok, type Result } from 'neverthrow';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';


const excludedDirectoryNames = new Set(['.git', '.jj']);

type SnapshotErrorReason = 'snapshot_invalid' | 'restore_failed';

export interface NativeCheckpointSnapshotFile {
    relativePath: string;
    bytes: Uint8Array;
}

interface NativeCheckpointSnapshot {
    files: NativeCheckpointSnapshotFile[];
    fileCount: number;
}

interface NativeSnapshotFailure {
    reason: SnapshotErrorReason;
    detail: string;
}

function normalizeRelativePath(value: string): string {
    return value.replaceAll('\\', '/');
}

async function collectExecutionTargetFilePaths(input: {
    workspaceRootPath: string;
    currentPath?: string;
}): Promise<Result<string[], NativeSnapshotFailure>> {
    const currentPath = input.currentPath ?? input.workspaceRootPath;
    let directoryEntries;
    try {
        directoryEntries = await readdir(currentPath, {
            withFileTypes: true,
            encoding: 'utf8',
        });
    } catch (error) {
        return err({
            reason: 'restore_failed',
            detail: `Failed to read directory "${currentPath}": ${error instanceof Error ? error.message : String(error)}`,
        });
    }

    const collectedPaths: string[] = [];
    for (const entry of directoryEntries) {
        if (entry.isDirectory()) {
            if (excludedDirectoryNames.has(entry.name)) {
                continue;
            }

            const nestedResult = await collectExecutionTargetFilePaths({
                workspaceRootPath: input.workspaceRootPath,
                currentPath: path.join(currentPath, entry.name),
            });
            if (nestedResult.isErr()) {
                return nestedResult;
            }

            collectedPaths.push(...nestedResult.value);
            continue;
        }

        if (entry.isFile()) {
            collectedPaths.push(path.join(currentPath, entry.name));
            continue;
        }

        return err({
            reason: 'snapshot_invalid',
            detail: `Checkpoint snapshots only support regular files and directories. Unsupported entry "${path.join(currentPath, entry.name)}".`,
        });
    }

    return ok(collectedPaths.sort((left, right) => left.localeCompare(right)));
}

export async function captureExecutionTargetSnapshot(input: {
    workspaceRootPath: string;
}): Promise<Result<NativeCheckpointSnapshot, NativeSnapshotFailure>> {
    const filePathsResult = await collectExecutionTargetFilePaths({
        workspaceRootPath: input.workspaceRootPath,
    });
    if (filePathsResult.isErr()) {
        return err(filePathsResult.error);
    }

    const files: NativeCheckpointSnapshotFile[] = [];
    for (const absolutePath of filePathsResult.value) {
        try {
            const bytes = await readFile(absolutePath);
            files.push({
                relativePath: normalizeRelativePath(path.relative(input.workspaceRootPath, absolutePath)),
                bytes,
            });
        } catch (error) {
            return err({
                reason: 'snapshot_invalid',
                detail: `Failed to read checkpoint file "${absolutePath}": ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    return ok({
        files,
        fileCount: files.length,
    });
}

async function pruneEmptyDirectories(input: {
    workspaceRootPath: string;
    currentPath?: string;
}): Promise<Result<void, NativeSnapshotFailure>> {
    const currentPath = input.currentPath ?? input.workspaceRootPath;
    let directoryEntries;
    try {
        directoryEntries = await readdir(currentPath, {
            withFileTypes: true,
            encoding: 'utf8',
        });
    } catch (error) {
        return err({
            reason: 'restore_failed',
            detail: `Failed to inspect directory "${currentPath}" while pruning: ${error instanceof Error ? error.message : String(error)}`,
        });
    }

    for (const entry of directoryEntries) {
        if (!entry.isDirectory() || excludedDirectoryNames.has(entry.name)) {
            continue;
        }

        const nestedPath = path.join(currentPath, entry.name);
        const nestedResult = await pruneEmptyDirectories({
            workspaceRootPath: input.workspaceRootPath,
            currentPath: nestedPath,
        });
        if (nestedResult.isErr()) {
            return nestedResult;
        }

        const nestedEntries = await readdir(nestedPath, {
            withFileTypes: true,
            encoding: 'utf8',
        });
        if (nestedEntries.length === 0) {
            await rm(nestedPath, {
                recursive: false,
                force: true,
            });
        }
    }

    return ok(undefined);
}

export async function restoreExecutionTargetSnapshot(input: {
    workspaceRootPath: string;
    files: NativeCheckpointSnapshotFile[];
}): Promise<Result<void, NativeSnapshotFailure>> {
    const currentFilePathsResult = await collectExecutionTargetFilePaths({
        workspaceRootPath: input.workspaceRootPath,
    });
    if (currentFilePathsResult.isErr()) {
        return err(currentFilePathsResult.error);
    }

    const expectedPaths = new Set(input.files.map((file) => file.relativePath));
    for (const absolutePath of currentFilePathsResult.value) {
        const relativePath = normalizeRelativePath(path.relative(input.workspaceRootPath, absolutePath));
        if (expectedPaths.has(relativePath)) {
            continue;
        }

        try {
            await rm(absolutePath, {
                force: true,
            });
        } catch (error) {
            return err({
                reason: 'restore_failed',
                detail: `Failed to remove "${absolutePath}" during checkpoint restore: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    for (const file of input.files) {
        const absolutePath = path.join(input.workspaceRootPath, file.relativePath);
        try {
            await mkdir(path.dirname(absolutePath), {
                recursive: true,
            });
            await writeFile(absolutePath, file.bytes);
        } catch (error) {
            return err({
                reason: 'restore_failed',
                detail: `Failed to write "${absolutePath}" during checkpoint restore: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    const pruneResult = await pruneEmptyDirectories({
        workspaceRootPath: input.workspaceRootPath,
    });
    if (pruneResult.isErr()) {
        return pruneResult;
    }

    return ok(undefined);
}
