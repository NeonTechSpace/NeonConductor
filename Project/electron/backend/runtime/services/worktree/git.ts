import { err, ok, type Result } from 'neverthrow';
import { spawn } from 'node:child_process';
import { mkdir, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { getPersistence } from '@/app/backend/persistence/db';

interface GitFailure {
    reason: 'git_unavailable' | 'workspace_not_git' | 'command_failed';
    detail: string;
}

function okResult<T, E>(value: T): Result<T, E> {
    return ok(value);
}

function errResult<T, E>(error: E): Result<T, E> {
    return err(error);
}

async function runGit(input: {
    cwd: string;
    args: string[];
}): Promise<Result<{ stdout: string; stderr: string }, GitFailure>> {
    return new Promise((resolve) => {
        const child = spawn('git', input.args, {
            cwd: input.cwd,
            windowsHide: true,
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk: Buffer | string) => {
            stdout += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        });
        child.stderr.on('data', (chunk: Buffer | string) => {
            stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        });

        child.on('error', (error) => {
            resolve(
                errResult({
                    reason: error.message.includes('ENOENT') ? 'git_unavailable' : 'command_failed',
                    detail: error.message,
                })
            );
        });

        child.on('close', (code) => {
            if (code === 0) {
                resolve(okResult({ stdout, stderr }));
                return;
            }

            const detail = stderr.trim().length > 0 ? stderr.trim() : stdout.trim();
            resolve(
                errResult({
                    reason: detail.includes('not a git repository') ? 'workspace_not_git' : 'command_failed',
                    detail: detail.length > 0 ? detail : `git exited with code ${String(code)}.`,
                })
            );
        });
    });
}

export async function resolveGitWorkspaceInfo(input: {
    workspaceRootPath: string;
}): Promise<Result<{ gitRootPath: string; currentBranch: string }, GitFailure>> {
    const gitRoot = await runGit({
        cwd: input.workspaceRootPath,
        args: ['rev-parse', '--show-toplevel'],
    });
    if (gitRoot.isErr()) {
        return err(gitRoot.error);
    }

    const branch = await runGit({
        cwd: input.workspaceRootPath,
        args: ['rev-parse', '--abbrev-ref', 'HEAD'],
    });
    if (branch.isErr()) {
        return err(branch.error);
    }

    return ok({
        gitRootPath: gitRoot.value.stdout.trim(),
        currentBranch: branch.value.stdout.trim(),
    });
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

export function toManagedWorktreeRoot(): string {
    const { dbPath } = getPersistence();
    const runtimeRoot =
        dbPath === ':memory:'
            ? path.join(os.tmpdir(), 'neonconductor', 'runtime', 'memory')
            : path.dirname(dbPath);
    return path.join(runtimeRoot, 'worktrees');
}

export function buildManagedWorktreePath(input: {
    workspaceLabel: string;
    branch: string;
    worktreeId?: string;
}): string {
    const baseFolder = sanitizePathSegment(input.workspaceLabel) || 'workspace';
    const branchFolder = sanitizePathSegment(input.branch) || sanitizePathSegment(input.worktreeId ?? 'worktree');
    return path.join(toManagedWorktreeRoot(), baseFolder, branchFolder);
}

export async function createManagedGitWorktree(input: {
    workspaceRootPath: string;
    targetPath: string;
    branch: string;
    baseBranch: string;
}): Promise<Result<void, GitFailure>> {
    await mkdir(path.dirname(input.targetPath), { recursive: true });

    const add = await runGit({
        cwd: input.workspaceRootPath,
        args: ['worktree', 'add', '-b', input.branch, input.targetPath, input.baseBranch],
    });
    if (add.isErr()) {
        return err(add.error);
    }

    return ok(undefined);
}

export async function removeManagedGitWorktree(input: {
    workspaceRootPath: string;
    worktreePath: string;
    removeFiles: boolean;
}): Promise<Result<void, GitFailure>> {
    const remove = await runGit({
        cwd: input.workspaceRootPath,
        args: ['worktree', 'remove', '--force', input.worktreePath],
    });
    if (remove.isErr()) {
        return err(remove.error);
    }

    if (input.removeFiles) {
        await rm(input.worktreePath, { recursive: true, force: true });
    }

    return ok(undefined);
}

export async function detectWorktreeStatus(worktreePath: string): Promise<'ready' | 'missing' | 'broken'> {
    try {
        const stats = await stat(worktreePath);
        if (!stats.isDirectory()) {
            return 'missing';
        }
    } catch {
        return 'missing';
    }

    const gitRoot = await runGit({
        cwd: worktreePath,
        args: ['rev-parse', '--show-toplevel'],
    });
    return gitRoot.isErr() ? 'broken' : 'ready';
}
