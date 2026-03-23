import { useState } from 'react';

import { useWorkspaceModeState } from '@/web/components/runtime/useWorkspaceModeState';
import { useWorkspaceProfileState } from '@/web/components/runtime/useWorkspaceProfileState';
import { BOOT_CRITICAL_QUERY_OPTIONS } from '@/web/components/runtime/startupQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { TopLevelTab } from '@/shared/contracts';

export function useWorkspaceSurfaceController() {
    const [topLevelTab, setTopLevelTab] = useState<TopLevelTab>('chat');
    const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
    const [currentWorkspaceFingerprint, setCurrentWorkspaceFingerprint] = useState<string | undefined>(undefined);

    const profileState = useWorkspaceProfileState({
        setTopLevelTab,
    });
    const modeState = useWorkspaceModeState({
        resolvedProfileId: profileState.resolvedProfileId,
        topLevelTab,
        ...(currentWorkspaceFingerprint ? { workspaceFingerprint: currentWorkspaceFingerprint } : {}),
    });
    const workspaceRootsQuery = trpc.runtime.listWorkspaceRoots.useQuery(
        { profileId: profileState.resolvedProfileId ?? 'profile_missing' },
        {
            enabled: Boolean(profileState.resolvedProfileId),
            ...BOOT_CRITICAL_QUERY_OPTIONS,
        }
    );
    const workspaceRoots = workspaceRootsQuery.data?.workspaceRoots ?? [];
    const resolvedWorkspaceFingerprint =
        currentWorkspaceFingerprint && workspaceRoots.some((workspaceRoot) => workspaceRoot.fingerprint === currentWorkspaceFingerprint)
            ? currentWorkspaceFingerprint
            : undefined;
    const selectedWorkspaceRoot = resolvedWorkspaceFingerprint
        ? workspaceRoots.find((workspaceRoot) => workspaceRoot.fingerprint === resolvedWorkspaceFingerprint)
        : undefined;

    return {
        profiles: profileState.profiles,
        resolvedProfileId: profileState.resolvedProfileId,
        profilePending: profileState.profilePending,
        profileErrorMessage: profileState.profileErrorMessage,
        hasProfiles: profileState.hasProfiles,
        isCommandPaletteOpen,
        setIsCommandPaletteOpen,
        topLevelTab,
        setTopLevelTab,
        currentWorkspaceFingerprint: resolvedWorkspaceFingerprint,
        setCurrentWorkspaceFingerprint,
        workspaceRoots,
        selectedWorkspaceRoot,
        modes: modeState.modes,
        activeModeKey: modeState.activeModeKey,
        hasResolvedInitialMode: modeState.hasResolvedInitialMode,
        modePending: modeState.modePending,
        modeErrorMessage: modeState.modeErrorMessage,
        profileSetActiveMutation: profileState.profileSetActiveMutation,
        setActiveModeMutation: modeState.setActiveModeMutation,
        setResolvedProfile: profileState.setResolvedProfile,
        selectProfile: profileState.selectProfile,
        selectMode: modeState.selectMode,
    };
}

