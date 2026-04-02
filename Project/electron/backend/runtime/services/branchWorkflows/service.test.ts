import os from 'node:os';
import { describe, expect, it } from 'vitest';

import { getPersistence } from '@/app/backend/persistence/db';
import { branchWorkflowService } from '@/app/backend/runtime/services/branchWorkflows/service';
import {
    mkdirSync,
    mkdtempSync,
    path,
    registerRuntimeContractHooks,
    rmSync,
    runtimeContractProfileId,
    writeFileSync,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

function insertWorkspaceRoot(profileId: string, workspaceFingerprint: string, workspacePath: string) {
    const now = new Date().toISOString();
    const { sqlite } = getPersistence();
    sqlite
        .prepare(
            `
                INSERT OR IGNORE INTO workspace_roots
                    (fingerprint, profile_id, absolute_path, path_key, label, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `
        )
        .run(
            workspaceFingerprint,
            profileId,
            workspacePath,
            process.platform === 'win32' ? workspacePath.toLowerCase() : workspacePath,
            path.basename(workspacePath),
            now,
            now
        );
}

describe('branchWorkflowService', () => {
    const profileId = runtimeContractProfileId;

    it('creates, lists, updates, and deletes branch workflows from .neonconductor/branch-workflows', async () => {
        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'neon-branch-workflows-'));
        insertWorkspaceRoot(profileId, 'ws_workflows_crud', workspacePath);

        const created = await branchWorkflowService.createProjectBranchWorkflow({
            profileId,
            workspaceFingerprint: 'ws_workflows_crud',
            label: 'Install deps',
            command: 'pnpm install',
            enabled: true,
        });
        expect(created.isOk()).toBe(true);
        if (created.isErr()) {
            throw new Error(created.error.message);
        }
        expect(created.value.id).toMatch(/^workflow_/);

        const listed = await branchWorkflowService.listProjectBranchWorkflows({
            profileId,
            workspaceFingerprint: 'ws_workflows_crud',
        });
        expect(listed.isOk()).toBe(true);
        if (listed.isErr()) {
            throw new Error(listed.error.message);
        }
        expect(listed.value.map((branchWorkflow) => branchWorkflow.label)).toEqual(['Install deps']);

        const updated = await branchWorkflowService.updateProjectBranchWorkflow({
            profileId,
            workspaceFingerprint: 'ws_workflows_crud',
            branchWorkflowId: created.value.id,
            label: 'Bootstrap',
            command: 'pnpm install --frozen-lockfile',
            enabled: false,
        });
        expect(updated.isOk()).toBe(true);
        if (updated.isErr()) {
            throw new Error(updated.error.message);
        }
        expect(updated.value?.label).toBe('Bootstrap');
        expect(updated.value?.enabled).toBe(false);

        const deleted = await branchWorkflowService.deleteProjectBranchWorkflow({
            profileId,
            workspaceFingerprint: 'ws_workflows_crud',
            branchWorkflowId: created.value.id,
            confirm: true,
        });
        expect(deleted.isOk()).toBe(true);
        if (deleted.isErr()) {
            throw new Error(deleted.error.message);
        }
        expect(deleted.value).toBe(true);

        const afterDelete = await branchWorkflowService.listProjectBranchWorkflows({
            profileId,
            workspaceFingerprint: 'ws_workflows_crud',
        });
        expect(afterDelete.isOk()).toBe(true);
        if (afterDelete.isErr()) {
            throw new Error(afterDelete.error.message);
        }
        expect(afterDelete.value).toEqual([]);

        rmSync(workspacePath, { recursive: true, force: true });
    });

    it('fails closed on malformed branch workflow files without damaging valid branch workflows', async () => {
        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'neon-branch-workflows-invalid-'));
        insertWorkspaceRoot(profileId, 'ws_workflows_invalid', workspacePath);
        const branchWorkflowsRoot = path.join(workspacePath, '.neonconductor', 'branch-workflows');
        mkdirSync(branchWorkflowsRoot, { recursive: true });

        const validBranchWorkflow = await branchWorkflowService.createProjectBranchWorkflow({
            profileId,
            workspaceFingerprint: 'ws_workflows_invalid',
            label: 'Format',
            command: 'pnpm format',
            enabled: true,
        });
        expect(validBranchWorkflow.isOk()).toBe(true);
        if (validBranchWorkflow.isErr()) {
            throw new Error(validBranchWorkflow.error.message);
        }
        writeFileSync(path.join(branchWorkflowsRoot, 'broken.json'), '{"label":42', 'utf8');
        writeFileSync(
            path.join(branchWorkflowsRoot, 'wrong-shape.json'),
            JSON.stringify({
                id: 'workflow_wrong_shape',
                label: '',
                createdAt: new Date().toISOString(),
            }),
            'utf8'
        );

        const branchWorkflows = await branchWorkflowService.listProjectBranchWorkflows({
            profileId,
            workspaceFingerprint: 'ws_workflows_invalid',
        });
        expect(branchWorkflows.isOk()).toBe(true);
        if (branchWorkflows.isErr()) {
            throw new Error(branchWorkflows.error.message);
        }
        expect(branchWorkflows.value).toHaveLength(1);
        expect(branchWorkflows.value[0]?.id).toBe(validBranchWorkflow.value.id);

        rmSync(workspacePath, { recursive: true, force: true });
    });

    it('does not read branch workflow files from unrelated roots outside the registered workspace root', async () => {
        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'neon-branch-workflows-root-'));
        const unrelatedPath = mkdtempSync(path.join(os.tmpdir(), 'neon-branch-workflows-unrelated-'));
        insertWorkspaceRoot(profileId, 'ws_workflows_root_boundary', workspacePath);

        const unrelatedBranchWorkflowsRoot = path.join(unrelatedPath, '.neonconductor', 'branch-workflows');
        mkdirSync(unrelatedBranchWorkflowsRoot, { recursive: true });
        writeFileSync(
            path.join(unrelatedBranchWorkflowsRoot, 'workflow_foreign.json'),
            JSON.stringify({
                id: 'workflow_foreign',
                label: 'Foreign workflow',
                command: 'pnpm foreign',
                enabled: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            }),
            'utf8'
        );

        const branchWorkflows = await branchWorkflowService.listProjectBranchWorkflows({
            profileId,
            workspaceFingerprint: 'ws_workflows_root_boundary',
        });
        expect(branchWorkflows.isOk()).toBe(true);
        if (branchWorkflows.isErr()) {
            throw new Error(branchWorkflows.error.message);
        }
        expect(branchWorkflows.value).toEqual([]);

        rmSync(workspacePath, { recursive: true, force: true });
        rmSync(unrelatedPath, { recursive: true, force: true });
    });
});
