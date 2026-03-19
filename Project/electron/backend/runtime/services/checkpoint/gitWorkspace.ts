import { err, ok, type Result } from 'neverthrow';
import { spawn } from 'node:child_process';

import type { DiffArtifact, DiffFileArtifact, GitDiffArtifact } from '@/app/backend/persistence/types';
import { appLog } from '@/app/main/logging';

interface GitCommandFailure {
    kind: 'git_unavailable' | 'workspace_not_git' | 'command_failed';
    detail: string;
}

function okResult<T, E>(value: T): Result<T, E> {
    return ok(value);
}

function errResult<T, E>(error: E): Result<T, E> {
    return err(error);
}

function mapStatusCode(statusCode: string): DiffFileArtifact['status'] {
    if (statusCode.startsWith('A')) {
        return 'added';
    }
    if (statusCode.startsWith('D')) {
        return 'deleted';
    }
    if (statusCode.startsWith('R')) {
        return 'renamed';
    }
    if (statusCode.startsWith('C')) {
        return 'copied';
    }
    if (statusCode.startsWith('T')) {
        return 'type_changed';
    }

    return 'modified';
}

function stripQuotedPath(value: string): string {
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
        return value.slice(1, -1);
    }

    return value;
}

function normalizeRelativePath(value: string): string {
    return stripQuotedPath(value).replace(/\\/g, '/').replace(/^\.\//, '');
}

function parseNameStatus(output: string): DiffFileArtifact[] {
    const parts = output.split('\0').filter((part) => part.length > 0);
    const files: DiffFileArtifact[] = [];

    for (let index = 0; index < parts.length; index += 1) {
        const current = parts[index] ?? '';
        const tabIndex = current.indexOf('\t');
        const statusCode = tabIndex >= 0 ? current.slice(0, tabIndex) : current;
        const primaryPath = tabIndex >= 0 ? current.slice(tabIndex + 1) : parts[index + 1];
        if (!primaryPath) {
            continue;
        }

        if (statusCode.startsWith('R') || statusCode.startsWith('C')) {
            const nextPath = tabIndex >= 0 ? parts[index + 1] : parts[index + 2];
            if (!nextPath) {
                continue;
            }

            files.push({
                path: normalizeRelativePath(nextPath),
                status: mapStatusCode(statusCode),
                previousPath: normalizeRelativePath(primaryPath),
            });
            index += tabIndex >= 0 ? 1 : 2;
            continue;
        }

        files.push({
            path: normalizeRelativePath(primaryPath),
            status: mapStatusCode(statusCode),
        });
        if (tabIndex < 0) {
            index += 1;
        }
    }

    return files;
}

function parsePatchSections(fullPatch: string): Record<string, string> {
    const normalized = fullPatch.replace(/\r\n?/g, '\n');
    const lines = normalized.split('\n');
    const sections = new Map<string, string[]>();
    let currentPath: string | undefined;

    for (const line of lines) {
        const match = line.match(/^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/);
        if (match) {
            const oldPath = normalizeRelativePath(match[1] ?? '');
            const newPath = normalizeRelativePath(match[2] ?? '');
            currentPath = newPath === '/dev/null' ? oldPath : newPath;
            if (!sections.has(currentPath)) {
                sections.set(currentPath, []);
            }
        }

        if (!currentPath) {
            continue;
        }

        sections.get(currentPath)?.push(line);
    }

    return Object.fromEntries(
        [...sections.entries()].map(([path, sectionLines]) => [path, `${sectionLines.join('\n')}\n`])
    );
}

function countPatchLineStats(patch: string): { addedLines: number; deletedLines: number } | undefined {
    const lines = patch.replace(/\r\n?/g, '\n').split('\n');
    let addedLines = 0;
    let deletedLines = 0;
    let inHunk = false;

    for (const line of lines) {
        if (line.startsWith('@@')) {
            inHunk = true;
            continue;
        }

        if (!inHunk) {
            continue;
        }

        if (line.startsWith('+') && !line.startsWith('+++')) {
            addedLines += 1;
            continue;
        }

        if (line.startsWith('-') && !line.startsWith('---')) {
            deletedLines += 1;
        }
    }

    if (addedLines === 0 && deletedLines === 0) {
        return undefined;
    }

    return { addedLines, deletedLines };
}

function applyLineStats(files: DiffFileArtifact[], patchesByPath: Record<string, string>): {
    files: DiffFileArtifact[];
    totalAddedLines: number;
    totalDeletedLines: number;
} {
    let totalAddedLines = 0;
    let totalDeletedLines = 0;

    const filesWithStats = files.map((file) => {
        const patch = patchesByPath[file.path];
        if (!patch) {
            return file;
        }

        const stats = countPatchLineStats(patch);
        if (!stats) {
            return file;
        }

        totalAddedLines += stats.addedLines;
        totalDeletedLines += stats.deletedLines;
        return {
            ...file,
            addedLines: stats.addedLines,
            deletedLines: stats.deletedLines,
        };
    });

    return {
        files: filesWithStats,
        totalAddedLines,
        totalDeletedLines,
    };
}

async function runGitCommand(input: {
    cwd: string;
    args: string[];
    stdin?: string;
}): Promise<Result<{ stdout: string; stderr: string }, GitCommandFailure>> {
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
                    kind: error.message.includes('ENOENT') ? 'git_unavailable' : 'command_failed',
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
            if (detail.includes('not a git repository')) {
                resolve(
                    errResult({
                        kind: 'workspace_not_git',
                        detail,
                    })
                );
                return;
            }

            resolve(
                errResult({
                    kind: 'command_failed',
                    detail: detail.length > 0 ? detail : `git exited with code ${String(code)}.`,
                })
            );
        });

        if (input.stdin) {
            child.stdin.write(input.stdin);
        }
        child.stdin.end();
    });
}

