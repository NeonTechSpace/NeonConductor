import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { flowStore, runtimeEventStore } from '@/app/backend/persistence/stores';
import { getPersistence, registerRuntimeContractHooks, runtimeContractProfileId } from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

import {
    createFlowApprovalRequiredLifecycleEvent,
    createFlowStepStartedLifecycleEvent,
} from '@/shared/flowLifecycle';

registerRuntimeContractHooks();

describe('flowStore', () => {
    const profileId = runtimeContractProfileId;

    it('creates, updates, lists, and deletes canonical flow definitions', async () => {
        const created = await flowStore.createCanonicalDefinition({
            profileId,
            label: 'Setup flow',
            description: 'Bootstrap the repo',
            enabled: true,
            triggerKind: 'manual',
            steps: [
                {
                    kind: 'legacy_command',
                    id: 'step_install',
                    label: 'Install',
                    command: 'pnpm install',
                },
            ],
        });

        expect(created.originKind).toBe('canonical');
        expect(created.definition.id).toMatch(/^flow_/);

        const listed = await flowStore.listCanonicalDefinitions(profileId);
        expect(listed.map((definition) => definition.definition.id)).toContain(created.definition.id);

        const updated = await flowStore.updateCanonicalDefinition({
            profileId,
            flowDefinitionId: created.definition.id,
            label: 'Setup flow updated',
            description: 'Bootstrap again',
            enabled: false,
            triggerKind: 'manual',
            steps: [
                {
                    kind: 'approval_gate',
                    id: 'step_gate',
                    label: 'Approve',
                },
            ],
        });
        expect(updated?.definition.label).toBe('Setup flow updated');
        expect(updated?.definition.enabled).toBe(false);

        const deleted = await flowStore.deleteCanonicalDefinition(profileId, created.definition.id);
        expect(deleted).toBe('deleted');
        expect(await flowStore.getCanonicalDefinitionById(profileId, created.definition.id)).toBeNull();
    });

    it('fails closed on malformed persisted flow json', async () => {
        const created = await flowStore.createCanonicalDefinition({
            profileId,
            label: 'Broken flow',
            enabled: true,
            triggerKind: 'manual',
            steps: [],
        });
        const { sqlite } = getPersistence();
        sqlite
            .prepare(`UPDATE flow_definitions SET steps_json = ? WHERE id = ?`)
            .run('{"not":"an array"}', created.definition.id);

        await expect(flowStore.getCanonicalDefinitionById(profileId, created.definition.id)).rejects.toThrow(
            'Invalid persisted flow definition'
        );
    });

    it('persists immutable instance snapshots and joins flow lifecycle history', async () => {
        const created = await flowStore.createCanonicalDefinition({
            profileId,
            label: 'Review flow',
            enabled: true,
            triggerKind: 'manual',
            steps: [
                {
                    kind: 'approval_gate',
                    id: 'step_gate',
                    label: 'Approve',
                },
            ],
        });
        const instance = await flowStore.createFlowInstance({
            profileId,
            flowDefinitionId: created.definition.id,
            definitionSnapshot: created.definition,
        });
        expect(instance?.instance.flowDefinitionId).toBe(created.definition.id);
        if (!instance) {
            throw new Error('Expected flow instance to be created.');
        }

        await flowStore.updateFlowInstance({
            profileId,
            flowInstanceId: instance.instance.id,
            status: 'completed',
            currentStepIndex: 1,
            startedAt: '2026-04-02T10:00:00.000Z',
            finishedAt: '2026-04-02T10:01:00.000Z',
        });
        await runtimeEventStore.append({
            entityType: 'flow',
            domain: 'flow',
            operation: 'status',
            entityId: instance.instance.id,
            eventType: 'flow.completed',
            payload: {
                completedStepCount: 1,
                status: 'completed',
            },
        });

        const mutatedDefinition = await flowStore.updateCanonicalDefinition({
            profileId,
            flowDefinitionId: created.definition.id,
            label: 'Review flow updated',
            enabled: true,
            triggerKind: 'manual',
            steps: [
                {
                    kind: 'legacy_command',
                    id: 'step_run',
                    label: 'Run',
                    command: 'pnpm test',
                },
            ],
        });
        expect(mutatedDefinition?.definition.label).toBe('Review flow updated');

        const persistedInstance = await flowStore.getFlowInstanceById(profileId, instance.instance.id);
        expect(persistedInstance?.definitionSnapshot.label).toBe('Review flow');
        expect(persistedInstance?.instance.status).toBe('completed');
    });

    it('persists flow provenance and planning checkpoint state through lifecycle events', async () => {
        const created = await flowStore.createCanonicalDefinition({
            profileId,
            label: 'Planning flow',
            enabled: true,
            triggerKind: 'manual',
            steps: [
                {
                    kind: 'workflow',
                    id: 'step_plan',
                    label: 'Plan',
                    workflowCapability: 'planning',
                    promptMarkdown: 'Draft the plan.',
                },
            ],
        });
        const instance = await flowStore.createFlowInstance({
            profileId,
            flowDefinitionId: created.definition.id,
            definitionSnapshot: created.definition,
        });
        if (!instance) {
            throw new Error('Expected planning flow instance to be created.');
        }

        await flowStore.recordFlowLifecycleEvent({
            profileId,
            flowInstanceId: instance.instance.id,
            event: createFlowStepStartedLifecycleEvent({
                flowDefinitionId: created.definition.id,
                flowInstanceId: instance.instance.id,
                stepIndex: 0,
                stepId: 'step_plan',
                stepKind: 'workflow',
                currentRunId: 'run_flow_123',
                currentChildThreadId: 'thr_flow_123',
                currentChildSessionId: 'sess_flow_123',
                currentPlanId: 'plan_flow_123',
                currentPlanRevisionId: 'prev_flow_123',
                currentPlanPhaseId: 'phase_flow_123',
                currentPlanPhaseRevisionId: 'phase_rev_flow_123',
            }),
        });

        await flowStore.recordFlowLifecycleEvent({
            profileId,
            flowInstanceId: instance.instance.id,
            event: createFlowApprovalRequiredLifecycleEvent({
                flowDefinitionId: created.definition.id,
                flowInstanceId: instance.instance.id,
                stepIndex: 0,
                stepId: 'step_plan',
                stepKind: 'workflow',
                reason: 'Wait for the plan checkpoint.',
                approvalKind: 'plan_checkpoint',
                planId: 'plan_flow_123',
                planRevisionId: 'prev_flow_123',
                requiredPlanStatus: 'approved',
            }),
        });

        const persistedView = await flowStore.getFlowInstanceViewById(profileId, instance.instance.id);
        expect(persistedView?.currentRunId).toBe('run_flow_123');
        expect(persistedView?.currentChildThreadId).toBe('thr_flow_123');
        expect(persistedView?.currentChildSessionId).toBe('sess_flow_123');
        expect(persistedView?.currentPlanId).toBe('plan_flow_123');
        expect(persistedView?.currentPlanRevisionId).toBe('prev_flow_123');
        expect(persistedView?.currentPlanPhaseId).toBe('phase_flow_123');
        expect(persistedView?.currentPlanPhaseRevisionId).toBe('phase_rev_flow_123');
        expect(persistedView?.awaitingApproval?.kind).toBe('plan_checkpoint');
        expect(persistedView?.awaitingApproval?.planId).toBe('plan_flow_123');
        expect(persistedView?.awaitingApproval?.planRevisionId).toBe('prev_flow_123');
        expect(persistedView?.awaitingApproval?.requiredPlanStatus).toBe('approved');
        expect(persistedView?.availableActions.canResume).toBe(true);
    });

    it('keeps branch-workflow adapter identities stable per profile and workspace', async () => {
        const { sqlite } = getPersistence();
        const now = new Date().toISOString();
        const workspaceRootPath = join(tmpdir(), 'ws_flow_adapter');
        sqlite
            .prepare(
                `
                    INSERT OR IGNORE INTO workspace_roots
                        (fingerprint, profile_id, absolute_path, path_key, label, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run('ws_flow_adapter', profileId, workspaceRootPath, workspaceRootPath.toLowerCase(), 'ws', now, now);

        const first = await flowStore.upsertBranchWorkflowAdapterDefinition({
            profileId,
            workspaceFingerprint: 'ws_flow_adapter',
            sourceBranchWorkflowId: 'workflow_adapter_1',
            flowDefinition: {
                id: 'workflow_adapter_1',
                label: 'Adapter flow',
                enabled: true,
                triggerKind: 'manual',
                steps: [],
                createdAt: now,
                updatedAt: now,
            },
        });
        const second = await flowStore.upsertBranchWorkflowAdapterDefinition({
            profileId,
            workspaceFingerprint: 'ws_flow_adapter',
            sourceBranchWorkflowId: 'workflow_adapter_1',
            flowDefinition: {
                id: 'workflow_adapter_1',
                label: 'Adapter flow changed',
                enabled: false,
                triggerKind: 'manual',
                steps: [],
                createdAt: now,
                updatedAt: new Date(Date.parse(now) + 1_000).toISOString(),
            },
        });

        expect(second.definition.id).toBe(first.definition.id);
        expect(second.definition.label).toBe('Adapter flow changed');
        expect((await flowStore.listCanonicalDefinitions(profileId)).length).toBe(0);
    });
});
