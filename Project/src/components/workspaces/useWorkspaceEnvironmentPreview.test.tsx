import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkspaceEnvironmentPreview } from '@/web/components/workspaces/useWorkspaceEnvironmentPreview';

const inspectWorkspaceEnvironmentUseQueryMock = vi.fn();

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        runtime: {
            inspectWorkspaceEnvironment: {
                useQuery: (input: unknown, options: unknown) => inspectWorkspaceEnvironmentUseQueryMock(input, options),
            },
        },
    },
}));

function PreviewProbe(props: { profileId: string; absolutePath: string }) {
    const preview = useWorkspaceEnvironmentPreview(props);
    return (
        <span
            data-loading={preview.isLoading ? 'true' : 'false'}
            data-error={preview.errorMessage ?? ''}
            data-root={preview.snapshot?.workspaceRootPath ?? ''}
        />
    );
}

describe('useWorkspaceEnvironmentPreview', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('trims the requested path before issuing the preview query', () => {
        inspectWorkspaceEnvironmentUseQueryMock.mockReturnValue({
            isLoading: false,
            error: undefined,
            data: {
                snapshot: {
                    workspaceRootPath: 'C:/workspace',
                },
            },
        });

        const html = renderToStaticMarkup(<PreviewProbe profileId='profile_default' absolutePath='  C:/workspace  ' />);

        expect(inspectWorkspaceEnvironmentUseQueryMock).toHaveBeenCalledWith(
            {
                profileId: 'profile_default',
                absolutePath: 'C:/workspace',
            },
            expect.objectContaining({
                enabled: true,
            })
        );
        expect(html).toContain('data-root="C:/workspace"');
    });

    it('keeps the preview query disabled until a path is present', () => {
        inspectWorkspaceEnvironmentUseQueryMock.mockReturnValue({
            isLoading: true,
            error: {
                message: 'Missing workspace path.',
            },
            data: undefined,
        });

        const html = renderToStaticMarkup(<PreviewProbe profileId='profile_default' absolutePath='   ' />);

        expect(inspectWorkspaceEnvironmentUseQueryMock).toHaveBeenCalledWith(
            {
                profileId: 'profile_default',
                absolutePath: '.',
            },
            expect.objectContaining({
                enabled: false,
            })
        );
        expect(html).toContain('data-loading="true"');
        expect(html).toContain('data-error="Missing workspace path."');
    });
});
