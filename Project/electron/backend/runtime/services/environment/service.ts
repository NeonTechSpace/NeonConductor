import { stat } from 'node:fs/promises';

import type {
    WorkspaceEnvironmentOverrides,
    WorkspaceEnvironmentSnapshot,
} from '@/app/backend/runtime/contracts/types/runtime';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import {
    resolveSupportedPlatform,
    resolveWorkspaceShellFamily,
    workspaceCommandAvailabilityService,
} from '@/app/backend/runtime/services/environment/workspaceCommandAvailabilityService';
import { buildWorkspaceEnvironmentGuidance } from '@/app/backend/runtime/services/environment/workspaceEnvironmentGuidanceBuilder';
import { buildWorkspaceEnvironmentInspection } from '@/app/backend/runtime/services/environment/workspaceEnvironmentSnapshotBuilder';
import { normalizeWorkspacePath } from '@/app/backend/runtime/services/environment/workspaceEnvironmentPathUtils';
import { workspaceMarkerScanner } from '@/app/backend/runtime/services/environment/workspaceMarkerScanner';

export class WorkspaceEnvironmentService {
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
        const shellFamily = resolveWorkspaceShellFamily(platform);
        const [markers, availableCommands] = await Promise.all([
            workspaceMarkerScanner.scanWorkspaceMarkers(workspaceRootPath),
            workspaceCommandAvailabilityService.getAvailableCommands(platform),
        ]);

        return okOp(
            buildWorkspaceEnvironmentInspection({
                platform,
                shellFamily,
                workspaceRootPath,
                ...(baseWorkspaceRootPath ? { baseWorkspaceRootPath } : {}),
                markers,
                availableCommands,
                overrides: {
                    preferredVcs: input.overrides?.preferredVcs ?? 'auto',
                    preferredPackageManager: input.overrides?.preferredPackageManager ?? 'auto',
                },
            })
        );
    }
}

export { buildWorkspaceEnvironmentGuidance };

export const workspaceEnvironmentService = new WorkspaceEnvironmentService();
