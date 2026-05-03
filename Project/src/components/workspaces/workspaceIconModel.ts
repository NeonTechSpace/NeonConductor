import type { WorkspaceIconSummary } from '@/shared/contracts';

export function buildWorkspaceIconImageSource(input: {
    profileId: string;
    workspaceFingerprint: string;
    updatedAt: string;
}): string {
    return `neon-workspace-icon://workspace-root-icon/${encodeURIComponent(input.profileId)}/${encodeURIComponent(
        input.workspaceFingerprint
    )}?v=${encodeURIComponent(input.updatedAt)}`;
}

export function formatWorkspaceIconState(summary: WorkspaceIconSummary): string {
    if (summary.kind === 'manual') {
        return 'Manual icon';
    }
    if (summary.kind === 'detected') {
        return summary.detectedRelativePath ? `Detected from ${summary.detectedRelativePath}` : 'Detected icon';
    }
    return 'Fallback icon';
}
