import { access, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { getDefaultProfileId, getPersistence, getPersistenceStoragePaths, reseedRuntimeData } from '@/app/backend/persistence/db';
import type {
    RuntimeFactoryResetCleanupCounts,
    RuntimeFactoryResetInput,
    RuntimeFactoryResetResult,
} from '@/app/backend/runtime/contracts';
import {
    errOp,
    okOp,
    toOperationalError,
    type OperationalResult,
} from '@/app/backend/runtime/services/common/operationalError';
import { planFullReset } from '@/app/backend/runtime/services/runtimeReset/full';
import { removeManagedSandbox } from '@/app/backend/runtime/services/sandbox/filesystem';
import { appLog, flushAppLogger } from '@/app/main/logging';

interface FactoryResetSandboxTarget {
    sandboxPath: string;
}

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
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: string }).code === 'ENOENT'
    );
}

async function removeDirectoryTree(rootPath: string): Promise<number> {
    const entryCount = await countRecursiveEntries(rootPath);
    await rm(rootPath, { recursive: true, force: true });
    return entryCount;
}

async function collectManagedSandboxTargets(): Promise<FactoryResetSandboxTarget[]> {
    const { db } = getPersistence();
    const rows = await db
        .selectFrom('sandboxes as sandbox')
        .leftJoin('workspace_roots as workspaceRoot', (join) =>
            join
                .onRef('workspaceRoot.profile_id', '=', 'sandbox.profile_id')
                .onRef('workspaceRoot.fingerprint', '=', 'sandbox.workspace_fingerprint')
        )
        .select([
            'sandbox.absolute_path as sandboxPath',
        ])
        .execute();

    return rows.map((row) => ({
        sandboxPath: row.sandboxPath,
    }));
}

async function cleanupManagedSandboxes(rootPath: string): Promise<number> {
    const targets = await collectManagedSandboxTargets();
    const entryCount = await countRecursiveEntries(rootPath);

    for (const target of targets) {
        try {
            await access(target.sandboxPath);
        } catch (error) {
            if (isMissingPathError(error)) {
                continue;
            }

            throw error;
        }

        {
            const removed = await removeManagedSandbox({
                sandboxPath: target.sandboxPath,
                removeFiles: true,
            });
            if (removed.ok) {
                continue;
            }
        }

        await rm(target.sandboxPath, { recursive: true, force: true });
    }

    await rm(rootPath, { recursive: true, force: true });
    return entryCount;
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
            const { globalAssetsRoot, logsRoot, managedSandboxesRoot } = getPersistenceStoragePaths();
            const plan = await planFullReset(db);

            const cleanupCounts: RuntimeFactoryResetCleanupCounts = {
                providerSecrets: plan.counts.providerSecrets,
                managedSandboxEntries: await cleanupManagedSandboxes(managedSandboxesRoot),
                globalAssetEntries: await removeDirectoryTree(globalAssetsRoot),
                logEntries: 0,
            };

            await plan.apply(db);
            if (plan.reseedRuntimeData) {
                reseedRuntimeData();
            }

            await flushAppLogger();
            cleanupCounts.logEntries = await removeDirectoryTree(logsRoot);
            logsRemoved = true;

            return okOp({
                applied: true,
                counts: plan.counts,
                cleanupCounts,
                resetProfileId: getDefaultProfileId(),
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
