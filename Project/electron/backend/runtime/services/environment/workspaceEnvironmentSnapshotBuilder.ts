import type {
    WorkspaceEnvironmentCommandAvailability,
    WorkspaceEnvironmentOverrides,
    WorkspaceEnvironmentSnapshot,
} from '@/app/backend/runtime/contracts/types/runtime';
import {
    resolveWorkspaceEnvironmentDetectedPreferences,
    resolveWorkspaceEnvironmentPreferencePolicy,
} from '@/app/backend/runtime/services/environment/workspaceEnvironmentPreferencePolicy';
import { buildWorkspaceEnvironmentNotes } from '@/app/backend/runtime/services/environment/workspaceEnvironmentNotesBuilder';

export function resolveWorkspaceEnvironmentInspection(input: {
    platform: WorkspaceEnvironmentSnapshot['platform'];
    shellFamily: WorkspaceEnvironmentSnapshot['shellFamily'];
    workspaceRootPath: string;
    baseWorkspaceRootPath?: string;
    availableCommands: WorkspaceEnvironmentCommandAvailability;
    markers: WorkspaceEnvironmentSnapshot['markers'];
    overrides: WorkspaceEnvironmentOverrides;
}): WorkspaceEnvironmentSnapshot {
    const detectedPreferences = resolveWorkspaceEnvironmentDetectedPreferences({
        markers: input.markers,
        availableCommands: input.availableCommands,
    });
    const effectivePreferences = resolveWorkspaceEnvironmentPreferencePolicy({
        detectedPreferences,
        overrides: input.overrides,
        availableCommands: input.availableCommands,
    });
    const notes = buildWorkspaceEnvironmentNotes({
        shellFamily: input.shellFamily,
        markers: input.markers,
        availableCommands: input.availableCommands,
        effectivePreferences,
    });

    return {
        platform: input.platform,
        shellFamily: input.shellFamily,
        workspaceRootPath: input.workspaceRootPath,
        ...(input.baseWorkspaceRootPath ? { baseWorkspaceRootPath: input.baseWorkspaceRootPath } : {}),
        markers: input.markers,
        availableCommands: input.availableCommands,
        detectedPreferences,
        effectivePreferences,
        overrides: input.overrides,
        notes,
    };
}

export const buildWorkspaceEnvironmentInspection = resolveWorkspaceEnvironmentInspection;
