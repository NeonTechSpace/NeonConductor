import type { WorkspaceEnvironmentSnapshot } from '@/app/backend/runtime/contracts/types/runtime';

export function buildWorkspaceEnvironmentGuidance(snapshot: WorkspaceEnvironmentSnapshot): string {
    const lines = [
        `Effective root: ${snapshot.workspaceRootPath}.`,
        `Platform: ${snapshot.platform}. Shell family: ${snapshot.shellFamily}.`,
    ];

    if (snapshot.baseWorkspaceRootPath) {
        lines.push(`Base workspace root: ${snapshot.baseWorkspaceRootPath}.`);
    }

    if (snapshot.effectivePreferences.vcs.family !== 'unknown') {
        lines.push(`Preferred VCS: ${snapshot.effectivePreferences.vcs.family}.`);
    }

    if (snapshot.effectivePreferences.packageManager.family !== 'unknown') {
        lines.push(`Preferred package manager: ${snapshot.effectivePreferences.packageManager.family}.`);
    }

    return [...lines, ...snapshot.notes].join(' ');
}
