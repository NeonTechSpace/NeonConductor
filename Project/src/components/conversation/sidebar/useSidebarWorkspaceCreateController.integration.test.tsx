import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createWorkspaceRecordMock, submitWorkspaceStarterThreadLifecycleMock } = vi.hoisted(() => ({
    createWorkspaceRecordMock: vi.fn(),
    submitWorkspaceStarterThreadLifecycleMock: vi.fn(),
}));

vi.mock('@/web/components/workspaces/useWorkspaceCreationLifecycle', () => ({
    useWorkspaceCreationLifecycle: () => ({
        isCreatingWorkspace: true,
        createWorkspaceRecord: createWorkspaceRecordMock,
    }),
    submitWorkspaceStarterThreadLifecycle: submitWorkspaceStarterThreadLifecycleMock,
}));

import { useSidebarWorkspaceCreateController } from '@/web/components/conversation/sidebar/useSidebarWorkspaceCreateController';

function renderController() {
    let returnedValue: ReturnType<typeof useSidebarWorkspaceCreateController> | undefined;

    function Probe() {
        returnedValue = useSidebarWorkspaceCreateController({
            profileId: 'profile_default',
            onCreateThread: vi.fn(),
        });
        return null;
    }

    renderToStaticMarkup(<Probe />);
    return returnedValue;
}

describe('useSidebarWorkspaceCreateController', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        submitWorkspaceStarterThreadLifecycleMock.mockResolvedValue(undefined);
    });

    it('delegates workspace creation to the shared lifecycle hook', async () => {
        const controller = renderController();

        expect(controller).toBeDefined();
        expect(controller?.busy).toBe(true);

        await controller!.submitWorkspaceCreate({
            absolutePath: 'C:/workspace',
            label: 'Workspace Alpha',
            defaultTopLevelTab: 'agent',
            defaultProviderId: 'kilo',
            defaultModelId: 'kilo-auto/frontier',
        });

        expect(submitWorkspaceStarterThreadLifecycleMock).toHaveBeenCalledWith(
            expect.objectContaining({
                profileId: 'profile_default',
                absolutePath: 'C:/workspace',
                label: 'Workspace Alpha',
                defaultTopLevelTab: 'agent',
                defaultProviderId: 'kilo',
                defaultModelId: 'kilo-auto/frontier',
                createWorkspaceRecord: createWorkspaceRecordMock,
                onCreateThread: expect.any(Function),
            })
        );
    });
});
