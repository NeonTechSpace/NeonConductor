import os from 'node:os';

import { describe, expect, it } from 'vitest';

import { getPersistence } from '@/app/backend/persistence/db';
import { workflowService } from '@/app/backend/runtime/services/workflows/service';
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

describe('workflowService', () => {
    const profileId = runtimeContractProfileId;

    it('creates, lists, updates, and deletes project workflows from .neonconductor/workflows', async () => {
        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'neon-workflows-'));
        insertWorkspaceRoot(profileId, 'ws_workflows_crud', workspacePath);

        const created = await workflowService.createProjectWorkflow({
            profileId,
            workspaceFingerprint: 'ws_workflows_crud',
            label: 'Install deps',
            command: 'pnpm install',
            enabled: true,
        });
        expect(created.id).toMatch(/^workflow_/);

        const listed = await workflowService.listProjectWorkflows({
            profileId,
            workspaceFingerprint: 'ws_workflows_crud',
        });
        expect(listed.map((workflow) => workflow.label)).toEqual(['Install deps']);

        const updated = await workflowService.updateProjectWorkflow({
            profileId,
            workspaceFingerprint: 'ws_workflows_crud',
            workflowId: created.id,
            label: 'Bootstrap',
            command: 'pnpm install --frozen-lockfile',
            enabled: false,
        });
        expect(updated?.label).toBe('Bootstrap');
        expect(updated?.enabled).toBe(false);

        const deleted = await workflowService.deleteProjectWorkflow({
            profileId,
            workspaceFingerprint: 'ws_workflows_crud',
            workflowId: created.id,
            confirm: true,
        });
        expect(deleted).toBe(true);

        const afterDelete = await workflowService.listProjectWorkflows({
            profileId,
            workspaceFingerprint: 'ws_workflows_crud',
        });
        expect(afterDelete).toEqual([]);

        rmSync(workspacePath, { recursive: true, force: true });
    });

    it('fails closed on malformed workflow files without damaging valid workflows', async () => {
        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'neon-workflows-invalid-'));
        insertWorkspaceRoot(profileId, 'ws_workflows_invalid', workspacePath);
        const workflowsRoot = path.join(workspacePath, '.neonconductor', 'workflows');
        mkdirSync(workflowsRoot, { recursive: true });

        const validWorkflow = await workflowService.createProjectWorkflow({
            profileId,
            workspaceFingerprint: 'ws_workflows_invalid',
            label: 'Format',
            command: 'pnpm format',
            enabled: true,
        });
        writeFileSync(path.join(workflowsRoot, 'broken.json'), '{"label":42', 'utf8');
        writeFileSync(
            path.join(workflowsRoot, 'wrong-shape.json'),
            JSON.stringify({
                id: 'workflow_wrong_shape',
                label: '',
                createdAt: new Date().toISOString(),
            }),
            'utf8'
        );

        const workflows = await workflowService.listProjectWorkflows({
            profileId,
            workspaceFingerprint: 'ws_workflows_invalid',
        });
        expect(workflows).toHaveLength(1);
        expect(workflows[0]?.id).toBe(validWorkflow.id);

        rmSync(workspacePath, { recursive: true, force: true });
    });

    it('does not read workflow files from unrelated roots outside the registered workspace root', async () => {
        const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'neon-workflows-root-'));
        const unrelatedPath = mkdtempSync(path.join(os.tmpdir(), 'neon-workflows-unrelated-'));
        insertWorkspaceRoot(profileId, 'ws_workflows_root_boundary', workspacePath);

        const unrelatedWorkflowsRoot = path.join(unrelatedPath, '.neonconductor', 'workflows');
        mkdirSync(unrelatedWorkflowsRoot, { recursive: true });
        writeFileSync(
            path.join(unrelatedWorkflowsRoot, 'workflow_foreign.json'),
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

        const workflows = await workflowService.listProjectWorkflows({
            profileId,
            workspaceFingerprint: 'ws_workflows_root_boundary',
        });
        expect(workflows).toEqual([]);

        rmSync(workspacePath, { recursive: true, force: true });
        rmSync(unrelatedPath, { recursive: true, force: true });
    });
});
