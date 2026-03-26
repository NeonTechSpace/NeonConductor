import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import type { AuditSourceFile } from '@/scripts/audit/types';

const SOURCE_FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const REPOSITORY_TEXT_FILE_EXTENSIONS = new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
    '.md',
    '.json',
    '.json5',
    '.yml',
    '.yaml',
]);
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'dist-electron', '.git', '.turbo', 'release']);
const SOURCE_ROOT_DIRECTORIES = ['src', 'electron', 'scripts'];

function normalizeRelativePath(rootDir: string, absolutePath: string): string {
    return path.relative(rootDir, absolutePath).replaceAll('\\', '/');
}

function shouldSkipDirectory(name: string): boolean {
    return SKIPPED_DIRECTORIES.has(name);
}

function isSourceFile(absolutePath: string): boolean {
    return SOURCE_FILE_EXTENSIONS.has(path.extname(absolutePath));
}

function isRepositoryTextFile(absolutePath: string): boolean {
    return REPOSITORY_TEXT_FILE_EXTENSIONS.has(path.extname(absolutePath));
}

export function isTestFile(relativePath: string): boolean {
    return (
        relativePath.includes('/__tests__/') ||
        relativePath.endsWith('.test.ts') ||
        relativePath.endsWith('.test.tsx') ||
        relativePath.endsWith('.test.js') ||
        relativePath.endsWith('.test.jsx') ||
        relativePath.endsWith('.spec.ts') ||
        relativePath.endsWith('.spec.tsx') ||
        relativePath.endsWith('.spec.js') ||
        relativePath.endsWith('.spec.jsx')
    );
}

export function isGeneratedSourceFile(relativePath: string, content: string): boolean {
    const fileName = path.basename(relativePath).toLowerCase();
    return (
        relativePath.includes('/__generated__/') ||
        relativePath.includes('/generated/') ||
        fileName.startsWith('generated') ||
        fileName.includes('.gen.') ||
        fileName.includes('.generated.') ||
        content.includes('@generated')
    );
}

export function isCanonicalAlphaBaselineMigration(relativePath: string): boolean {
    return relativePath === 'electron/backend/persistence/migrations/001_runtime_baseline.sql';
}

export function isSizeReviewException(relativePath: string, content: string): boolean {
    return isGeneratedSourceFile(relativePath, content) || isCanonicalAlphaBaselineMigration(relativePath);
}

export function isParserSourceFile(relativePath: string): boolean {
    return relativePath.includes('/parsers/') || relativePath.includes('/parse/');
}

export function isRendererSourceFile(relativePath: string): boolean {
    return relativePath.startsWith('src/');
}

export function isPreloadSourceFile(relativePath: string): boolean {
    return relativePath.startsWith('electron/main/preload/');
}

export function isElectronSourceFile(relativePath: string): boolean {
    return relativePath.startsWith('electron/');
}

function collectFilesFromRoots(input: {
    rootDir: string;
    roots: string[];
    shouldIncludeFile: (absolutePath: string) => boolean;
}): AuditSourceFile[] {
    const files: AuditSourceFile[] = [];
    const seenAbsolutePaths = new Set<string>();

    function walk(currentDirectory: string): void {
        for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                if (shouldSkipDirectory(entry.name)) {
                    continue;
                }

                walk(path.join(currentDirectory, entry.name));
                continue;
            }

            const absolutePath = path.join(currentDirectory, entry.name);
            if (!input.shouldIncludeFile(absolutePath) || seenAbsolutePaths.has(absolutePath)) {
                continue;
            }

            const content = readFileSync(absolutePath, 'utf8');
            const relativePath = normalizeRelativePath(input.rootDir, absolutePath);
            const lineCount = content.length === 0 ? 0 : content.split(/\r?\n/).length;
            seenAbsolutePaths.add(absolutePath);

            files.push({
                absolutePath,
                relativePath,
                content,
                lineCount,
            });
        }
    }

    for (const absoluteRoot of input.roots) {
        try {
            if (!existsSync(absoluteRoot)) {
                continue;
            }

            const rootStat = statSync(absoluteRoot);
            if (rootStat.isDirectory()) {
                walk(absoluteRoot);
                continue;
            }

            if (!input.shouldIncludeFile(absoluteRoot) || seenAbsolutePaths.has(absoluteRoot)) {
                continue;
            }

            const content = readFileSync(absoluteRoot, 'utf8');
            const relativePath = normalizeRelativePath(input.rootDir, absoluteRoot);
            const lineCount = content.length === 0 ? 0 : content.split(/\r?\n/).length;
            seenAbsolutePaths.add(absoluteRoot);

            files.push({
                absolutePath: absoluteRoot,
                relativePath,
                content,
                lineCount,
            });
        } catch (error) {
            if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
                continue;
            }

            throw error;
        }
    }

    return files;
}

function resolveRepositoryRoot(rootDir: string): string {
    const parentDir = path.resolve(rootDir, '..');
    const parentMarkers = ['AGENTS.md', '.git', 'Markdown', '.github'];
    return parentMarkers.some((marker) => existsSync(path.join(parentDir, marker))) ? parentDir : rootDir;
}

export function collectSourceFiles(rootDir: string): AuditSourceFile[] {
    return collectFilesFromRoots({
        rootDir,
        roots: SOURCE_ROOT_DIRECTORIES.map((sourceRoot) => path.join(rootDir, sourceRoot)),
        shouldIncludeFile: isSourceFile,
    });
}

export function collectRepositoryTextFiles(rootDir: string): AuditSourceFile[] {
    const repositoryRoot = resolveRepositoryRoot(rootDir);
    const roots = [rootDir];

    if (repositoryRoot !== rootDir) {
        roots.push(
            path.join(repositoryRoot, 'AGENTS.md'),
            path.join(repositoryRoot, 'CLAUDE.md'),
            path.join(repositoryRoot, 'Markdown'),
            path.join(repositoryRoot, '.github'),
            path.join(repositoryRoot, 'README.md')
        );
    }

    return collectFilesFromRoots({
        rootDir,
        roots,
        shouldIncludeFile: isRepositoryTextFile,
    });
}

