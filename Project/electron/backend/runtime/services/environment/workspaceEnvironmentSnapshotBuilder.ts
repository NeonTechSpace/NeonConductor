import type {
    WorkspaceEnvironmentCommandAvailability,
    WorkspaceEnvironmentOverrides,
    WorkspaceProjectNodeExpectation,
    WorkspaceEnvironmentSnapshot,
} from '@/app/backend/runtime/contracts/types/runtime';
import { buildWorkspaceEnvironmentNotes } from '@/app/backend/runtime/services/environment/workspaceEnvironmentNotesBuilder';
import {
    resolveWorkspaceEnvironmentDetectedPreferences,
    resolveWorkspaceEnvironmentPreferencePolicy,
} from '@/app/backend/runtime/services/environment/workspaceEnvironmentPreferencePolicy';

export function resolveWorkspaceEnvironmentInspection(input: {
    platform: WorkspaceEnvironmentSnapshot['platform'];
    shellFamily: WorkspaceEnvironmentSnapshot['shellFamily'];
    shellExecutable?: WorkspaceEnvironmentSnapshot['shellExecutable'];
    workspaceRootPath: string;
    baseWorkspaceRootPath?: string;
    availableCommands: WorkspaceEnvironmentCommandAvailability;
    markers: WorkspaceEnvironmentSnapshot['markers'];
    overrides: WorkspaceEnvironmentOverrides;
    vendoredNode: WorkspaceEnvironmentSnapshot['vendoredNode'];
    projectNodeExpectation?: WorkspaceProjectNodeExpectation;
    sandboxPolicySummary: WorkspaceEnvironmentSnapshot['sandboxPolicySummary'];
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
        platform: input.platform,
        shellFamily: input.shellFamily,
        shellExecutable: input.shellExecutable,
        markers: input.markers,
        availableCommands: input.availableCommands,
        effectivePreferences,
        vendoredNode: input.vendoredNode,
        ...(input.projectNodeExpectation ? { projectNodeExpectation: input.projectNodeExpectation } : {}),
    });

    return {
        platform: input.platform,
        shellFamily: input.shellFamily,
        ...(input.shellExecutable ? { shellExecutable: input.shellExecutable } : {}),
        workspaceRootPath: input.workspaceRootPath,
        ...(input.baseWorkspaceRootPath ? { baseWorkspaceRootPath: input.baseWorkspaceRootPath } : {}),
        markers: input.markers,
        availableCommands: input.availableCommands,
        detectedPreferences,
        effectivePreferences,
        overrides: input.overrides,
        vendoredNode: input.vendoredNode,
        ...(input.projectNodeExpectation ? { projectNodeExpectation: input.projectNodeExpectation } : {}),
        sandboxPolicySummary: input.sandboxPolicySummary,
        notes,
    };
}

export const buildWorkspaceEnvironmentInspection = resolveWorkspaceEnvironmentInspection;
