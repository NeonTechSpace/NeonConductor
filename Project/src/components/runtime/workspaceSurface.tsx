import { Outlet, useNavigate, useRouter, useRouterState } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

import {
    INITIAL_CONVERSATION_SHELL_BOOT_CHROME_READINESS,
    getWorkspaceBootDiagnostics,
    isWorkspaceBootReady,
} from '@/web/components/runtime/bootReadiness';
import { WorkspaceCommandPalette } from '@/web/components/runtime/workspaceCommandPalette';
import { WorkspaceSurfaceControllerProvider } from '@/web/components/runtime/workspaceSurfaceControllerContext';
import { useRendererBootReadySignal } from '@/web/components/runtime/useRendererBootReadySignal';
import { useRendererBootStatusReporter } from '@/web/components/runtime/useRendererBootStatusReporter';
import { useWorkspaceBootPrefetch } from '@/web/components/runtime/useWorkspaceBootPrefetch';
import { WorkspaceBootDiagnosticsPanel } from '@/web/components/runtime/workspaceBootDiagnosticsPanel';
import { useWorkspaceSurfaceController } from '@/web/components/runtime/workspaceSurfaceController';
import { WorkspaceSurfaceHeader } from '@/web/components/runtime/workspaceSurfaceHeader';
import {
    getWorkspaceSectionPath,
    resolveWorkspaceAppSectionFromPathname,
} from '@/web/components/runtime/workspaceSurfaceModel';
import { trpcClient } from '@/web/lib/trpcClient';
import { trpc } from '@/web/trpc/client';

import { BOOT_FORCE_SHOW_MS } from '@/app/shared/splashContract';

export function WorkspaceSurface() {
    const controller = useWorkspaceSurfaceController();
    const utils = trpc.useUtils();
    const router = useRouter();
    const navigate = useNavigate();
    const pathname = useRouterState({
        select: (state) => state.location.pathname,
    });
    const appSection = resolveWorkspaceAppSectionFromPathname(pathname);
    useWorkspaceBootPrefetch({
        trpcClient,
        trpcUtils: utils,
    });
    const [conversationShellBootReadiness, setConversationShellBootReadiness] = useState(
        INITIAL_CONVERSATION_SHELL_BOOT_CHROME_READINESS
    );
    const [bootStartedAtMs] = useState(() => Date.now());
    const [bootElapsedMs, setBootElapsedMs] = useState(0);
    const effectiveShellBootReadiness =
        appSection === 'settings'
            ? {
                  shellBootstrapSettled: true,
              }
            : conversationShellBootReadiness;
    const bootPrerequisites = {
        hasResolvedProfile: Boolean(controller.resolvedProfileId),
        profilePending: controller.profilePending,
        hasProfiles: controller.hasProfiles,
        ...(controller.profileErrorMessage ? { profileErrorMessage: controller.profileErrorMessage } : {}),
        hasResolvedInitialMode: controller.hasResolvedInitialMode,
        modePending: controller.modePending,
        ...(controller.modeErrorMessage ? { modeErrorMessage: controller.modeErrorMessage } : {}),
        ...effectiveShellBootReadiness,
        hasInteractiveShell:
            Boolean(controller.resolvedProfileId) &&
            effectiveShellBootReadiness.shellBootstrapSettled &&
            !effectiveShellBootReadiness.shellBootstrapErrorMessage,
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
    function openCommandPalette() {
        controller.setIsCommandPaletteOpen(true);
    }

    function navigateToSection(section: 'sessions' | 'settings') {
        void navigate({
            to: getWorkspaceSectionPath(section),
        });
    }

    function preloadSection(section: 'sessions' | 'settings') {
        void router.preloadRoute({
            to: getWorkspaceSectionPath(section),
        });
    }

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

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key.toLowerCase() !== 'k' || (!event.metaKey && !event.ctrlKey)) {
                return;
            }

            const target = event.target;
            if (
                target instanceof HTMLElement &&
                (target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.tagName === 'SELECT' ||
                    target.isContentEditable)
            ) {
                return;
            }

            event.preventDefault();
            openCommandPalette();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [openCommandPalette]);

    return (
        <section className='flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden'>
            {showBootDiagnostics ? <WorkspaceBootDiagnosticsPanel status={bootDiagnostics.status} /> : null}
            <WorkspaceSurfaceHeader
                appSection={appSection}
                profiles={controller.profiles}
                resolvedProfileId={controller.resolvedProfileId}
                isSwitchingProfile={controller.profileSetActiveMutation.isPending}
                onProfileChange={(profileId) => {
                    void controller.selectProfile(profileId);
                }}
                onOpenSettings={() => {
                    navigateToSection('settings');
                }}
                onPreviewSettings={() => {
                    preloadSection('settings');
                }}
                onOpenCommandPalette={() => {
                    openCommandPalette();
                }}
            />

            <div className='bg-background flex min-h-0 min-w-0 flex-1 overflow-hidden'>
                <div className='min-h-0 min-w-0 flex-1 overflow-hidden'>
                    {controller.resolvedProfileId ? (
                        <WorkspaceSurfaceControllerProvider
                            value={{
                                controller,
                                onConversationShellBootReadinessChange: setConversationShellBootReadiness,
                            }}>
                            <Outlet />
                        </WorkspaceSurfaceControllerProvider>
                    ) : (
                        <div className='text-muted-foreground flex h-full items-center justify-center text-sm'>
                            Loading profile state...
                        </div>
                    )}
                </div>
            </div>

            <WorkspaceCommandPalette
                open={controller.isCommandPaletteOpen}
                appSection={appSection}
                profiles={controller.profiles}
                workspaceOptions={controller.workspaceRoots.map((workspaceRoot) => ({
                    fingerprint: workspaceRoot.fingerprint,
                    label: workspaceRoot.label,
                }))}
                onClose={() => {
                    controller.setIsCommandPaletteOpen(false);
                }}
                onSectionChange={(section) => {
                    navigateToSection(section);
                }}
                onPreviewSectionChange={(section) => {
                    preloadSection(section);
                }}
                onProfileChange={(profileId) => {
                    void controller.selectProfile(profileId);
                }}
                onWorkspaceChange={controller.setCurrentWorkspaceFingerprint}
            />
        </section>
    );
}