function unsupportedArtifact(input: {
    workspaceRootPath: string;
    workspaceLabel: string;
    reason: Extract<DiffArtifact, { kind: 'unsupported' }>['reason'];
    detail: string;
}): Extract<DiffArtifact, { kind: 'unsupported' }> {
    return {
        kind: 'unsupported',
        workspaceRootPath: input.workspaceRootPath,
        workspaceLabel: input.workspaceLabel,
        reason: input.reason,
        detail: input.detail,
    };
}

export async function captureGitWorkspaceArtifact(input: {
    workspaceRootPath: string;
    workspaceLabel: string;
}): Promise<DiffArtifact> {
    const gitRoot = await runGitCommand({
        cwd: input.workspaceRootPath,
        args: ['rev-parse', '--show-toplevel'],
    });
    if (gitRoot.isErr()) {
        return unsupportedArtifact({
            workspaceRootPath: input.workspaceRootPath,
            workspaceLabel: input.workspaceLabel,
            reason: gitRoot.error.kind === 'git_unavailable' ? 'git_unavailable' : 'workspace_not_git',
            detail: gitRoot.error.detail,
        });
    }

    const trackedStatus = await runGitCommand({
        cwd: input.workspaceRootPath,
        args: ['diff', '--name-status', '-z', '--find-renames', 'HEAD', '--', '.'],
    });
    if (trackedStatus.isErr()) {
        return unsupportedArtifact({
            workspaceRootPath: input.workspaceRootPath,
            workspaceLabel: input.workspaceLabel,
            reason: 'capture_failed',
            detail: trackedStatus.error.detail,
        });
    }

    const trackedPatch = await runGitCommand({
        cwd: input.workspaceRootPath,
        args: ['diff', '--no-ext-diff', '--binary', '--find-renames', '--relative', 'HEAD', '--', '.'],
    });
    if (trackedPatch.isErr()) {
        return unsupportedArtifact({
            workspaceRootPath: input.workspaceRootPath,
            workspaceLabel: input.workspaceLabel,
            reason: 'capture_failed',
            detail: trackedPatch.error.detail,
        });
    }

    const untrackedFilesResult = await runGitCommand({
        cwd: input.workspaceRootPath,
        args: ['ls-files', '--others', '--exclude-standard', '-z', '--', '.'],
    });
    if (untrackedFilesResult.isErr()) {
        return unsupportedArtifact({
            workspaceRootPath: input.workspaceRootPath,
            workspaceLabel: input.workspaceLabel,
            reason: 'capture_failed',
            detail: untrackedFilesResult.error.detail,
        });
    }

    const files = parseNameStatus(trackedStatus.value.stdout);
    const untrackedPaths = untrackedFilesResult.value.stdout
        .split('\0')
        .filter((value) => value.length > 0)
        .map(normalizeRelativePath);
    const untrackedPatches: string[] = [];

    for (const untrackedPath of untrackedPaths) {
        files.push({
            path: untrackedPath,
            status: 'untracked',
        });

        const patchResult = await runGitCommand({
            cwd: input.workspaceRootPath,
            args: ['diff', '--no-index', '--binary', '--relative', '--no-ext-diff', '--', '/dev/null', untrackedPath],
        });
        if (patchResult.isErr()) {
            return unsupportedArtifact({
                workspaceRootPath: input.workspaceRootPath,
                workspaceLabel: input.workspaceLabel,
                reason: 'capture_failed',
                detail: patchResult.error.detail,
            });
        }

        if (patchResult.value.stdout.trim().length > 0) {
            untrackedPatches.push(patchResult.value.stdout);
        }
    }

    const fullPatch = [trackedPatch.value.stdout, ...untrackedPatches].filter((value) => value.length > 0).join('\n');
    const patchesByPath = parsePatchSections(fullPatch);
    const filesWithStats = applyLineStats(files, patchesByPath);
    const artifact: GitDiffArtifact = {
        kind: 'git',
        workspaceRootPath: input.workspaceRootPath,
        workspaceLabel: input.workspaceLabel,
        baseRef: 'HEAD',
        fileCount: files.length,
        totalAddedLines: filesWithStats.totalAddedLines,
        totalDeletedLines: filesWithStats.totalDeletedLines,
        files: filesWithStats.files,
        fullPatch,
        patchesByPath,
    };

    appLog.debug({
        tag: 'checkpoint.git',
        message: 'Captured git workspace artifact.',
        workspaceRootPath: input.workspaceRootPath,
        fileCount: files.length,
        gitRoot: gitRoot.value.stdout.trim(),
    });

    return artifact;
}
