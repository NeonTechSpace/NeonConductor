import { describe, expect, it } from 'vitest';

import { adaptBranchWorkflowToFlowDefinition } from '@/app/backend/runtime/services/flows/branchWorkflowAdapter';

describe('branch workflow to flow adapter', () => {
    it('maps a branch workflow into a one-step manual flow definition', () => {
        expect(
            adaptBranchWorkflowToFlowDefinition({
                id: 'workflow_install',
                label: 'Install deps',
                command: 'pnpm install',
                enabled: true,
                createdAt: '2026-04-02T00:00:00.000Z',
                updatedAt: '2026-04-02T00:00:00.000Z',
            })
        ).toEqual({
            id: 'workflow_install',
            label: 'Install deps',
            enabled: true,
            triggerKind: 'manual',
            steps: [
                {
                    kind: 'legacy_command',
                    id: 'workflow_install:legacy_command',
                    label: 'Install deps',
                    command: 'pnpm install',
                },
            ],
            createdAt: '2026-04-02T00:00:00.000Z',
            updatedAt: '2026-04-02T00:00:00.000Z',
        });
    });
});
