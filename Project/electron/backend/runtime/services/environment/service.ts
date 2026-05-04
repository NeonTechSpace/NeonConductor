import { stat } from 'node:fs/promises';

import type {
    WorkspaceEnvironmentOverrides,
    WorkspaceEnvironmentSnapshot,
} from '@/app/backend/runtime/contracts/types/runtime';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { projectNodeExpectationResolver } from '@/app/backend/runtime/services/environment/projectNodeExpectationResolver';
import { buildSandboxPolicySummary } from '@/app/backend/runtime/services/environment/sandboxPolicySummaryBuilder';
import { vendoredNodeResolver } from '@/app/backend/runtime/services/environment/vendoredNodeResolver';
import {
    resolveSupportedPlatform,
    workspaceCommandAvailabilityService,
} from '@/app/backend/runtime/services/environment/workspaceCommandAvailabilityService';
import { buildWorkspaceEnvironmentGuidance } from '@/app/backend/runtime/services/environment/workspaceEnvironmentGuidanceBuilder';
import { normalizeWorkspacePath } from '@/app/backend/runtime/services/environment/workspaceEnvironmentPathUtils';
import { buildWorkspaceEnvironmentInspection } from '@/app/backend/runtime/services/environment/workspaceEnvironmentSnapshotBuilder';
import { workspaceMarkerScanner } from '@/app/backend/runtime/services/environment/workspaceMarkerScanner';
import { workspaceShellResolver } from '@/app/backend/runtime/services/environment/workspaceShellResolver';

import { VENDORED_NODE_VERSION } from '@/shared/tooling/vendoredNode';

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
        const [resolvedShell, markers, availableCommands, vendoredNodeResolution] = await Promise.all([
            workspaceShellResolver.resolve(platform),
            workspaceMarkerScanner.scanWorkspaceMarkers(workspaceRootPath),
            workspaceCommandAvailabilityService.getAvailableCommands(platform),
            vendoredNodeResolver.resolve({
                platform,
                arch: process.arch,
            }),
        ]);
        const projectNodeExpectation = await projectNodeExpectationResolver.resolve({
            workspaceRootPath,
            markers,
            vendoredNodeVersion: VENDORED_NODE_VERSION,
        });

        return okOp(
            buildWorkspaceEnvironmentInspection({
                platform,
                shellFamily: resolvedShell.shellFamily,
                ...(resolvedShell.shellExecutable ? { shellExecutable: resolvedShell.shellExecutable } : {}),
                workspaceRootPath,
                ...(baseWorkspaceRootPath ? { baseWorkspaceRootPath } : {}),
                markers,
                availableCommands,
                vendoredNode: {
                    version: VENDORED_NODE_VERSION,
                    available: vendoredNodeResolution.available,
                    ...(vendoredNodeResolution.targetKey ? { targetKey: vendoredNodeResolution.targetKey } : {}),
                    ...(vendoredNodeResolution.executablePath
                        ? { executablePath: vendoredNodeResolution.executablePath }
                        : {}),
                    ...(vendoredNodeResolution.reason ? { reason: vendoredNodeResolution.reason } : {}),
                },
                ...(projectNodeExpectation ? { projectNodeExpectation } : {}),
                sandboxPolicySummary: buildSandboxPolicySummary({
                    platform,
                    workspaceRootPath,
                    ...(baseWorkspaceRootPath ? { baseWorkspaceRootPath } : {}),
                }),
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
