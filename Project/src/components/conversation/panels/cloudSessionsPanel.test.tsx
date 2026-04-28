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
                                remoteSessionId: 'remote_session_beta',
                                remoteScopeKey: 'org_cloud_test',
                                localSessionId: 'sess_cloud_existing',
                                title: 'Remote Beta',
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
        expect(html).toContain('Scope org_cloud_test');
        expect(html).toContain('Import By Remote ID');
        expect(html).toContain('Remote Alpha');
        expect(html).toContain('remote only');
        expect(html).toContain('Remote Beta');
        expect(html).toContain('continued');
        expect(html).toContain('Selected');
        expect(html).toContain('Fork');
        expect(html).toContain('Continue');
    });
});
