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
    WorkspacePreferredPackageManager,
    WorkspacePreferredVcs,
} from '@/app/backend/runtime/contracts/types/runtime';

function isNodeWorkspace(markers: WorkspaceEnvironmentMarkers): boolean {
    return markers.hasPackageJson || markers.hasTsconfigJson;
}

function isPythonWorkspace(markers: WorkspaceEnvironmentMarkers): boolean {
    return markers.hasPyprojectToml || markers.hasRequirementsTxt;
}

function detectVcs(
    markers: WorkspaceEnvironmentMarkers,
    availableCommands: WorkspaceEnvironmentCommandAvailability
): WorkspaceDetectedVcs {
    if (markers.hasJjDirectory && availableCommands.jj.available) {
        return 'jj';
    }

    if (markers.hasGitDirectory && availableCommands.git.available) {
        return 'git';
    }

    return 'unknown';
}

function detectPackageManager(
    markers: WorkspaceEnvironmentMarkers,
    availableCommands: WorkspaceEnvironmentCommandAvailability
): WorkspaceDetectedPackageManager {
    if (markers.hasPnpmLock) {
        return availableCommands.pnpm.available ? 'pnpm' : 'unknown';
    }

    if (markers.hasPackageLock) {
        return availableCommands.npm.available ? 'npm' : 'unknown';
    }

    if (markers.hasYarnLock) {
        return availableCommands.yarn.available ? 'yarn' : 'unknown';
    }

    if (markers.hasBunLock) {
        return availableCommands.bun.available ? 'bun' : 'unknown';
    }

    return 'unknown';
}

function detectRuntime(
    markers: WorkspaceEnvironmentMarkers,
    availableCommands: WorkspaceEnvironmentCommandAvailability
): WorkspaceDetectedRuntimeFamily {
    if (isNodeWorkspace(markers) && availableCommands.node.available) {
        return 'node';
    }

    if (isPythonWorkspace(markers) && (availableCommands.python.available || availableCommands.python3.available)) {
        return 'python';
    }

    return 'unknown';
}

function detectScriptRunner(
    markers: WorkspaceEnvironmentMarkers,
    availableCommands: WorkspaceEnvironmentCommandAvailability
): WorkspaceDetectedScriptRunner {
    if (isNodeWorkspace(markers)) {
        if (availableCommands.tsx.available) {
            return 'tsx';
        }

        if (availableCommands.node.available) {
            return 'node';
        }
    }

    if (isPythonWorkspace(markers) && (availableCommands.python.available || availableCommands.python3.available)) {
        return 'python';
    }

    return 'unknown';
}

function resolveDetectedVcsAvailability(
    family: WorkspaceDetectedVcs,
    availableCommands: WorkspaceEnvironmentCommandAvailability
): boolean {
    if (family === 'jj') {
        return availableCommands.jj.available;
    }

    if (family === 'git') {
        return availableCommands.git.available;
    }

    return false;
}

function resolveDetectedPackageManagerAvailability(
    family: WorkspaceDetectedPackageManager,
    availableCommands: WorkspaceEnvironmentCommandAvailability
): boolean {
    if (family === 'pnpm') {
        return availableCommands.pnpm.available;
    }

    if (family === 'npm') {
        return availableCommands.npm.available;
    }

    if (family === 'yarn') {
        return availableCommands.yarn.available;
    }

    if (family === 'bun') {
        return availableCommands.bun.available;
    }

    return false;
}

function resolveVcsPreference(input: {
    detectedFamily: WorkspaceDetectedVcs;
    override: WorkspacePreferredVcs;
    availableCommands: WorkspaceEnvironmentCommandAvailability;
}): WorkspaceEnvironmentEffectivePreferences['vcs'] {
    if (input.override === 'auto') {
        return {
            family: input.detectedFamily,
            source: 'detected',
            requestedOverride: 'auto',
            available: resolveDetectedVcsAvailability(input.detectedFamily, input.availableCommands),
            mismatch: false,
        };
    }

    return {
        family: input.override,
        source: 'override',
        requestedOverride: input.override,
        available: input.override === 'jj' ? input.availableCommands.jj.available : input.availableCommands.git.available,
        mismatch: input.override === 'jj' ? !input.availableCommands.jj.available : !input.availableCommands.git.available,
    };
}

function resolvePackageManagerPreference(input: {
    detectedFamily: WorkspaceDetectedPackageManager;
    override: WorkspacePreferredPackageManager;
    availableCommands: WorkspaceEnvironmentCommandAvailability;
}): WorkspaceEnvironmentEffectivePreferences['packageManager'] {
    if (input.override === 'auto') {
        return {
            family: input.detectedFamily,
            source: 'detected',
            requestedOverride: 'auto',
            available: resolveDetectedPackageManagerAvailability(input.detectedFamily, input.availableCommands),
            mismatch: false,
        };
    }

    const available =
        input.override === 'pnpm'
            ? input.availableCommands.pnpm.available
            : input.override === 'npm'
              ? input.availableCommands.npm.available
              : input.override === 'yarn'
                ? input.availableCommands.yarn.available
                : input.availableCommands.bun.available;

    return {
        family: input.override,
        source: 'override',
        requestedOverride: input.override,
        available,
        mismatch: !available,
    };
}

export function buildWorkspaceEnvironmentDetectedPreferences(input: {
    vcs: WorkspaceDetectedVcs;
    packageManager: WorkspaceDetectedPackageManager;
    runtime: WorkspaceDetectedRuntimeFamily;
    scriptRunner: WorkspaceDetectedScriptRunner;
}): WorkspaceEnvironmentDetectedPreferences {
    return {
        vcs: input.vcs,
        packageManager: input.packageManager,
        runtime: input.runtime,
        scriptRunner: input.scriptRunner,
    };
}

export function resolveWorkspaceEnvironmentDetectedPreferences(input: {
    markers: WorkspaceEnvironmentMarkers;
    availableCommands: WorkspaceEnvironmentCommandAvailability;
}): WorkspaceEnvironmentDetectedPreferences {
    return buildWorkspaceEnvironmentDetectedPreferences({
        vcs: detectVcs(input.markers, input.availableCommands),
        packageManager: detectPackageManager(input.markers, input.availableCommands),
        runtime: detectRuntime(input.markers, input.availableCommands),
        scriptRunner: detectScriptRunner(input.markers, input.availableCommands),
    });
}

export function resolveWorkspaceEnvironmentPreferencePolicy(input: {
    detectedPreferences: WorkspaceEnvironmentDetectedPreferences;
    overrides: WorkspaceEnvironmentOverrides;
    availableCommands: WorkspaceEnvironmentCommandAvailability;
}): WorkspaceEnvironmentEffectivePreferences {
    return {
        vcs: resolveVcsPreference({
            detectedFamily: input.detectedPreferences.vcs,
            override: input.overrides.preferredVcs,
            availableCommands: input.availableCommands,
        }),
        packageManager: resolvePackageManagerPreference({
            detectedFamily: input.detectedPreferences.packageManager,
            override: input.overrides.preferredPackageManager,
            availableCommands: input.availableCommands,
        }),
        runtime: input.detectedPreferences.runtime,
        scriptRunner: input.detectedPreferences.scriptRunner,
    };
}

export const buildWorkspaceEnvironmentPreferencePolicy = resolveWorkspaceEnvironmentPreferencePolicy;
