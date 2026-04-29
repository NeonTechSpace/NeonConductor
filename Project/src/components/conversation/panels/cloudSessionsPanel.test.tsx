import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const invalidate = vi.fn(() => Promise.resolve(undefined));
const mutateAsync = vi.fn();

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        useUtils: () => ({
            session: {
                listCloudSessions: { invalidate },
                list: { invalidate },
            },
            conversation: {
                listThreads: { invalidate },
            },
        }),
        provider: {
            getCloudSessionPrerequisites: {
                useQuery: () => ({
                    data: {
                        prerequisites: {
                            canBrowseRemoteSessions: true,
                            canContinueRemoteSessions: true,
                            blockers: [],
                            scope: {
                                remoteScopeKey: 'org_cloud_test',
                            },
                        },
                    },
                    isLoading: false,
                }),
            },
        },
        session: {
            listCloudSessions: {
                useQuery: () => ({
                    data: {
                        cloudSessions: [
                            {
                                id: 'csess_remote',
                                profileId: 'profile_default',
                                providerId: 'kilo',
                                recordKind: 'remote_snapshot',
                                authorityState: 'remote_only',
                                syncState: 'synced',
                                syncBackExpectation: {
                                    state: 'not_applicable',
                                    reason: 'remote_snapshot_only',
                                },
                                remoteSessionId: 'remote_session_alpha',
                                remoteScopeKey: 'org_cloud_test',
                                title: 'Remote Alpha',
                                metadata: {},
                                createdAt: '2026-04-28T09:00:00.000Z',
                                updatedAt: '2026-04-28T09:00:00.000Z',
                            },
                            {
                                id: 'csess_local',
                                profileId: 'profile_default',
                                providerId: 'kilo',
                                recordKind: 'local_binding',
                                authorityState: 'continued',
                                syncState: 'synced',
                                syncBackExpectation: {
                                    state: 'not_available',
                                    reason: 'kilo_owned_remote_workspace',
                                },
                                remoteSessionId: 'remote_session_beta',
                                remoteScopeKey: 'org_cloud_test',
                                localSessionId: 'sess_cloud_existing',
                                title: 'Remote Beta',
                                metadata: {},
                                createdAt: '2026-04-28T09:00:00.000Z',
                                updatedAt: '2026-04-28T09:00:00.000Z',
                            },
                            {
                                id: 'csess_forked',
                                profileId: 'profile_default',
                                providerId: 'kilo',
                                recordKind: 'local_binding',
                                authorityState: 'forked',
                                syncState: 'synced',
                                syncBackExpectation: {
                                    state: 'not_applicable',
                                    reason: 'local_fork',
                                },
                                remoteSessionId: 'remote_session_gamma',
                                remoteScopeKey: 'org_cloud_test',
                                localSessionId: 'sess_cloud_forked',
                                title: 'Remote Gamma',
                                metadata: {},
                                createdAt: '2026-04-28T09:00:00.000Z',
                                updatedAt: '2026-04-28T09:00:00.000Z',
                            },
                        ],
                    },
                    isLoading: false,
                }),
            },
            importCloudSession: {
                useMutation: () => ({ isPending: false, mutateAsync }),
            },
            forkCloudSession: {
                useMutation: () => ({ isPending: false, mutateAsync }),
            },
            continueCloudSession: {
                useMutation: () => ({ isPending: false, mutateAsync }),
            },
        },
    },
}));

import { CloudSessionsPanel } from '@/web/components/conversation/panels/cloudSessionsPanel';

describe('CloudSessionsPanel', () => {
    it('renders cloud-session readiness, records, and import/fork/continue controls', () => {
        const html = renderToStaticMarkup(
            createElement(CloudSessionsPanel, {
                profileId: 'profile_default',
                threadId: 'thr_default',
                selectedSessionId: 'sess_cloud_existing',
                onSelectSession: vi.fn(),
                onCloudSessionCreated: vi.fn(),
            })
        );

        expect(html).toContain('Kilo Cloud Sessions');
        expect(html).toContain('Kilo-owned cloud harness');
        expect(html).toContain('remote workspace sync-back is not available');
        expect(html).toContain('Scope org_cloud_test');
        expect(html).toContain('Import By Remote ID');
        expect(html).toContain('Remote Alpha');
        expect(html).toContain('Remote only');
        expect(html).toContain('Remote record synced');
        expect(html).toContain('Remote snapshot only: sync-back not applicable');
        expect(html).toContain('Remote Beta');
        expect(html).toContain('Continued');
        expect(html).toContain('Kilo-owned remote workspace: sync-back not available');
        expect(html).toContain('Remote Gamma');
        expect(html).toContain('Local fork');
        expect(html).toContain('Local fork: sync-back not applicable');
        expect(html).toContain('Selected');
        expect(html).toContain('Fork');
        expect(html).toContain('Continue');
        expect(html).not.toContain('Sync Back');
    });
});
