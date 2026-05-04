import type { DiffFileArtifact } from '@/app/backend/persistence/types';

import type { DiffOverview } from '@/shared/contracts';

const diffStatuses: ReadonlyArray<DiffFileArtifact['status']> = [
    'added',
    'modified',
    'deleted',
    'renamed',
    'copied',
    'type_changed',
    'untracked',
];

export function formatDiffLineDelta(label: string, value: number | undefined): string | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return null;
    }

    return `${String(value)} ${label}`;
}

export function formatDiffStatusLabel(status: DiffFileArtifact['status']): string {
    if (status === 'type_changed') {
        return 'type';
    }

    return status;
}

export function formatDiffDirectoryDetail(input: {
    fileCount: number;
    addedLines?: number;
    deletedLines?: number;
}): string {
    const deltas = [
        formatDiffLineDelta('added', input.addedLines),
        formatDiffLineDelta('deleted', input.deletedLines),
    ].filter((value): value is string => Boolean(value));
    return deltas.length > 0
        ? `${String(input.fileCount)} files · ${deltas.join(' · ')}`
        : `${String(input.fileCount)} files`;
}

export function statusCountEntries(
    overview: Extract<DiffOverview, { kind: 'git' }>
): Array<{ status: DiffFileArtifact['status']; count: number }> {
    return diffStatuses
        .map((status) => ({
            status,
            count: overview.statusCounts[status],
        }))
        .filter((entry) => entry.count > 0);
}
