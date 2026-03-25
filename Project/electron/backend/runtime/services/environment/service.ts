import { access, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

import type {
    WorkspaceDetectedPackageManager,
    WorkspaceDetectedRuntimeFamily,
    WorkspaceDetectedScriptRunner,
    WorkspaceDetectedVcs,
    WorkspaceEnvironmentCommandAvailability,
    WorkspaceEnvironmentCommandAvailabilityEntry,
    WorkspaceEnvironmentDetectedPreferences,
    WorkspaceEnvironmentEffectivePreferences,
    WorkspaceEnvironmentMarkers,
    WorkspaceEnvironmentOverrides,
    WorkspaceEnvironmentSnapshot,
    WorkspacePreferredPackageManager,
    WorkspacePreferredVcs,
} from '@/app/backend/runtime/contracts/types/runtime';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';

const COMMAND_CACHE_TTL_MS = 5_000;
const TRACKED_COMMANDS = ['jj', 'git', 'node', 'python', 'python3', 'pnpm', 'npm', 'yarn', 'bun', 'tsx'] as const;

type TrackedCommand = (typeof TRACKED_COMMANDS)[number];
type SupportedPlatform = WorkspaceEnvironmentSnapshot['platform'];

interface CommandLookupCacheEntry {
    expiresAt: number;
    availability: WorkspaceEnvironmentCommandAvailability;
}

function resolveSupportedPlatform(): SupportedPlatform {
    if (process.platform === 'win32' || process.platform === 'darwin' || process.platform === 'linux') {
        return process.platform;
    }

    return 'linux';
}

function resolveShellFamily(platform: SupportedPlatform): WorkspaceEnvironmentSnapshot['shellFamily'] {
    return platform === 'win32' ? 'powershell' : 'posix_sh';
}

function createUnavailableEntry(): WorkspaceEnvironmentCommandAvailabilityEntry {
    return {
        available: false,
    };
}

function normalizeWorkspacePath(value: string): string {
    return path.resolve(value.trim());
}

function toPathKey(value: string): string {
    return process.platform === 'win32' ? value.toLowerCase() : value;
}

async function pathExists(targetPath: string): Promise<boolean> {
    try {
        await access(targetPath);
        return true;
    } catch {
        return false;
    }
}

async function lookupExecutable(command: TrackedCommand, platform: SupportedPlatform): Promise<WorkspaceEnvironmentCommandAvailabilityEntry> {
    const lookupCommand = platform === 'win32' ? 'where.exe' : 'which';
    const lookupArgs = [command];

    return await new Promise((resolve) => {
        const child = spawn(lookupCommand, lookupArgs, {
            windowsHide: true,
        });

        let stdout = '';

        child.stdout.on('data', (chunk: Buffer | string) => {
            stdout += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        });

        child.on('error', () => {
            resolve(createUnavailableEntry());
        });

        child.on('close', (code) => {
            if (code !== 0) {
                resolve(createUnavailableEntry());
                return;
            }

            const executablePath = stdout
                .split(/\r?\n/)
                .map((line) => line.trim())
                .find((line) => line.length > 0);

            resolve(
                executablePath
                    ? {
                          available: true,
                          executablePath,
                      }
                    : createUnavailableEntry()
            );
        });
    });
}

function isNodeWorkspace(markers: WorkspaceEnvironmentMarkers): boolean {
    return markers.hasPackageJson || markers.hasTsconfigJson;
}

function isPythonWorkspace(markers: WorkspaceEnvironmentMarkers): boolean {
    return markers.hasPyprojectToml || markers.hasRequirementsTxt;
}

function detectVcs(
    markers: WorkspaceEnvironmentMarkers,
    availableCommands: WorkspaceEnvironmentCommandAvailability
): WorkspaceDetectedVcs {
    if (markers.hasJjDirectory && availableCommands.jj.available) {
        return 'jj';
    }

    if (markers.hasGitDirectory && availableCommands.git.available) {
        return 'git';
    }

    return 'unknown';
}

function detectPackageManager(
    markers: WorkspaceEnvironmentMarkers,
    availableCommands: WorkspaceEnvironmentCommandAvailability
): WorkspaceDetectedPackageManager {
    if (markers.hasPnpmLock) {
        return availableCommands.pnpm.available ? 'pnpm' : 'unknown';
    }
    if (markers.hasPackageLock) {
        return availableCommands.npm.available ? 'npm' : 'unknown';
    }
    if (markers.hasYarnLock) {
        return availableCommands.yarn.available ? 'yarn' : 'unknown';
    }
    if (markers.hasBunLock) {
        return availableCommands.bun.available ? 'bun' : 'unknown';
    }

    return 'unknown';
}

function detectRuntime(
    markers: WorkspaceEnvironmentMarkers,
    availableCommands: WorkspaceEnvironmentCommandAvailability
): WorkspaceDetectedRuntimeFamily {
    if (isNodeWorkspace(markers) && availableCommands.node.available) {
        return 'node';
    }

    if (isPythonWorkspace(markers) && (availableCommands.python.available || availableCommands.python3.available)) {
        return 'python';
    }

    return 'unknown';
}

function detectScriptRunner(
    markers: WorkspaceEnvironmentMarkers,
    availableCommands: WorkspaceEnvironmentCommandAvailability
): WorkspaceDetectedScriptRunner {
    if (isNodeWorkspace(markers)) {
        if (availableCommands.tsx.available) {
            return 'tsx';
        }

        if (availableCommands.node.available) {
            return 'node';
        }
    }

    if (isPythonWorkspace(markers) && (availableCommands.python.available || availableCommands.python3.available)) {
        return 'python';
    }

    return 'unknown';
}

function resolveDetectedVcsAvailability(
    family: WorkspaceDetectedVcs,
    availableCommands: WorkspaceEnvironmentCommandAvailability
): boolean {
    if (family === 'jj') {
        return availableCommands.jj.available;
    }
    if (family === 'git') {
        return availableCommands.git.available;
    }

    return false;
}

function resolveDetectedPackageManagerAvailability(
    family: WorkspaceDetectedPackageManager,
    availableCommands: WorkspaceEnvironmentCommandAvailability
): boolean {
    if (family === 'pnpm') {
        return availableCommands.pnpm.available;
    }
    if (family === 'npm') {
        return availableCommands.npm.available;
    }
    if (family === 'yarn') {
        return availableCommands.yarn.available;
    }
    if (family === 'bun') {
        return availableCommands.bun.available;
    }

    return false;
}

function resolveVcsPreference(input: {
    detectedFamily: WorkspaceDetectedVcs;
    override: WorkspacePreferredVcs;
    availableCommands: WorkspaceEnvironmentCommandAvailability;
}): WorkspaceEnvironmentEffectivePreferences['vcs'] {
    if (input.override === 'auto') {
        return {
            family: input.detectedFamily,
            source: 'detected',
            requestedOverride: 'auto',
            available: resolveDetectedVcsAvailability(input.detectedFamily, input.availableCommands),
            mismatch: false,
        };
    }

    return {
        family: input.override,
        source: 'override',
        requestedOverride: input.override,
        available: input.override === 'jj' ? input.availableCommands.jj.available : input.availableCommands.git.available,
        mismatch: input.override === 'jj' ? !input.availableCommands.jj.available : !input.availableCommands.git.available,
    };
}

function resolvePackageManagerPreference(input: {
    detectedFamily: WorkspaceDetectedPackageManager;
    override: WorkspacePreferredPackageManager;
    availableCommands: WorkspaceEnvironmentCommandAvailability;
}): WorkspaceEnvironmentEffectivePreferences['packageManager'] {
    if (input.override === 'auto') {
        return {
            family: input.detectedFamily,
            source: 'detected',
            requestedOverride: 'auto',
            available: resolveDetectedPackageManagerAvailability(input.detectedFamily, input.availableCommands),
            mismatch: false,
        };
    }

    const available =
        input.override === 'pnpm'
            ? input.availableCommands.pnpm.available
            : input.override === 'npm'
              ? input.availableCommands.npm.available
              : input.override === 'yarn'
                ? input.availableCommands.yarn.available
                : input.availableCommands.bun.available;

    return {
        family: input.override,
        source: 'override',
        requestedOverride: input.override,
        available,
        mismatch: !available,
    };
}

function buildDetectedPreferences(
    markers: WorkspaceEnvironmentMarkers,
    availableCommands: WorkspaceEnvironmentCommandAvailability
): WorkspaceEnvironmentDetectedPreferences {
    return {
        vcs: detectVcs(markers, availableCommands),
        packageManager: detectPackageManager(markers, availableCommands),
        runtime: detectRuntime(markers, availableCommands),
        scriptRunner: detectScriptRunner(markers, availableCommands),
    };
}

function buildEffectivePreferences(input: {
    detectedPreferences: WorkspaceEnvironmentDetectedPreferences;
    overrides: WorkspaceEnvironmentOverrides;
    availableCommands: WorkspaceEnvironmentCommandAvailability;
}): WorkspaceEnvironmentEffectivePreferences {
    return {
        vcs: resolveVcsPreference({
            detectedFamily: input.detectedPreferences.vcs,
            override: input.overrides.preferredVcs,
            availableCommands: input.availableCommands,
        }),
        packageManager: resolvePackageManagerPreference({
            detectedFamily: input.detectedPreferences.packageManager,
            override: input.overrides.preferredPackageManager,
            availableCommands: input.availableCommands,
        }),
        runtime: input.detectedPreferences.runtime,
        scriptRunner: input.detectedPreferences.scriptRunner,
    };
}

function buildNotes(input: {
    shellFamily: WorkspaceEnvironmentSnapshot['shellFamily'];
    markers: WorkspaceEnvironmentMarkers;
    availableCommands: WorkspaceEnvironmentCommandAvailability;
    effectivePreferences: WorkspaceEnvironmentEffectivePreferences;
}): string[] {
    const notes: string[] = [];

    if (input.shellFamily === 'powershell') {
        notes.push('Command execution uses PowerShell. Do not assume POSIX shell syntax.');
    } else {
        notes.push('Command execution uses a /bin/sh-style shell. Do not assume PowerShell syntax.');
    }

    if (input.effectivePreferences.vcs.family === 'jj') {
        notes.push('This workspace appears to be jj-managed. Prefer jj for repo inspection and history operations.');
        if (input.markers.hasJjDirectory) {
            notes.push('Detached git HEAD may be expected here because jj can manage the workspace.');
        }
    } else if (input.effectivePreferences.vcs.family === 'git') {
        notes.push('This workspace appears to prefer git for repo inspection and history operations.');
    } else if (input.markers.hasJjDirectory && !input.availableCommands.jj.available) {
        notes.push('This workspace has a .jj marker, but jj is not available on this machine.');
    } else if (input.markers.hasGitDirectory && !input.availableCommands.git.available) {
        notes.push('This workspace has a .git marker, but git is not available on this machine.');
    }

    if (input.effectivePreferences.packageManager.family !== 'unknown') {
        notes.push(`This workspace prefers ${input.effectivePreferences.packageManager.family}.`);
    } else if (input.markers.hasPnpmLock && !input.availableCommands.pnpm.available) {
        notes.push('This workspace signals pnpm via pnpm-lock.yaml, but pnpm is not available on this machine.');
    } else if (input.markers.hasPackageLock && !input.availableCommands.npm.available) {
        notes.push('This workspace signals npm via package-lock.json, but npm is not available on this machine.');
    } else if (input.markers.hasYarnLock && !input.availableCommands.yarn.available) {
        notes.push('This workspace signals yarn via yarn.lock, but yarn is not available on this machine.');
    } else if (input.markers.hasBunLock && !input.availableCommands.bun.available) {
        notes.push('This workspace signals bun via a bun lockfile, but bun is not available on this machine.');
    }

    if (isNodeWorkspace(input.markers)) {
        if (input.availableCommands.node.available) {
            notes.push('This workspace looks Node/TypeScript-oriented.');
        } else {
            notes.push('This workspace looks Node/TypeScript-oriented, but node is not available on this machine.');
        }
    }

    if (input.availableCommands.tsx.available && isNodeWorkspace(input.markers)) {
        notes.push('tsx is available for TypeScript repo scripts and utilities.');
    }

    if (!input.availableCommands.python.available && !input.availableCommands.python3.available) {
        notes.push('Do not assume Python is available for repo-local scripts.');
    } else if (
        isPythonWorkspace(input.markers) &&
        !input.availableCommands.python.available &&
        input.availableCommands.python3.available
    ) {
        notes.push('Python is available through python3 rather than python.');
    }

    if (input.effectivePreferences.vcs.mismatch) {
        notes.push(`The pinned VCS preference "${input.effectivePreferences.vcs.family}" is not available on this machine.`);
    }

    if (input.effectivePreferences.packageManager.mismatch) {
        notes.push(
            `The pinned package manager preference "${input.effectivePreferences.packageManager.family}" is not available on this machine.`
        );
    }

    return notes;
}

async function readWorkspaceMarkers(workspaceRootPath: string): Promise<WorkspaceEnvironmentMarkers> {
    const markerPaths = {
        hasJjDirectory: path.join(workspaceRootPath, '.jj'),
        hasGitDirectory: path.join(workspaceRootPath, '.git'),
        hasPackageJson: path.join(workspaceRootPath, 'package.json'),
        hasPnpmLock: path.join(workspaceRootPath, 'pnpm-lock.yaml'),
        hasPackageLock: path.join(workspaceRootPath, 'package-lock.json'),
        hasYarnLock: path.join(workspaceRootPath, 'yarn.lock'),
        hasBunLock: [path.join(workspaceRootPath, 'bun.lockb'), path.join(workspaceRootPath, 'bun.lock')],
        hasTsconfigJson: path.join(workspaceRootPath, 'tsconfig.json'),
        hasPyprojectToml: path.join(workspaceRootPath, 'pyproject.toml'),
        hasRequirementsTxt: path.join(workspaceRootPath, 'requirements.txt'),
    } as const;

    const [
        hasJjDirectory,
        hasGitDirectory,
        hasPackageJson,
        hasPnpmLock,
        hasPackageLock,
        hasYarnLock,
        bunLockCandidates,
        hasTsconfigJson,
        hasPyprojectToml,
        hasRequirementsTxt,
    ] = await Promise.all([
        pathExists(markerPaths.hasJjDirectory),
        pathExists(markerPaths.hasGitDirectory),
        pathExists(markerPaths.hasPackageJson),
        pathExists(markerPaths.hasPnpmLock),
        pathExists(markerPaths.hasPackageLock),
        pathExists(markerPaths.hasYarnLock),
        Promise.all(markerPaths.hasBunLock.map(async (candidate) => await pathExists(candidate))),
        pathExists(markerPaths.hasTsconfigJson),
        pathExists(markerPaths.hasPyprojectToml),
        pathExists(markerPaths.hasRequirementsTxt),
    ]);

    return {
        hasJjDirectory,
        hasGitDirectory,
        hasPackageJson,
        hasPnpmLock,
        hasPackageLock,
        hasYarnLock,
        hasBunLock: bunLockCandidates.some(Boolean),
        hasTsconfigJson,
        hasPyprojectToml,
        hasRequirementsTxt,
    };
}

export class WorkspaceEnvironmentService {
    private readonly commandLookupCache = new Map<string, CommandLookupCacheEntry>();

    private createCommandCacheKey(platform: SupportedPlatform): string {
        return `${platform}::${process.env.PATH ?? ''}`;
    }

    private async getAvailableCommands(platform: SupportedPlatform): Promise<WorkspaceEnvironmentCommandAvailability> {
        const cacheKey = this.createCommandCacheKey(platform);
        const now = Date.now();
        const cached = this.commandLookupCache.get(cacheKey);

        if (cached && cached.expiresAt > now) {
            return cached.availability;
        }

        const entries = await Promise.all(
            TRACKED_COMMANDS.map(async (command) => [command, await lookupExecutable(command, platform)] as const)
        );

        const availability: WorkspaceEnvironmentCommandAvailability = {
            jj: entries.find(([command]) => command === 'jj')?.[1] ?? createUnavailableEntry(),
            git: entries.find(([command]) => command === 'git')?.[1] ?? createUnavailableEntry(),
            node: entries.find(([command]) => command === 'node')?.[1] ?? createUnavailableEntry(),
            python: entries.find(([command]) => command === 'python')?.[1] ?? createUnavailableEntry(),
            python3: entries.find(([command]) => command === 'python3')?.[1] ?? createUnavailableEntry(),
            pnpm: entries.find(([command]) => command === 'pnpm')?.[1] ?? createUnavailableEntry(),
            npm: entries.find(([command]) => command === 'npm')?.[1] ?? createUnavailableEntry(),
            yarn: entries.find(([command]) => command === 'yarn')?.[1] ?? createUnavailableEntry(),
            bun: entries.find(([command]) => command === 'bun')?.[1] ?? createUnavailableEntry(),
            tsx: entries.find(([command]) => command === 'tsx')?.[1] ?? createUnavailableEntry(),
        };
        this.commandLookupCache.set(cacheKey, {
            expiresAt: now + COMMAND_CACHE_TTL_MS,
            availability,
        });

        return availability;
    }

    async inspectWorkspaceEnvironment(input: {
        workspaceRootPath: string;
        baseWorkspaceRootPath?: string;
        overrides?: Partial<WorkspaceEnvironmentOverrides>;
    }): Promise<OperationalResult<WorkspaceEnvironmentSnapshot>> {
        const workspaceRootPath = normalizeWorkspacePath(input.workspaceRootPath);

        try {
            const workspaceStats = await stat(workspaceRootPath);
            if (!workspaceStats.isDirectory()) {
                return errOp('invalid_input', 'Workspace environment inspection requires a directory path.');
            }
        } catch (error) {
            return errOp(
                'not_found',
                error instanceof Error ? error.message : 'Workspace path could not be inspected.'
            );
        }

        const baseWorkspaceRootPath = input.baseWorkspaceRootPath
            ? normalizeWorkspacePath(input.baseWorkspaceRootPath)
            : undefined;
        const platform = resolveSupportedPlatform();
        const shellFamily = resolveShellFamily(platform);
        const [markers, availableCommands] = await Promise.all([
            readWorkspaceMarkers(workspaceRootPath),
            this.getAvailableCommands(platform),
        ]);
        const overrides: WorkspaceEnvironmentOverrides = {
            preferredVcs: input.overrides?.preferredVcs ?? 'auto',
            preferredPackageManager: input.overrides?.preferredPackageManager ?? 'auto',
        };
        const detectedPreferences = buildDetectedPreferences(markers, availableCommands);
        const effectivePreferences = buildEffectivePreferences({
            detectedPreferences,
            overrides,
            availableCommands,
        });
        const notes = buildNotes({
            shellFamily,
            markers,
            availableCommands,
            effectivePreferences,
        });

        return okOp({
            platform,
            shellFamily,
            workspaceRootPath,
            ...(baseWorkspaceRootPath ? { baseWorkspaceRootPath } : {}),
            markers,
            availableCommands,
            detectedPreferences,
            effectivePreferences,
            overrides,
            notes,
        });
    }
}

export function buildWorkspaceEnvironmentGuidance(snapshot: WorkspaceEnvironmentSnapshot): string {
    const lines = [
        `Effective root: ${snapshot.workspaceRootPath}.`,
        `Platform: ${snapshot.platform}. Shell family: ${snapshot.shellFamily}.`,
    ];

    if (snapshot.baseWorkspaceRootPath) {
        lines.push(`Base workspace root: ${snapshot.baseWorkspaceRootPath}.`);
    }

    if (snapshot.effectivePreferences.vcs.family !== 'unknown') {
        lines.push(`Preferred VCS: ${snapshot.effectivePreferences.vcs.family}.`);
    }

    if (snapshot.effectivePreferences.packageManager.family !== 'unknown') {
        lines.push(`Preferred package manager: ${snapshot.effectivePreferences.packageManager.family}.`);
    }

    return [...lines, ...snapshot.notes].join(' ');
}

export function findRegisteredWorkspaceFingerprintByPath(input: {
    absolutePath: string;
    workspaceRoots: Array<{ fingerprint: string; absolutePath: string }>;
}): string | undefined {
    const normalizedPath = toPathKey(normalizeWorkspacePath(input.absolutePath));
    return input.workspaceRoots.find(
        (workspaceRoot) => toPathKey(normalizeWorkspacePath(workspaceRoot.absolutePath)) === normalizedPath
    )?.fingerprint;
}

export const workspaceEnvironmentService = new WorkspaceEnvironmentService();
