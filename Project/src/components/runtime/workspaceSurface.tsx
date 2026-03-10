import { startTransition, useState } from 'react';

import { ConversationShell } from '@/web/components/conversation/shell';
import {
    INITIAL_CONVERSATION_SHELL_BOOT_CHROME_READINESS,
    isWorkspaceBootReady,
} from '@/web/components/runtime/bootReadiness';
import { useRendererBootReadySignal } from '@/web/components/runtime/useRendererBootReadySignal';
import { useWorkspaceSurfaceController } from '@/web/components/runtime/workspaceSurfaceController';
import { WorkspaceSurfaceHeader } from '@/web/components/runtime/workspaceSurfaceHeader';
import { prefetchSettingsData } from '@/web/components/settings/settingsPrefetch';
import { SettingsSheet } from '@/web/components/settings/settingsSheet';
import { trpc } from '@/web/trpc/client';

export function WorkspaceSurface() {
    const controller = useWorkspaceSurfaceController();
    const utils = trpc.useUtils();
    const [conversationShellBootReadiness, setConversationShellBootReadiness] = useState(
        INITIAL_CONVERSATION_SHELL_BOOT_CHROME_READINESS
    );
    const isBootReady = isWorkspaceBootReady({
        hasResolvedProfile: Boolean(controller.resolvedProfileId),
        hasResolvedInitialMode: controller.hasResolvedInitialMode,
        ...conversationShellBootReadiness,
        hasInteractiveShell:
            Boolean(controller.resolvedProfileId) && conversationShellBootReadiness.shellBootstrapSettled,
    });

    useRendererBootReadySignal(isBootReady);

    return (
        <section className='flex min-h-0 flex-1 flex-col'>
            <WorkspaceSurfaceHeader
                profiles={controller.profiles}
                resolvedProfileId={controller.resolvedProfileId}
                topLevelTab={controller.topLevelTab}
                modes={controller.modes}
                activeModeKey={controller.activeModeKey}
                isSwitchingProfile={controller.profileSetActiveMutation.isPending}
                onTopLevelTabChange={(nextTab) => {
                    startTransition(() => {
                        controller.setTopLevelTab(nextTab);
                    });
                }}
                onPreviewTopLevelTab={(nextTab) => {
                    if (!controller.resolvedProfileId || nextTab !== 'agent') {
                        return;
                    }

                    const modeInput = {
                        profileId: controller.resolvedProfileId,
                        topLevelTab: 'agent' as const,
                        ...(controller.currentWorkspaceFingerprint
                            ? { workspaceFingerprint: controller.currentWorkspaceFingerprint }
                            : {}),
                    };
                    void Promise.all([
                        utils.mode.list.prefetch(modeInput),
                        utils.mode.getActive.prefetch(modeInput),
                        utils.registry.listResolved.prefetch({
                            profileId: controller.resolvedProfileId,
                            ...(controller.currentWorkspaceFingerprint
                                ? { workspaceFingerprint: controller.currentWorkspaceFingerprint }
                                : {}),
                        }),
                    ]);
                }}
                onProfileChange={(profileId) => {
                    void controller.selectProfile(profileId);
                }}
                onOpenSettings={() => {
                    if (controller.resolvedProfileId) {
                        prefetchSettingsData({
                            profileId: controller.resolvedProfileId,
                            trpcUtils: utils,
                        });
                    }
                    startTransition(() => {
                        controller.setShowSettings(true);
                    });
                }}
                onModeChange={(modeKey) => {
                    void controller.selectMode(modeKey);
                }}
            />

            <div className='min-h-0 flex-1'>
                {controller.resolvedProfileId ? (
                    <ConversationShell
                        profileId={controller.resolvedProfileId}
                        topLevelTab={controller.topLevelTab}
                        modeKey={controller.activeModeKey}
                        onTopLevelTabChange={controller.setTopLevelTab}
                        onSelectedWorkspaceFingerprintChange={controller.setCurrentWorkspaceFingerprint}
                        onBootChromeReadyChange={setConversationShellBootReadiness}
                    />
                ) : (
                    <div className='text-muted-foreground flex h-full items-center justify-center text-sm'>
                        Loading profile state...
                    </div>
                )}
            </div>

            {controller.resolvedProfileId ? (
                <SettingsSheet
                    open={controller.showSettings}
                    profileId={controller.resolvedProfileId}
                    onClose={() => {
                        controller.setShowSettings(false);
                    }}
                    onProfileActivated={(profileId) => {
                        controller.setResolvedProfile(profileId);
                    }}
                />
            ) : null}
        </section>
    );
}
