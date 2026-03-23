import { describe, expect, it } from 'vitest';

import {
    getWorkspaceSectionPath,
    resolveActiveWorkspaceProfileId,
    resolveWorkspaceActiveModeKey,
    resolveWorkspaceAppSectionFromPathname,
} from '@/web/components/runtime/workspaceSurfaceModel';

describe('workspaceSurfaceModel', () => {
    it('prefers a valid local selection, then active server profile, then flagged active', () => {
        expect(
            resolveActiveWorkspaceProfileId({
                activeProfileId: 'profile_a',
                serverActiveProfileId: 'profile_b',
                profiles: [
                    { id: 'profile_a', isActive: false },
                    { id: 'profile_b', isActive: true },
                ],
            })
        ).toBe('profile_a');

        expect(
            resolveActiveWorkspaceProfileId({
                activeProfileId: 'missing',
                serverActiveProfileId: 'profile_b',
                profiles: [
                    { id: 'profile_a', isActive: false },
                    { id: 'profile_b', isActive: true },
                ],
            })
        ).toBe('profile_b');
    });

    it('falls back to the tab default mode when no active mode is loaded', () => {
        expect(resolveWorkspaceActiveModeKey('orchestrator', undefined)).toBe('plan');
        expect(resolveWorkspaceActiveModeKey('agent', 'debug')).toBe('debug');
    });

    it('maps coarse workspace sections to stable route paths', () => {
        expect(getWorkspaceSectionPath('sessions')).toBe('/sessions');
        expect(getWorkspaceSectionPath('settings')).toBe('/settings');
    });

    it('resolves the active coarse workspace section from the current pathname', () => {
        expect(resolveWorkspaceAppSectionFromPathname('/sessions')).toBe('sessions');
        expect(resolveWorkspaceAppSectionFromPathname('/settings')).toBe('settings');
        expect(resolveWorkspaceAppSectionFromPathname('/settings?section=profiles')).toBe('settings');
        expect(resolveWorkspaceAppSectionFromPathname('/sessions/child')).toBe('sessions');
    });
});
