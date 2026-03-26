import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { collectSourceFiles } from '@/scripts/audit/sourceFiles';

import type {
    AuditCategoryReport,
    AuditSourceFile,
    ReviewManifestEntry,
    ReviewManifestFile,
    ReviewedAuditViolation,
    ReviewManifestStatus,
    ReviewStatus,
} from '@/scripts/audit/types';


export const REVIEW_MANIFEST_RELATIVE_PATH = 'scripts/audit/agents-review-manifest.json';

export function buildContentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

export function getReviewManifestPath(rootDir: string): string {
    return path.join(rootDir, REVIEW_MANIFEST_RELATIVE_PATH);
}

export function loadReviewManifest(rootDir: string): ReviewManifestFile {
    const manifestPath = getReviewManifestPath(rootDir);
    if (!existsSync(manifestPath)) {
        return { entries: [] };
    }

    const rawContent = readFileSync(manifestPath, 'utf8').trim();
    if (rawContent.length === 0) {
        return { entries: [] };
    }

    const parsedValue = JSON.parse(rawContent) as Partial<ReviewManifestFile>;
    return {
        entries: Array.isArray(parsedValue.entries) ? parsedValue.entries : [],
    };
}

export function saveReviewManifest(rootDir: string, manifest: ReviewManifestFile): void {
    const normalizedEntries = [...manifest.entries].sort((leftEntry, rightEntry) => {
        const leftKey = buildManifestKey(leftEntry);
        const rightKey = buildManifestKey(rightEntry);
        return leftKey.localeCompare(rightKey);
    });

    writeFileSync(
        getReviewManifestPath(rootDir),
        `${JSON.stringify({ entries: normalizedEntries }, null, 2)}\n`,
        'utf8'
    );
}

function buildManifestKey(entry: Pick<ReviewManifestEntry, 'path' | 'category'>): string {
    return `${entry.category}::${entry.path}`;
}

function classifyReviewStatus(
    manifestEntry: ReviewManifestEntry | undefined,
    currentContentHash: string
): { reviewStatus: ReviewStatus; reviewNote?: string; reviewDate?: string } {
    if (!manifestEntry) {
        return { reviewStatus: 'new' };
    }

    if (manifestEntry.contentHash !== currentContentHash) {
        const staleResult: { reviewStatus: ReviewStatus; reviewNote?: string; reviewDate?: string } = {
            reviewStatus: 'stale',
        };
        if (manifestEntry.note !== undefined) {
            staleResult.reviewNote = manifestEntry.note;
        }
        if (manifestEntry.reviewedAt !== undefined) {
            staleResult.reviewDate = manifestEntry.reviewedAt;
        }
        return staleResult;
    }

    const reviewedResult: { reviewStatus: ReviewStatus; reviewNote?: string; reviewDate?: string } = {
        reviewStatus: manifestEntry.status,
    };
    if (manifestEntry.note !== undefined) {
        reviewedResult.reviewNote = manifestEntry.note;
    }
    if (manifestEntry.reviewedAt !== undefined) {
        reviewedResult.reviewDate = manifestEntry.reviewedAt;
    }
    return reviewedResult;
}

export function getCurrentFileContentHash(rootDir: string, relativePath: string): string {
    const sourceFiles = collectSourceFiles(rootDir);
    const targetFile = sourceFiles.find((sourceFile) => sourceFile.relativePath === relativePath);
    if (!targetFile) {
        throw new Error(`Cannot review missing source file: ${relativePath}`);
    }

    return buildContentHash(targetFile.content);
}

export function setReviewManifestEntry(input: {
    rootDir: string;
    path: string;
    category: string;
    status: ReviewManifestStatus;
    note?: string;
    reviewedAt?: string;
}): ReviewManifestFile {
    const manifest = loadReviewManifest(input.rootDir);
    const currentContentHash = getCurrentFileContentHash(input.rootDir, input.path);
    const reviewedAt = input.reviewedAt ?? new Date().toISOString().slice(0, 10);

    const nextEntry: ReviewManifestEntry = {
        path: input.path,
        category: input.category,
        contentHash: currentContentHash,
        status: input.status,
        reviewedAt,
    };
    if (input.note !== undefined) {
        nextEntry.note = input.note;
    }

    const entryIndex = manifest.entries.findIndex(
        (entry) => entry.path === input.path && entry.category === input.category
    );
    if (entryIndex === -1) {
        manifest.entries.push(nextEntry);
    } else {
        manifest.entries[entryIndex] = nextEntry;
    }

    saveReviewManifest(input.rootDir, manifest);
    return manifest;
}

export function removeReviewManifestEntry(input: {
    rootDir: string;
    path: string;
    category: string;
}): ReviewManifestFile {
    const manifest = loadReviewManifest(input.rootDir);
    const nextEntries = manifest.entries.filter(
        (entry) => !(entry.path === input.path && entry.category === input.category)
    );

    const nextManifest: ReviewManifestFile = { entries: nextEntries };
    saveReviewManifest(input.rootDir, nextManifest);
    return nextManifest;
}

export function refreshStaleReviewEntries(rootDir: string): ReviewManifestFile {
    const manifest = loadReviewManifest(rootDir);
    const sourceFiles = collectSourceFiles(rootDir);
    const fileHashByPath = new Map(
        sourceFiles.map((file) => [file.relativePath, buildContentHash(file.content)] as const)
    );

    const refreshedEntries = manifest.entries
        .filter((entry) => fileHashByPath.has(entry.path))
        .map((entry) => {
            const currentContentHash = fileHashByPath.get(entry.path);
            if (!currentContentHash || currentContentHash === entry.contentHash) {
                return entry;
            }

            return {
                ...entry,
                contentHash: currentContentHash,
                reviewedAt: new Date().toISOString().slice(0, 10),
            };
        });

    const nextManifest: ReviewManifestFile = { entries: refreshedEntries };
    saveReviewManifest(rootDir, nextManifest);
    return nextManifest;
}

export function annotateReviewCategories(input: {
    rootDir: string;
    sourceFiles: AuditSourceFile[];
    categories: AuditCategoryReport[];
}): AuditCategoryReport[] {
    const manifest = loadReviewManifest(input.rootDir);
    const manifestEntries = new Map(manifest.entries.map((entry) => [buildManifestKey(entry), entry] as const));
    const fileHashByPath = new Map(
        input.sourceFiles.map((file) => [file.relativePath, buildContentHash(file.content)] as const)
    );

    return input.categories.map((category) => {
        if (category.lane !== 'manual-review' && category.lane !== 'actionable-review') {
            return category;
        }

        const reviewedViolations: ReviewedAuditViolation[] = category.violations.map((violation) => {
            const contentHash = fileHashByPath.get(violation.path) ?? '';
            const manifestEntry = manifestEntries.get(
                buildManifestKey({ path: violation.path, category: category.key })
            );
            const reviewMetadata = classifyReviewStatus(manifestEntry, contentHash);

            return {
                ...violation,
                contentHash,
                ...reviewMetadata,
            };
        });

        return {
            ...category,
            violations: reviewedViolations,
        };
    });
}

