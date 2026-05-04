import { describe, expect, it } from 'vitest';

import { buildSandboxPolicySummary } from '@/app/backend/runtime/services/environment/sandboxPolicySummaryBuilder';

describe('sandbox policy summary builder', () => {
    it('describes local workspace authority without native process enforcement', () => {
        const summary = buildSandboxPolicySummary({
            platform: 'win32',
            workspaceRootPath: 'C:\\Repo',
        });

        expect(summary.filesystem).toMatchObject({
            kind: 'local_workspace',
            effectiveRootPath: 'C:\\Repo',
            managedByNeon: false,
            failClosedOnMissingTarget: false,
        });
        expect(summary.network.kind).toBe('not_restricted');
        expect(summary.process).toMatchObject({
            state: 'unsupported',
            nativeEnforcement: false,
        });
        expect(summary.diagnostics.map((diagnostic) => diagnostic.code)).toContain('windows_managed_directory_only');
    });

    it('marks scheduled managed sandboxes as fail-closed on materialization', () => {
        const summary = buildSandboxPolicySummary({
            platform: 'linux',
            workspaceContext: {
                kind: 'workspace',
                workspaceFingerprint: 'ws_policy',
                label: 'Policy Workspace',
                absolutePath: '/workspace/policy',
                executionEnvironmentMode: 'new_sandbox',
            },
        });

        expect(summary.filesystem).toMatchObject({
            kind: 'scheduled_managed_sandbox',
            managedByNeon: true,
            failClosedOnMissingTarget: true,
        });
        expect(summary.diagnostics).toContainEqual(
            expect.objectContaining({
                code: 'managed_sandbox_scheduled',
                failClosed: true,
            })
        );
    });

    it('describes materialized managed sandbox base workspace relation', () => {
        const summary = buildSandboxPolicySummary({
            platform: 'linux',
            workspaceContext: {
                kind: 'sandbox',
                workspaceFingerprint: 'ws_policy',
                label: 'Policy Sandbox',
                absolutePath: '/sandbox/policy',
                executionEnvironmentMode: 'sandbox',
                sandbox: {
                    id: 'sb_policy',
                    profileId: 'profile_default',
                    workspaceFingerprint: 'ws_policy',
                    absolutePath: '/sandbox/policy',
                    label: 'Policy Sandbox',
                    status: 'ready',
                    creationStrategy: 'copy',
                    createdAt: '2026-05-04T00:00:00.000Z',
                    updatedAt: '2026-05-04T00:00:00.000Z',
                    lastUsedAt: '2026-05-04T00:00:00.000Z',
                },
                baseWorkspace: {
                    label: 'Policy Workspace',
                    absolutePath: '/workspace/policy',
                },
            },
        });

        expect(summary.filesystem).toMatchObject({
            kind: 'managed_sandbox',
            effectiveRootPath: '/sandbox/policy',
            baseWorkspacePath: '/workspace/policy',
            managedByNeon: true,
        });
    });
});
