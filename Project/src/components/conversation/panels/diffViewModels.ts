import type { DiffFileArtifact, DiffRecord } from '@/app/backend/persistence/types';

import type { DiffOverview } from '@/shared/contracts';
import type { GitStatusEntry } from '@pierre/trees';

export type DiffPreviewScope = 'file' | 'run';
export type DiffRenderStyle = 'unified' | 'split';

export interface DiffTreeFileItem {
    addedLines?: number;
    deletedLines?: number;
    lineDeltaLabel: string | null;
    path: string;
    previousPath?: string;
    status: DiffFileArtifact['status'];
    statusLabel: string;
    treeStatus: GitStatusEntry['status'];
}

export interface DiffTreeViewModel {
    fileCount: number;
    files: readonly DiffTreeFileItem[];
    filesByPath: ReadonlyMap<string, DiffTreeFileItem>;
    gitStatus: readonly GitStatusEntry[];
    paths: readonly string[];
    signature: string;
}

const diffStatuses: ReadonlyArray<DiffFileArtifact['status']> = [
    'added',
    'modified',
    'deleted',
    'renamed',
    'copied',
    'type_changed',
    'untracked',
];

function mapTreeStatus(status: DiffFileArtifact['status']): GitStatusEntry['status'] {
    if (status === 'copied' || status === 'type_changed') {
        return 'modified';
    }

    return status;
}

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

export function formatDiffLineDeltaSummary(input: {
    addedLines?: number;
    deletedLines?: number;
}): string | null {
    const deltas = [
        formatDiffLineDelta('added', input.addedLines),
        formatDiffLineDelta('deleted', input.deletedLines),
    ].filter((value): value is string => Boolean(value));
    return deltas.length > 0 ? deltas.join(' / ') : null;
}

export function formatDiffDirectoryDetail(input: {
    fileCount: number;
    addedLines?: number;
    deletedLines?: number;
}): string {
    const lineDeltaSummary = formatDiffLineDeltaSummary(input);
    return lineDeltaSummary
        ? `${String(input.fileCount)} files · ${lineDeltaSummary.replace(' / ', ' · ')}`
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

export function buildDiffTreeViewModel(selectedDiff: DiffRecord): DiffTreeViewModel | undefined {
    if (selectedDiff.artifact.kind !== 'git') {
        return undefined;
    }

    const files = [...selectedDiff.artifact.files].sort((left, right) => left.path.localeCompare(right.path)).map(
        (file): DiffTreeFileItem => ({
            ...(typeof file.addedLines === 'number' ? { addedLines: file.addedLines } : {}),
            ...(typeof file.deletedLines === 'number' ? { deletedLines: file.deletedLines } : {}),
            ...(file.previousPath ? { previousPath: file.previousPath } : {}),
            lineDeltaLabel: formatDiffLineDeltaSummary(file),
            path: file.path,
            status: file.status,
            statusLabel: formatDiffStatusLabel(file.status),
            treeStatus: mapTreeStatus(file.status),
        })
    );
    const filesByPath = new Map(files.map((file) => [file.path, file]));

    return {
        fileCount: selectedDiff.artifact.fileCount,
        files,
        filesByPath,
        gitStatus: files.map((file) => ({
            path: file.path,
            status: file.treeStatus,
        })),
        paths: files.map((file) => file.path),
        signature: files
            .map(
                (file) =>
                    `${file.path}:${file.status}:${String(file.addedLines ?? 0)}:${String(file.deletedLines ?? 0)}`
            )
            .join('|'),
    };
}

export function buildPatchMarkdown(patch: string): string {
    return patch.length > 0 ? `\`\`\`diff\n${patch}\n\`\`\`` : '';
}
