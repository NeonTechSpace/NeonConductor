import { err, ok, type Result } from 'neverthrow';
import { lstat, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';

import type { ToolExecutionFailure } from '@/app/backend/runtime/services/toolExecution/types';

export interface ResolvedWorkspacePath {
    absolutePath: string;
    workspaceRootPath: string;
}

export interface ResolvedExecutionRootPath {
    absolutePath: string;
    executionRootPath: string;
}

export interface CanonicalToolPath {
    requestedPath: string;
    absolutePath: string;
    executionRootPath: string;
}

export interface FileToolExecutionRootAuthority {
    kind: 'workspace' | 'sandbox';
    label: string;
    absolutePath: string;
}

const IGNORED_SEGMENTS = new Set(['.git', '.jj', 'node_modules']);

function normalizePathForKey(targetPath: string): string {
    return process.platform === 'win32' ? targetPath.toLowerCase() : targetPath;
}

function isPathInsideRoot(absolutePath: string, rootPath: string): boolean {
    const relative = path.relative(rootPath, absolutePath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function hasIgnoredSegment(absolutePath: string, rootPath: string): boolean {
    const relative = path.relative(rootPath, absolutePath);
    if (relative === '') {
        return false;
    }

    const segments = relative.split(path.sep).filter((segment) => segment.length > 0);
    return segments.some((segment) => IGNORED_SEGMENTS.has(segment));
}

function resolveRequestedPath(input: { executionRootPath: string; targetPath?: string }): string {
    const targetPath = input.targetPath?.trim();
    if (!targetPath) {
        return path.resolve(input.executionRootPath);
    }

    return path.isAbsolute(targetPath) ? path.normalize(targetPath) : path.resolve(input.executionRootPath, targetPath);
}

async function realpathIfExists(targetPath: string): Promise<string | null> {
    try {
        return await realpath(targetPath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }

        throw error;
    }
}

async function nearestExistingAncestor(targetPath: string): Promise<string | null> {
    let current = path.resolve(targetPath);
    for (;;) {
        const existing = await realpathIfExists(current);
        if (existing) {
            return existing;
        }

        const parent = path.dirname(current);
        if (parent === current) {
            return null;
        }
        current = parent;
    }
}

function confinementFailure(message: string): ToolExecutionFailure {
    return {
        code: 'execution_failed',
        message,
    };
}

function invalidPathFailure(message: string): ToolExecutionFailure {
    return {
        code: 'invalid_args',
        message,
    };
}

function validateInsideCanonicalRoot(input: {
    requestedAbsolutePath: string;
    canonicalAbsolutePath: string;
    canonicalExecutionRootPath: string;
}): Result<void, ToolExecutionFailure> {
    const rootKey = normalizePathForKey(input.canonicalExecutionRootPath);
    const requestedKey = normalizePathForKey(input.requestedAbsolutePath);
    const canonicalKey = normalizePathForKey(input.canonicalAbsolutePath);

    if (!isPathInsideRoot(requestedKey, rootKey) || !isPathInsideRoot(canonicalKey, rootKey)) {
        return err(confinementFailure('File tool target escapes the resolved execution root.'));
    }

    if (hasIgnoredSegment(requestedKey, rootKey) || hasIgnoredSegment(canonicalKey, rootKey)) {
        return err(confinementFailure('File tool target is inside an ignored workspace path.'));
    }

    return ok(undefined);
}

export function resolveWorkspaceToolPath(input: {
    workspaceRootPath: string;
    targetPath?: string;
}): ResolvedWorkspacePath {
    const workspaceRootPath = path.resolve(input.workspaceRootPath);
    const targetPath = input.targetPath?.trim();

    if (!targetPath) {
        return {
            absolutePath: workspaceRootPath,
            workspaceRootPath,
        };
    }

    const absolutePath = path.isAbsolute(targetPath)
        ? path.normalize(targetPath)
        : path.resolve(workspaceRootPath, targetPath);

    return {
        absolutePath,
        workspaceRootPath,
    };
}

export function resolveExecutionRootToolPath(input: {
    executionRootPath: string;
    targetPath?: string;
}): ResolvedExecutionRootPath {
    const executionRootPath = path.resolve(input.executionRootPath);
    const targetPath = input.targetPath?.trim();

    if (!targetPath) {
        return {
            absolutePath: executionRootPath,
            executionRootPath,
        };
    }

    const absolutePath = path.isAbsolute(targetPath)
        ? path.normalize(targetPath)
        : path.resolve(executionRootPath, targetPath);

    return {
        absolutePath,
        executionRootPath,
    };
}

export function isPathInsideWorkspace(absolutePath: string, workspaceRootPath: string): boolean {
    const relative = path.relative(workspaceRootPath, absolutePath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export function isIgnoredWorkspacePath(absolutePath: string, workspaceRootPath: string): boolean {
    const relative = path.relative(workspaceRootPath, absolutePath);
    if (relative === '') {
        return false;
    }

    const segments = relative.split(path.sep).filter((segment) => segment.length > 0);
    return segments.some((segment) => IGNORED_SEGMENTS.has(segment));
}

export async function resolveCanonicalReadToolPath(input: {
    executionRoot: FileToolExecutionRootAuthority;
    targetPath?: string;
}): Promise<Result<CanonicalToolPath, ToolExecutionFailure>> {
    const requestedPath = resolveRequestedPath({
        executionRootPath: input.executionRoot.absolutePath,
        ...(input.targetPath ? { targetPath: input.targetPath } : {}),
    });

    try {
        const canonicalExecutionRootPath = await realpath(input.executionRoot.absolutePath);
        const canonicalTargetPath = await realpath(requestedPath);
        const validation = validateInsideCanonicalRoot({
            requestedAbsolutePath: requestedPath,
            canonicalAbsolutePath: canonicalTargetPath,
            canonicalExecutionRootPath,
        });
        if (validation.isErr()) {
            return err(validation.error);
        }

        return ok({
            requestedPath,
            absolutePath: canonicalTargetPath,
            executionRootPath: canonicalExecutionRootPath,
        });
    } catch (error) {
        return err(confinementFailure(error instanceof Error ? error.message : String(error)));
    }
}

export async function resolveCanonicalWriteToolPath(input: {
    executionRoot: FileToolExecutionRootAuthority;
    targetPath: string;
}): Promise<Result<CanonicalToolPath & { createdParentDirectories: boolean }, ToolExecutionFailure>> {
    const requestedPath = resolveRequestedPath({
        executionRootPath: input.executionRoot.absolutePath,
        targetPath: input.targetPath,
    });

    try {
        const canonicalExecutionRootPath = await realpath(input.executionRoot.absolutePath);
        const targetBeforeWrite = await realpathIfExists(requestedPath);
        if (targetBeforeWrite) {
            const targetValidation = validateInsideCanonicalRoot({
                requestedAbsolutePath: requestedPath,
                canonicalAbsolutePath: targetBeforeWrite,
                canonicalExecutionRootPath,
            });
            if (targetValidation.isErr()) {
                return err(targetValidation.error);
            }
        }

        const requestedParent = path.dirname(requestedPath);
        const parentIsOutsideBecauseTargetIsRoot =
            targetBeforeWrite !== null &&
            normalizePathForKey(targetBeforeWrite) === normalizePathForKey(canonicalExecutionRootPath);
        if (!parentIsOutsideBecauseTargetIsRoot) {
            const parentBeforeCreate = await nearestExistingAncestor(requestedParent);
            if (!parentBeforeCreate) {
                return err(invalidPathFailure('File tool target has no existing filesystem ancestor.'));
            }

            const parentValidation = validateInsideCanonicalRoot({
                requestedAbsolutePath: requestedParent,
                canonicalAbsolutePath: parentBeforeCreate,
                canonicalExecutionRootPath,
            });
            if (parentValidation.isErr()) {
                return err(parentValidation.error);
            }
        }

        const parentExisted = parentIsOutsideBecauseTargetIsRoot
            ? true
            : (await realpathIfExists(requestedParent)) !== null;
        if (!parentIsOutsideBecauseTargetIsRoot) {
            await mkdir(requestedParent, { recursive: true });
            const canonicalParentAfterCreate = await realpath(requestedParent);
            const createdParentValidation = validateInsideCanonicalRoot({
                requestedAbsolutePath: requestedParent,
                canonicalAbsolutePath: canonicalParentAfterCreate,
                canonicalExecutionRootPath,
            });
            if (createdParentValidation.isErr()) {
                return err(createdParentValidation.error);
            }
        }

        const targetStat = await lstat(requestedPath).catch((error: unknown) => {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return null;
            }
            throw error;
        });
        if (targetStat?.isSymbolicLink()) {
            return err(confinementFailure('write_file cannot write through a symbolic link.'));
        }

        return ok({
            requestedPath,
            absolutePath: requestedPath,
            executionRootPath: canonicalExecutionRootPath,
            createdParentDirectories: !parentExisted,
        });
    } catch (error) {
        return err(confinementFailure(error instanceof Error ? error.message : String(error)));
    }
}
