import { startTransition, useEffect, useState } from 'react';

import { ConversationShell } from '@/web/components/conversation/shell';
import {
    INITIAL_CONVERSATION_SHELL_BOOT_CHROME_READINESS,
    getWorkspaceBootDiagnostics,
    isWorkspaceBootReady,
} from '@/web/components/runtime/bootReadiness';
import { useRendererBootReadySignal } from '@/web/components/runtime/useRendererBootReadySignal';
import { useRendererBootStatusReporter } from '@/web/components/runtime/useRendererBootStatusReporter';
import { useWorkspaceBootPrefetch } from '@/web/components/runtime/useWorkspaceBootPrefetch';
import { WorkspaceBootDiagnosticsPanel } from '@/web/components/runtime/workspaceBootDiagnosticsPanel';
import { useWorkspaceSurfaceController } from '@/web/components/runtime/workspaceSurfaceController';
import { WorkspaceSurfaceHeader } from '@/web/components/runtime/workspaceSurfaceHeader';
import { prefetchSettingsData } from '@/web/components/settings/settingsPrefetch';
import { SettingsSheet } from '@/web/components/settings/settingsSheet';
import { trpc } from '@/web/trpc/client';

import { BOOT_FORCE_SHOW_MS } from '@/app/shared/splashContract';

export function WorkspaceSurface() {
    const controller = useWorkspaceSurfaceController();
    const utils = trpc.useUtils();
    useWorkspaceBootPrefetch({
        trpcUtils: utils,
    });
    const [conversationShellBootReadiness, setConversationShellBootReadiness] = useState(
        INITIAL_CONVERSATION_SHELL_BOOT_CHROME_READINESS
    );
    const [bootStartedAtMs] = useState(() => Date.now());
    const [bootElapsedMs, setBootElapsedMs] = useState(0);
    const bootPrerequisites = {
        hasResolvedProfile: Boolean(controller.resolvedProfileId),
        profilePending: controller.profilePending,
        hasProfiles: controller.hasProfiles,
        ...(controller.profileErrorMessage ? { profileErrorMessage: controller.profileErrorMessage } : {}),
        hasResolvedInitialMode: controller.hasResolvedInitialMode,
        modePending: controller.modePending,
        ...(controller.modeErrorMessage ? { modeErrorMessage: controller.modeErrorMessage } : {}),
        ...conversationShellBootReadiness,
        hasInteractiveShell:
            Boolean(controller.resolvedProfileId) &&
            conversationShellBootReadiness.shellBootstrapSettled &&
            !conversationShellBootReadiness.shellBootstrapErrorMessage,
    };
    const isBootReady = isWorkspaceBootReady(bootPrerequisites);
    const readySignal = useRendererBootReadySignal(isBootReady);
    const bootDiagnostics = getWorkspaceBootDiagnostics({
        ...bootPrerequisites,
        ...readySignal,
        elapsedMs: bootElapsedMs,
    });
    const showBootDiagnostics =
        bootDiagnostics.hasCriticalError ||
        (readySignal.readySignalState !== 'sent' && bootElapsedMs >= BOOT_FORCE_SHOW_MS);

    useRendererBootStatusReporter(bootDiagnostics.status);

    useEffect(() => {
        if (readySignal.readySignalState === 'sent') {
            return;
        }

        const intervalId = window.setInterval(() => {
            setBootElapsedMs(Date.now() - bootStartedAtMs);
        }, 250);

        setBootElapsedMs(Date.now() - bootStartedAtMs);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [bootStartedAtMs, readySignal.readySignalState]);

    return (
        <section className='flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden'>
            {showBootDiagnostics ? <WorkspaceBootDiagnosticsPanel status={bootDiagnostics.status} /> : null}
            <WorkspaceSurfaceHeader
                profiles={controller.profiles}
                resolvedProfileId={controller.resolvedProfileId}
                topLevelTab={controller.topLevelTab}
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
            />

            <div className='min-h-0 min-w-0 flex-1 overflow-hidden'>
                {controller.resolvedProfileId ? (
                    <ConversationShell
                        key={controller.resolvedProfileId}
                        profileId={controller.resolvedProfileId}
                        topLevelTab={controller.topLevelTab}
                        modeKey={controller.activeModeKey}
                        modes={controller.modes}
                        onModeChange={(modeKey) => {
                            void controller.selectMode(modeKey);
                        }}
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
