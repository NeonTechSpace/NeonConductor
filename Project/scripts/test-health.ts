import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export type TestHealthCategory =
    | 'runtime'
    | 'renderer-conversation'
    | 'providers'
    | 'renderer-settings'
    | 'trpc-contract'
    | 'persistence'
    | 'electron-main'
    | 'renderer-lib'
    | 'renderer-runtime'
    | 'scripts'
    | 'electron-shared'
    | 'other';

export interface TestHealthFile {
    path: string;
    category: TestHealthCategory;
    lineCount: number;
}

export interface TestHealthFinding {
    id: string;
    priority: 'P1' | 'P2';
    path: string;
    line: number;
    message: string;
}

export interface TestHealthReport {
    status: 'clear' | 'blocked';
    rootDir: string;
    testFileCount: number;
    categoryCounts: Record<TestHealthCategory, number>;
    findings: TestHealthFinding[];
}

const testFileHardLineLimit = 1200;
const testCategories: TestHealthCategory[] = [
    'runtime',
    'renderer-conversation',
    'providers',
    'renderer-settings',
    'trpc-contract',
    'persistence',
    'electron-main',
    'renderer-lib',
    'renderer-runtime',
    'scripts',
    'electron-shared',
    'other',
];

function shouldSkipDirectory(directoryName: string): boolean {
    return (
        directoryName === 'node_modules' ||
        directoryName === 'dist' ||
        directoryName === 'dist-electron' ||
        directoryName === '.tanstack'
    );
}

function collectTestFilePaths(rootDir: string, currentDir = rootDir): string[] {
    if (!existsSync(currentDir)) {
        return [];
    }

    const entries = readdirSync(currentDir, { withFileTypes: true });
    const files: string[] = [];
    for (const entry of entries) {
        const absolutePath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
            if (!shouldSkipDirectory(entry.name)) {
                files.push(...collectTestFilePaths(rootDir, absolutePath));
            }
            continue;
        }

        if (/\.test\.tsx?$/.test(entry.name)) {
            files.push(absolutePath);
        }
    }

    return files.sort((left, right) => left.localeCompare(right));
}

function normalizePath(rootDir: string, absolutePath: string): string {
    return path.relative(rootDir, absolutePath).replaceAll('\\', '/');
}

function countLines(content: string): number {
    if (content.length === 0) {
        return 0;
    }

    const lineCount = content.split(/\r?\n/).length;
    return /\r?\n$/.test(content) ? lineCount - 1 : lineCount;
}

export function classifyTestPath(relativePath: string): TestHealthCategory {
    if (relativePath.startsWith('electron/backend/trpc/__tests__/')) {
        return 'trpc-contract';
    }
    if (relativePath.startsWith('electron/backend/persistence/')) {
        return 'persistence';
    }
    if (relativePath.startsWith('electron/backend/runtime/')) {
        return 'runtime';
    }
    if (relativePath.startsWith('electron/backend/providers/')) {
        return 'providers';
    }
    if (relativePath.startsWith('electron/main/')) {
        return 'electron-main';
    }
    if (relativePath.startsWith('electron/shared/')) {
        return 'electron-shared';
    }
    if (relativePath.startsWith('src/components/conversation/')) {
        return 'renderer-conversation';
    }
    if (relativePath.startsWith('src/components/settings/')) {
        return 'renderer-settings';
    }
    if (relativePath.startsWith('src/components/runtime/')) {
        return 'renderer-runtime';
    }
    if (relativePath.startsWith('src/lib/')) {
        return 'renderer-lib';
    }
    if (relativePath.startsWith('scripts/')) {
        return 'scripts';
    }

    return 'other';
}

export function buildTestHealthReport(rootDir: string): TestHealthReport {
    const testFiles: TestHealthFile[] = collectTestFilePaths(rootDir).map((absolutePath) => {
        const content = readFileSync(absolutePath, 'utf8');
        const relativePath = normalizePath(rootDir, absolutePath);
        return {
            path: relativePath,
            category: classifyTestPath(relativePath),
            lineCount: countLines(content),
        };
    });

    const categoryCounts = Object.fromEntries(testCategories.map((category) => [category, 0])) as Record<
        TestHealthCategory,
        number
    >;
    for (const testFile of testFiles) {
        categoryCounts[testFile.category] += 1;
    }

    const findings: TestHealthFinding[] = testFiles
        .filter((testFile) => testFile.lineCount >= testFileHardLineLimit)
        .map((testFile) => ({
            id: `p1-oversized-test-file:${testFile.path}`,
            priority: 'P1' as const,
            path: testFile.path,
            line: testFile.lineCount,
            message: `Test file is ${String(testFile.lineCount)} lines; split or prune it below ${String(
                testFileHardLineLimit
            )} lines.`,
        }));

    return {
        status: findings.some((finding) => finding.priority === 'P1') ? 'blocked' : 'clear',
        rootDir,
        testFileCount: testFiles.length,
        categoryCounts,
        findings,
    };
}

export function formatTestHealthReport(report: TestHealthReport): string {
    const lines = ['Test health report', `status: ${report.status}`, `test-files: ${String(report.testFileCount)}`];
    for (const category of testCategories) {
        const count = report.categoryCounts[category];
        if (count > 0) {
            lines.push(`${category}: ${String(count)}`);
        }
    }

    if (report.findings.length > 0) {
        lines.push('', '## Findings');
        for (const finding of report.findings) {
            lines.push(`- ${finding.path}:${String(finding.line)} [${finding.id}] ${finding.message}`);
        }
    }

    return lines.join('\n');
}

function isDirectExecution(importMetaUrl: string): boolean {
    const entryPath = process.argv[1];
    if (!entryPath) {
        return false;
    }

    return importMetaUrl === pathToFileURL(path.resolve(entryPath)).href;
}

if (isDirectExecution(import.meta.url)) {
    const report = buildTestHealthReport(process.cwd());
    if (process.argv.includes('--json')) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
        process.stdout.write(`${formatTestHealthReport(report)}\n`);
    }
    if (process.argv.includes('--check') && report.status !== 'clear') {
        process.exitCode = 1;
    }
}
