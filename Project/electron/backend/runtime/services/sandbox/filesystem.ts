import { constants } from 'node:fs';
import { access, cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { getPersistenceStoragePaths } from '@/app/backend/persistence/db';

interface SandboxFilesystemFailure {
    reason: 'workspace_missing' | 'create_failed' | 'remove_failed' | 'unsafe_path';
    detail: string;
}

interface SandboxMaterializationResult {
    strategy: 'clone' | 'copy';
}

function sanitizePathSegment(value: string): string {
    return value
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
}

function buildSandboxFolderName(input: { sandboxKey?: string; sandboxId?: string }): string {
    const preferredKey = input.sandboxKey?.trim();
    if (preferredKey) {
        return sanitizePathSegment(preferredKey) || 'sandbox';
    }

    return sanitizePathSegment(input.sandboxId ?? 'sandbox') || 'sandbox';
}

export function toManagedSandboxRoot(): string {
    return getPersistenceStoragePaths().managedSandboxesRoot;
}

export function buildManagedSandboxPath(input: {
    workspaceLabel: string;
    sandboxKey?: string;
    sandboxId?: string;
}): string {
    const workspaceFolder = sanitizePathSegment(input.workspaceLabel) || 'workspace';
    const sandboxFolder = buildSandboxFolderName({
        ...(input.sandboxKey ? { sandboxKey: input.sandboxKey } : {}),
        ...(input.sandboxId ? { sandboxId: input.sandboxId } : {}),
    });

    return path.join(toManagedSandboxRoot(), workspaceFolder, sandboxFolder);
}

function isPathInsideRoot(input: { targetPath: string; rootPath: string }): boolean {
    const resolvedTargetPath = path.resolve(input.targetPath);
    const resolvedRootPath = path.resolve(input.rootPath);
    const relativePath = path.relative(resolvedRootPath, resolvedTargetPath);

    return relativePath.length > 0 && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

async function copyWorkspaceDirectory(input: {
    workspaceRootPath: string;
    targetPath: string;
    mode?: number;
}): Promise<void> {
    await cp(input.workspaceRootPath, input.targetPath, {
        recursive: true,
        errorOnExist: true,
        force: false,
        ...(input.mode !== undefined ? { mode: input.mode } : {}),
    });
}

export async function createManagedSandbox(input: {
    workspaceRootPath: string;
    targetPath: string;
}): Promise<{ ok: true; value: SandboxMaterializationResult } | { ok: false; error: SandboxFilesystemFailure }> {
    try {
        const workspaceStats = await stat(input.workspaceRootPath);
        if (!workspaceStats.isDirectory()) {
            return {
                ok: false,
                error: {
                    reason: 'workspace_missing',
                    detail: `Workspace root is not a directory: ${input.workspaceRootPath}`,
                },
            };
        }
    } catch (error) {
        return {
            ok: false,
            error: {
                reason: 'workspace_missing',
                detail: error instanceof Error ? error.message : String(error),
            },
        };
    }

    try {
        await stat(input.targetPath);
        return {
            ok: false,
            error: {
                reason: 'create_failed',
                detail: `Sandbox path already exists: ${input.targetPath}`,
            },
        };
    } catch (error) {
        if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT')) {
            return {
                ok: false,
                error: {
                    reason: 'create_failed',
                    detail: error instanceof Error ? error.message : String(error),
                },
            };
        }
    }

    await mkdir(path.dirname(input.targetPath), { recursive: true });

    try {
        await copyWorkspaceDirectory({
            workspaceRootPath: input.workspaceRootPath,
            targetPath: input.targetPath,
            mode: constants.COPYFILE_FICLONE,
        });
        return {
            ok: true,
            value: {
                strategy: 'clone',
            },
        };
    } catch {
        await rm(input.targetPath, { recursive: true, force: true });
    }

    try {
        await copyWorkspaceDirectory({
            workspaceRootPath: input.workspaceRootPath,
            targetPath: input.targetPath,
        });
        return {
            ok: true,
            value: {
                strategy: 'copy',
            },
        };
    } catch (error) {
        await rm(input.targetPath, { recursive: true, force: true });
        return {
            ok: false,
            error: {
                reason: 'create_failed',
                detail: error instanceof Error ? error.message : String(error),
            },
        };
    }
}

export async function removeManagedSandbox(input: {
    sandboxPath: string;
    removeFiles: boolean;
}): Promise<{ ok: true } | { ok: false; error: SandboxFilesystemFailure }> {
    if (!input.removeFiles) {
        return { ok: true };
    }

    const managedSandboxRoot = toManagedSandboxRoot();
    if (
        !isPathInsideRoot({
            targetPath: input.sandboxPath,
            rootPath: managedSandboxRoot,
        })
    ) {
        return {
            ok: false,
            error: {
                reason: 'unsafe_path',
                detail: `Refused to remove sandbox outside the active managed sandbox root: ${input.sandboxPath}`,
            },
        };
    }

    try {
        await rm(input.sandboxPath, { recursive: true, force: true });
        return { ok: true };
    } catch (error) {
        return {
            ok: false,
            error: {
                reason: 'remove_failed',
                detail: error instanceof Error ? error.message : String(error),
            },
        };
    }
}

export async function detectSandboxStatus(sandboxPath: string): Promise<'ready' | 'missing' | 'broken'> {
    try {
        const sandboxStats = await stat(sandboxPath);
        if (!sandboxStats.isDirectory()) {
            return 'missing';
        }

        await access(sandboxPath);
        return 'ready';
    } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
            return 'missing';
        }

        return 'broken';
    }
}
