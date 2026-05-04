import { access, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import {
    closePersistence,
    getDefaultProfileId,
    getPersistence,
    getPersistenceStoragePaths,
    initializePersistence,
    reseedRuntimeData,
} from '@/app/backend/persistence/db';
import type {
    RuntimeFactoryResetCleanupCounts,
    RuntimeFactoryResetInput,
    RuntimeFactoryResetResult,
    RuntimeStorageInfo,
} from '@/app/backend/runtime/contracts';
import {
    errOp,
    okOp,
    toOperationalError,
    type OperationalResult,
} from '@/app/backend/runtime/services/common/operationalError';
import { planFullReset } from '@/app/backend/runtime/services/runtimeReset/full';
import { appLog, flushAppLogger } from '@/app/main/logging';

type RuntimeNamespace = RuntimeStorageInfo['runtimeNamespace'];

export interface RuntimeFactoryResetService {
    reset(input: RuntimeFactoryResetInput): Promise<OperationalResult<RuntimeFactoryResetResult>>;
}

async function countRecursiveEntries(rootPath: string): Promise<number> {
    try {
        const dirents = await readdir(rootPath, { withFileTypes: true });
        let count = 0;

        for (const dirent of dirents) {
            const absolutePath = path.join(rootPath, dirent.name);
            count += 1;
            if (dirent.isDirectory()) {
                count += await countRecursiveEntries(absolutePath);
            }
        }

        return count;
    } catch (error) {
        if (isMissingPathError(error)) {
            return 0;
        }

        throw error;
    }
}

function isMissingPathError(error: unknown): boolean {
    return (
        typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ENOENT'
    );
}

async function removeDirectoryTree(rootPath: string): Promise<number> {
    const entryCount = await countRecursiveEntries(rootPath);
    await rm(rootPath, { recursive: true, force: true });
    return entryCount;
}

function resolveRuntimeNamespace(): RuntimeNamespace {
    const runtimeNamespace =
        process.env['NEONCONDUCTOR_RUNTIME_NAMESPACE']?.trim() ??
        process.env['NEONCONDUCTOR_PERSISTENCE_CHANNEL']?.trim();

    if (
        runtimeNamespace === 'development' ||
        runtimeNamespace === 'alpha' ||
        runtimeNamespace === 'beta' ||
        runtimeNamespace === 'stable'
    ) {
        return runtimeNamespace;
    }

    throw new Error('Factory reset requires a resolved runtime storage namespace.');
}

export function getRuntimeStorageInfo(): RuntimeStorageInfo {
    const runtimeNamespace = resolveRuntimeNamespace();
    const { dbPath, runtimeRoot, userDataRoot } = getPersistenceStoragePaths();
    assertDatabasePathUnderRuntimeRoot({ dbPath, runtimeRoot });

    return {
        runtimeNamespace,
        dbPath,
        runtimeRoot,
        userDataRoot,
    };
}

function assertDatabasePathUnderRuntimeRoot(input: { dbPath: string; runtimeRoot: string }): void {
    const resolvedDbPath = path.resolve(input.dbPath);
    const resolvedRuntimeRoot = path.resolve(input.runtimeRoot);
    const relativePath = path.relative(resolvedRuntimeRoot, resolvedDbPath);

    if (
        resolvedDbPath === ':memory:' ||
        relativePath.length === 0 ||
        relativePath.startsWith('..') ||
        path.isAbsolute(relativePath)
    ) {
        throw new Error('Factory reset refused to delete a database outside the active runtime root.');
    }

    const dbExtension = path.extname(resolvedDbPath).toLowerCase();
    if (dbExtension !== '.db' && dbExtension !== '.sqlite') {
        throw new Error('Factory reset refused to delete a database without an expected SQLite extension.');
    }
}

async function removeDatabaseFiles(dbPath: string): Promise<number> {
    const databasePaths = [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, `${dbPath}-journal`];
    let removedCount = 0;

    for (const databasePath of databasePaths) {
        try {
            await access(databasePath);
        } catch (error) {
            if (isMissingPathError(error)) {
                continue;
            }

            throw error;
        }

        await rm(databasePath, { force: true });
        removedCount += 1;
    }

    return removedCount;
}

async function cleanupManagedSandboxes(rootPath: string): Promise<number> {
    return removeDirectoryTree(rootPath);
}

class RuntimeFactoryResetServiceImpl implements RuntimeFactoryResetService {
    async reset(input: RuntimeFactoryResetInput): Promise<OperationalResult<RuntimeFactoryResetResult>> {
        const startedAt = Date.now();
        let logsRemoved = false;

        appLog.warn({
            tag: 'runtime.factory_reset',
            message: 'Factory reset requested.',
            confirm: input.confirm,
        });

        try {
            const { db } = getPersistence();
            const { dbPath, globalAssetsRoot, logsRoot, managedSandboxesRoot, runtimeRoot } =
                getPersistenceStoragePaths();
            assertDatabasePathUnderRuntimeRoot({ dbPath, runtimeRoot });
            const storage = getRuntimeStorageInfo();
            const plan = await planFullReset(db);

            const cleanupCounts: RuntimeFactoryResetCleanupCounts = {
                providerSecrets: plan.counts.providerSecrets,
                managedSandboxEntries: await cleanupManagedSandboxes(managedSandboxesRoot),
                globalAssetEntries: await removeDirectoryTree(globalAssetsRoot),
                logEntries: 0,
                databaseFiles: 0,
            };

            await flushAppLogger();
            cleanupCounts.logEntries = await removeDirectoryTree(logsRoot);
            logsRemoved = true;
            closePersistence();
            cleanupCounts.databaseFiles = await removeDatabaseFiles(dbPath);
            initializePersistence({
                dbPath,
                forceReinitialize: true,
            });
            if (plan.reseedRuntimeData) {
                reseedRuntimeData();
            }

            return okOp({
                applied: true,
                counts: plan.counts,
                cleanupCounts,
                resetProfileId: getDefaultProfileId(),
                storage,
            });
        } catch (error) {
            const operationalError = toOperationalError(error, 'request_failed', 'Factory reset failed.');
            if (!logsRemoved) {
                appLog.error({
                    tag: 'runtime.factory_reset',
                    message: 'Factory reset failed.',
                    durationMs: Date.now() - startedAt,
                    error: operationalError.message,
                    code: operationalError.code,
                });
            }

            return errOp(operationalError.code, operationalError.message, {
                ...(operationalError.details ? { details: operationalError.details } : {}),
                ...(operationalError.retryable !== undefined ? { retryable: operationalError.retryable } : {}),
            });
        }
    }
}

export const runtimeFactoryResetService: RuntimeFactoryResetService = new RuntimeFactoryResetServiceImpl();
