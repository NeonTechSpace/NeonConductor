import { createFileRoute } from '@tanstack/react-router';

import { ConversationShell } from '@/web/components/conversation/shell';
import { startWorkspaceBootPrefetch } from '@/web/components/runtime/workspaceBootLoader';
import { useWorkspaceSurfaceControllerContext } from '@/web/components/runtime/workspaceSurfaceControllerContext';

function SessionsRouteComponent() {
    const { controller, onConversationShellBootReadinessChange } = useWorkspaceSurfaceControllerContext();

    if (!controller.resolvedProfileId) {
        return null;
    }

    return (
        <ConversationShell
            key={controller.resolvedProfileId}
            profileId={controller.resolvedProfileId}
            profiles={controller.profiles}
            selectedProfileId={controller.resolvedProfileId}
            topLevelTab={controller.topLevelTab}
            {...(controller.currentWorkspaceFingerprint
                ? { selectedWorkspaceFingerprint: controller.currentWorkspaceFingerprint }
                : {})}
            modeKey={controller.activeModeKey}
            modes={controller.modes}
            onModeChange={(modeKey) => {
                void controller.selectMode(modeKey);
            }}
            onTopLevelTabChange={controller.setTopLevelTab}
            onSelectedWorkspaceFingerprintChange={controller.setCurrentWorkspaceFingerprint}
            onProfileChange={(profileId) => {
                void controller.selectProfile(profileId);
            }}
            onBootChromeReadyChange={onConversationShellBootReadinessChange}
        />
    );
}

export const Route = createFileRoute('/sessions')({
    loader: async ({ context }) => {
        await startWorkspaceBootPrefetch({
            trpcUtils: context.trpcUtils,
        });
    },
    component: SessionsRouteComponent,
});
