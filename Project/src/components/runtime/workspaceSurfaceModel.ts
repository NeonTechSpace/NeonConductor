import type { TopLevelTab } from '@/shared/contracts';

export type WorkspaceAppSection = 'sessions' | 'settings';
export type WorkspaceAppRoutePath = '/sessions' | '/settings';

export const FALLBACK_MODE_BY_TAB: Record<TopLevelTab, string> = {
    chat: 'chat',
    agent: 'code',
    orchestrator: 'plan',
};

export function getWorkspaceSectionPath(section: WorkspaceAppSection): WorkspaceAppRoutePath {
    return section === 'settings' ? '/settings' : '/sessions';
}

export function resolveWorkspaceAppSectionFromPathname(pathname: string): WorkspaceAppSection {
    return pathname === '/settings' || pathname.startsWith('/settings?') || pathname.startsWith('/settings/')
        ? 'settings'
        : 'sessions';
}

export function resolveActiveWorkspaceProfileId(input: {
    activeProfileId: string | undefined;
    serverActiveProfileId: string | undefined;
    profiles: Array<{ id: string; isActive: boolean }>;
}): string | undefined {
    if (input.activeProfileId && input.profiles.some((profile) => profile.id === input.activeProfileId)) {
        return input.activeProfileId;
    }

    if (input.serverActiveProfileId && input.profiles.some((profile) => profile.id === input.serverActiveProfileId)) {
        return input.serverActiveProfileId;
    }

    const flaggedActiveProfileId = input.profiles.find((profile) => profile.isActive)?.id;
    if (flaggedActiveProfileId) {
        return flaggedActiveProfileId;
    }

    return input.profiles[0]?.id;
}

export function resolveWorkspaceActiveModeKey(topLevelTab: TopLevelTab, activeModeKey: string | undefined): string {
    return activeModeKey ?? FALLBACK_MODE_BY_TAB[topLevelTab];
}
