import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WorkspaceStatusPanel } from '@/web/components/conversation/panels/workspaceStatusPanel';

import type { CloudSessionSummaryRecord } from '@/app/backend/persistence/types';

describe('WorkspaceStatusPanel', () => {
    it('surfaces the selected cloud session sync-back expectation', () => {
        const cloudSession: CloudSessionSummaryRecord = {
            id: 'csess_workspace_status',
            profileId: 'profile_default',
            providerId: 'kilo',
            recordKind: 'local_binding',
            authorityState: 'continued',
            syncState: 'synced',
            syncBackExpectation: {
                state: 'not_available',
                reason: 'kilo_owned_remote_workspace',
            },
            remoteSessionId: 'remote_workspace_status',
            remoteScopeKey: 'org_workspace_status',
            localSessionId: 'sess_workspace_status',
            title: 'Workspace Status',
            metadata: {},
            createdAt: '2026-04-30T10:00:00.000Z',
            updatedAt: '2026-04-30T10:00:00.000Z',
        };

        const html = renderToStaticMarkup(
            createElement(WorkspaceStatusPanel, {
                run: undefined,
                executionPreset: 'standard',
                workspaceScope: {
                    kind: 'detached',
                },
                provider: undefined,
                modelLabel: undefined,
                usageSummary: undefined,
                routingBadge: undefined,
                cloudSession,
            })
        );

        expect(html).toContain('Cloud Sync-Back');
        expect(html).toContain('continued');
        expect(html).toContain('Kilo-owned remote workspace: sync-back not available');
    });
});
