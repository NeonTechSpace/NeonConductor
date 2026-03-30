import type {
    WorkspaceDetectedPackageManager,
    WorkspaceDetectedRuntimeFamily,
    WorkspaceDetectedScriptRunner,
    WorkspaceDetectedVcs,
    WorkspaceEnvironmentCommandAvailability,
    WorkspaceEnvironmentDetectedPreferences,
    WorkspaceEnvironmentEffectivePreferences,
    WorkspaceEnvironmentMarkers,
    WorkspaceEnvironmentOverrides,
    WorkspaceEnvironmentSnapshot,
} from '@/app/backend/runtime/contracts/types/runtime';

export type SupportedPlatform = WorkspaceEnvironmentSnapshot['platform'];

export interface WorkspaceCommandAvailabilitySnapshot extends WorkspaceEnvironmentCommandAvailability {}

export interface WorkspaceMarkerSnapshot extends WorkspaceEnvironmentMarkers {}

export interface WorkspaceDetectedPreferenceSnapshot extends WorkspaceEnvironmentDetectedPreferences {
    vcs: WorkspaceDetectedVcs;
    packageManager: WorkspaceDetectedPackageManager;
    runtime: WorkspaceDetectedRuntimeFamily;
    scriptRunner: WorkspaceDetectedScriptRunner;
}

export interface WorkspaceEffectivePreferenceSnapshot extends WorkspaceEnvironmentEffectivePreferences {}

export interface WorkspaceEnvironmentInspectionContext {
    platform: SupportedPlatform;
    shellFamily: WorkspaceEnvironmentSnapshot['shellFamily'];
    workspaceRootPath: string;
    baseWorkspaceRootPath?: string;
    overrides: WorkspaceEnvironmentOverrides;
}
