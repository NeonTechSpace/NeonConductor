import type { DiffFileArtifact, DiffRecord } from '@/app/backend/persistence/types';
import type {
    DiffDirectoryOverview,
    DiffHighlightedFileOverview,
    DiffOverview,
    DiffStatusCounts,
} from '@/app/backend/runtime/contracts';

function emptyStatusCounts(): DiffStatusCounts {
    return {
        added: 0,
        modified: 0,
        deleted: 0,
        renamed: 0,
        copied: 0,
        type_changed: 0,
        untracked: 0,
    };
}

function buildStatusCounts(files: DiffFileArtifact[]): DiffStatusCounts {
    const counts = emptyStatusCounts();
    for (const file of files) {
        counts[file.status] += 1;
    }
    return counts;
}

function directoryName(path: string): string {
    const parts = path.split('/');
    return parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
}

function buildTopDirectories(files: DiffFileArtifact[]): DiffDirectoryOverview[] {
    const grouped = new Map<string, DiffDirectoryOverview>();
    for (const file of files) {
        const key = directoryName(file.path);
        const existing = grouped.get(key) ?? {
            directory: key,
            fileCount: 0,
            addedLines: 0,
            deletedLines: 0,
        };
        existing.fileCount += 1;
        existing.addedLines = (existing.addedLines ?? 0) + (file.addedLines ?? 0);
        existing.deletedLines = (existing.deletedLines ?? 0) + (file.deletedLines ?? 0);
        grouped.set(key, existing);
    }

    return [...grouped.values()]
        .sort((left, right) => {
            if (left.fileCount !== right.fileCount) {
                return right.fileCount - left.fileCount;
            }

            const leftMagnitude = (left.addedLines ?? 0) + (left.deletedLines ?? 0);
            const rightMagnitude = (right.addedLines ?? 0) + (right.deletedLines ?? 0);
            if (leftMagnitude !== rightMagnitude) {
                return rightMagnitude - leftMagnitude;
            }

            return left.directory.localeCompare(right.directory);
        })
        .slice(0, 3)
        .map((directory) => ({
            directory: directory.directory,
            fileCount: directory.fileCount,
            ...((directory.addedLines ?? 0) > 0 ? { addedLines: directory.addedLines } : {}),
            ...((directory.deletedLines ?? 0) > 0 ? { deletedLines: directory.deletedLines } : {}),
        }));
}

function buildHighlightedFiles(files: DiffFileArtifact[]): DiffHighlightedFileOverview[] {
    return [...files]
        .sort((left, right) => {
            const leftMagnitude = (left.addedLines ?? 0) + (left.deletedLines ?? 0);
            const rightMagnitude = (right.addedLines ?? 0) + (right.deletedLines ?? 0);
            if (leftMagnitude !== rightMagnitude) {
                return rightMagnitude - leftMagnitude;
            }

            return left.path.localeCompare(right.path);
        })
        .slice(0, 5)
        .map((file) => ({
            path: file.path,
            status: file.status,
            ...(typeof file.addedLines === 'number' ? { addedLines: file.addedLines } : {}),
            ...(typeof file.deletedLines === 'number' ? { deletedLines: file.deletedLines } : {}),
        }));
}

export function buildDiffOverview(diff: DiffRecord): DiffOverview {
    if (diff.artifact.kind === 'unsupported') {
        return {
            kind: 'unsupported',
            summary: diff.summary,
            reason: diff.artifact.reason,
            detail: diff.artifact.detail,
        };
    }

    return {
        kind: 'git',
        fileCount: diff.artifact.fileCount,
        summary: diff.summary,
        ...(typeof diff.artifact.totalAddedLines === 'number'
            ? { totalAddedLines: diff.artifact.totalAddedLines }
            : {}),
        ...(typeof diff.artifact.totalDeletedLines === 'number'
            ? { totalDeletedLines: diff.artifact.totalDeletedLines }
            : {}),
        statusCounts: buildStatusCounts(diff.artifact.files),
        topDirectories: buildTopDirectories(diff.artifact.files),
        highlightedFiles: buildHighlightedFiles(diff.artifact.files),
    };
}
