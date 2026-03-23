import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        useUtils: () => ({
            workflow: {
                list: {
                    invalidate: vi.fn(),
                },
            },
        }),
        workflow: {
            list: {
                useQuery: () => ({
                    isLoading: false,
                    data: {
                        workflows: [
                            {
                                id: 'workflow_install',
                                label: 'Install deps',
                                command: 'pnpm install',
                                enabled: true,
                                createdAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString(),
                            },
                            {
                                id: 'workflow_disabled',
                                label: 'Disabled bootstrap',
                                command: 'pnpm bootstrap',
                                enabled: false,
                                createdAt: new Date().toISOString(),
                                updatedAt: new Date().toISOString(),
                            },
                        ],
                    },
                }),
            },
            create: {
                useMutation: () => ({
                    isPending: false,
                    mutateAsync: vi.fn(),
                }),
            },
            update: {
                useMutation: () => ({
                    isPending: false,
                    mutateAsync: vi.fn(),
                }),
            },
            delete: {
                useMutation: () => ({
                    isPending: false,
                    mutateAsync: vi.fn(),
                }),
            },
        },
    },
}));

import { BranchWorkflowDialog } from '@/web/components/conversation/panels/branchWorkflowDialog';

describe('BranchWorkflowDialog', () => {
    it('renders branch actions and project workflows', () => {
        const html = renderToStaticMarkup(
            <BranchWorkflowDialog
                open
                profileId='profile_default'
                workspaceFingerprint='ws_branch_dialog'
                busy={false}
                onClose={() => {}}
                onBranch={async () => {}}
            />
        );

        expect(html).toContain('Branch workflow');
        expect(html).toContain('Branch with no workflow');
        expect(html).toContain('Create workflow');
        expect(html).toContain('Install deps');
        expect(html).toContain('pnpm install');
        expect(html).toContain('Disabled bootstrap');
        expect(html).toContain('Disabled');
    });
});
