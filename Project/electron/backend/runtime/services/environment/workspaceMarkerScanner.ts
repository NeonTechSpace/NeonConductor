import { access } from 'node:fs/promises';
import path from 'node:path';

import type { WorkspaceEnvironmentMarkers } from '@/app/backend/runtime/contracts/types/runtime';
import { normalizeWorkspacePath } from '@/app/backend/runtime/services/environment/workspaceEnvironmentPathUtils';

async function pathExists(targetPath: string): Promise<boolean> {
    try {
        await access(targetPath);
        return true;
    } catch {
        return false;
    }
}

export class WorkspaceMarkerScanner {
    async scanWorkspaceMarkers(workspaceRootPath: string): Promise<WorkspaceEnvironmentMarkers> {
        const normalizedWorkspaceRootPath = normalizeWorkspacePath(workspaceRootPath);
        const markerPaths = {
            hasJjDirectory: path.join(normalizedWorkspaceRootPath, '.jj'),
            hasGitDirectory: path.join(normalizedWorkspaceRootPath, '.git'),
            hasPackageJson: path.join(normalizedWorkspaceRootPath, 'package.json'),
            hasPnpmLock: path.join(normalizedWorkspaceRootPath, 'pnpm-lock.yaml'),
            hasPackageLock: path.join(normalizedWorkspaceRootPath, 'package-lock.json'),
            hasYarnLock: path.join(normalizedWorkspaceRootPath, 'yarn.lock'),
            hasBunLock: [path.join(normalizedWorkspaceRootPath, 'bun.lockb'), path.join(normalizedWorkspaceRootPath, 'bun.lock')],
            hasTsconfigJson: path.join(normalizedWorkspaceRootPath, 'tsconfig.json'),
            hasPyprojectToml: path.join(normalizedWorkspaceRootPath, 'pyproject.toml'),
            hasRequirementsTxt: path.join(normalizedWorkspaceRootPath, 'requirements.txt'),
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
}

export const workspaceMarkerScanner = new WorkspaceMarkerScanner();
