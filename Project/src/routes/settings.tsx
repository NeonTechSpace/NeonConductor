import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';

import { useWorkspaceSurfaceControllerContext } from '@/web/components/runtime/workspaceSurfaceControllerContext';
import { getWorkspaceSectionPath } from '@/web/components/runtime/workspaceSurfaceModel';
import {
    getSettingsRouteSearch,
    parseSettingsRouteSearch,
    resolveSettingsSelectionFromRouteSearch,
} from '@/web/components/settings/settingsNavigation';
import { prefetchSettingsRouteData } from '@/web/components/settings/settingsRoutePrefetch';
import { SettingsWorkspace } from '@/web/components/settings/settingsWorkspace';

function SettingsRouteComponent() {
    const navigate = useNavigate({ from: '/settings' });
    const router = useRouter();
    const search = Route.useSearch();
    const { controller } = useWorkspaceSurfaceControllerContext();
    const selection = resolveSettingsSelectionFromRouteSearch(search);

    if (!controller.resolvedProfileId) {
        return null;
    }

    return (
        <SettingsWorkspace
            profileId={controller.resolvedProfileId}
            selection={selection}
            {...(controller.currentWorkspaceFingerprint
                ? { currentWorkspaceFingerprint: controller.currentWorkspaceFingerprint }
                : {})}
            {...(controller.selectedWorkspaceRoot?.label
                ? { selectedWorkspaceLabel: controller.selectedWorkspaceRoot.label }
                : {})}
            onSelectionChange={(nextSelection) => {
                void navigate({
                    search: getSettingsRouteSearch(nextSelection),
                });
            }}
            onProfileActivated={(profileId) => {
                controller.setResolvedProfile(profileId);
            }}
            onReturnToSessions={() => {
                void navigate({
                    to: getWorkspaceSectionPath('sessions'),
                });
            }}
            onPreviewReturnToSessions={() => {
                void router.preloadRoute({
                    to: getWorkspaceSectionPath('sessions'),
                });
            }}
        />
    );
}

export const Route = createFileRoute('/settings')({
    validateSearch: parseSettingsRouteSearch,
    loader: async ({ context }) => {
        await prefetchSettingsRouteData({
            trpcClient: context.trpcClient,
            trpcUtils: context.trpcUtils,
        });
    },
    component: SettingsRouteComponent,
});
