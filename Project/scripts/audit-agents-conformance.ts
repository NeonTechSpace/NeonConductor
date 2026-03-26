import path from 'node:path';
import { pathToFileURL } from 'node:url';


import { buildAuditSummary, formatAuditWorklist } from '@/scripts/audit/reporting';
import { annotateReviewCategories } from '@/scripts/audit/reviewManifest';
import {
    collectAsyncOwnershipViolations,
    collectCallSiteCastViolations,
    collectPlaceholderQueryInputViolations,
} from '@/scripts/audit/rules/astActionableRules';
import {
    collectRepositoryTextFiles,
    collectSourceFiles,
    isElectronSourceFile,
    isGeneratedSourceFile,
    isParserSourceFile,
    isPreloadSourceFile,
    isRendererSourceFile,
    isSizeReviewException,
    isTestFile,
} from '@/scripts/audit/sourceFiles';
import { scriptLog } from '@/scripts/logger';

import type {
    AgentsConformanceReport,
    AuditCategoryReport,
    AuditWorklistOptions,
    AuditViolation,
    ReviewedAuditViolation,
} from '@/scripts/audit/types';

const REVIEW_SOURCE_LINES = 900;
const STRICT_REVIEW_SOURCE_LINES = 1200;
const TEST_FRAMEWORK_IMPORT_PATTERNS = ["from 'vitest'", 'from "vitest"', "from 'jest'", 'from "jest"'];
const BROAD_CAST_PATTERN = /\bas\s+[A-Z][A-Za-z0-9_<>,`'[\]|& ]+/;
const INLINE_LINT_SUPPRESSION_PATTERN = /\beslint-disable(?:-next-line|-line)?\b/;
function isAuditSupportFile(relativePath: string): boolean {
    return (
        relativePath === 'scripts/audit-agents-conformance.ts' ||
        relativePath === 'scripts/__tests__/audit-agents-conformance.test.ts' ||
        relativePath.startsWith('scripts/audit/')
    );
}

function collectPatternViolations(input: {
    files: ReturnType<typeof collectSourceFiles>;
    shouldInclude: (file: ReturnType<typeof collectSourceFiles>[number]) => boolean;
    shouldIncludeLine?: (file: ReturnType<typeof collectSourceFiles>[number], lineContent: string) => boolean;
    pattern: RegExp | string;
    message: string;
}): AuditViolation[] {
    const violations: AuditViolation[] = [];

    for (const file of input.files) {
        if (!input.shouldInclude(file)) {
            continue;
        }

        const lines = file.content.split(/\r?\n/);
        lines.forEach((lineContent, index) => {
            if (input.shouldIncludeLine && !input.shouldIncludeLine(file, lineContent)) {
                return;
            }

            const matches =
                typeof input.pattern === 'string'
                    ? lineContent.includes(input.pattern)
                    : (() => {
                          input.pattern.lastIndex = 0;
                          return input.pattern.test(lineContent);
                      })();

            if (matches) {
                violations.push({
                    path: file.relativePath,
                    line: index + 1,
                    message: input.message,
                });
            }
        });
    }

    return violations;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildAbsoluteMachinePathPatterns(rootDir: string): RegExp[] {
    const repositoryName = path.basename(path.resolve(rootDir, '..'));
    const escapedRepositoryName = escapeRegExp(repositoryName);
    const repositoryRootMarkerPattern = '(?:Project|Markdown|\\.github|AGENTS\\.md|README\\.md)';

    return [
        new RegExp(
            `\\b[A-Za-z]:\\\\(?:[^\\\\\\r\\n"'\\\`]+\\\\)*${escapedRepositoryName}\\\\${repositoryRootMarkerPattern}(?:\\\\|$)`
        ),
        new RegExp(
            `\\bfile:\\/\\/\\/[A-Za-z]:\\/(?:[^\\/\\r\\n"'\\\`]+\\/)*${escapedRepositoryName}\\/${repositoryRootMarkerPattern}(?:\\/|$)`
        ),
        new RegExp(
            `\\/[A-Za-z]:\\/(?:[^\\/\\r\\n"'\\\`]+\\/)*${escapedRepositoryName}\\/${repositoryRootMarkerPattern}(?:\\/|$)`
        ),
        new RegExp(
            `(?:^|[\\s("'\\\`])\\/(?:Users|home)\\/[^\\s"'\\\` )]+(?:\\/[^\\s"'\\\` )]+)*\\/${escapedRepositoryName}\\/${repositoryRootMarkerPattern}(?:\\/|$)`
        ),
    ];
}

function collectAbsoluteMachinePathViolations(input: {
    rootDir: string;
    files: ReturnType<typeof collectRepositoryTextFiles>;
}): AuditViolation[] {
    const violations: AuditViolation[] = [];
    const absoluteMachinePathPatterns = buildAbsoluteMachinePathPatterns(input.rootDir);

    for (const file of input.files) {
        if (isAuditSupportFile(file.relativePath)) {
            continue;
        }

        const lines = file.content.split(/\r?\n/);
        lines.forEach((lineContent, index) => {
            const hasAbsoluteMachinePath = absoluteMachinePathPatterns.some((pattern) => {
                pattern.lastIndex = 0;
                return pattern.test(lineContent);
            });

            if (!hasAbsoluteMachinePath) {
                return;
            }

            violations.push({
                path: file.relativePath,
                line: index + 1,
                message:
                    'Absolute machine-specific filesystem paths are not allowed; use repository-relative links or derive paths from local runtime context.',
            });
        });
    }

    return violations;
}

function isImportAliasLine(lineContent: string): boolean {
    return /^\s*[A-Za-z0-9_$]+\s+as\s+[A-Za-z0-9_$]+\s*,?\s*$/.test(lineContent);
}

function isIntentionalThrowLine(relativePath: string, lineContent: string): boolean {
    const trimmedLine = lineContent.trim();
    if (
        trimmedLine.startsWith('throw new InvariantError(') ||
        trimmedLine.startsWith('throw new DataCorruptionError(')
    ) {
        return true;
    }

    if (trimmedLine === 'throw error;' || trimmedLine === 'throw normalizedError;') {
        return true;
    }

    if (relativePath === 'src/lib/privacy/privacyContext.tsx' || relativePath === 'src/lib/theme/themeContext.tsx') {
        return trimmedLine.startsWith('throw new Error(');
    }

    if (relativePath === 'scripts/audit-agents-conformance.ts' || relativePath === 'scripts/doctor-desktop.ts') {
        return trimmedLine.startsWith('throw ');
    }

    if (relativePath === 'electron/backend/trpc/trpcErrorMap.ts') {
        return trimmedLine.startsWith('throw ');
    }

    if (relativePath.startsWith('electron/backend/trpc/routers/')) {
        return trimmedLine.includes('throw toTrpcError(');
    }

    return false;
}

function collectTestFrameworkImportViolations(files: ReturnType<typeof collectSourceFiles>): AuditViolation[] {
    return files.flatMap((file) => {
        if (isTestFile(file.relativePath) || isGeneratedSourceFile(file.relativePath, file.content)) {
            return [];
        }

        const lines = file.content.split(/\r?\n/);
        return lines.flatMap((lineContent, index) => {
            const trimmedLine = lineContent.trimStart();
            const importsTestFramework =
                trimmedLine.startsWith('import ') &&
                TEST_FRAMEWORK_IMPORT_PATTERNS.some((pattern) => lineContent.includes(pattern));
            const importsTestsDirectory =
                trimmedLine.startsWith('import ') &&
                (lineContent.includes("'__tests__/") ||
                    lineContent.includes('"__tests__/') ||
                    lineContent.includes('/__tests__/'));
            if (!importsTestFramework && !importsTestsDirectory) {
                return [];
            }

            return [
                {
                    path: file.relativePath,
                    line: index + 1,
                    message: 'Non-test source must not import test frameworks or __tests__ modules.',
                },
            ];
        });
    });
}

function isReactMemoizationLine(lineContent: string): boolean {
    return (
        lineContent.includes('useMemo(') ||
        lineContent.includes('useMemo<') ||
        lineContent.includes('useCallback(') ||
        lineContent.includes('useCallback<') ||
        lineContent.includes('memo(')
    );
}

function isForbiddenLayoutEffectLine(lineContent: string): boolean {
    return lineContent.includes('useLayoutEffect(') || lineContent.includes('useLayoutEffect<');
}

function collectRendererElectronImportViolations(files: ReturnType<typeof collectSourceFiles>): AuditViolation[] {
    return collectPatternViolations({
        files,
        shouldInclude: (file) => !isTestFile(file.relativePath) && isRendererSourceFile(file.relativePath),
        pattern: /from\s+['"]electron['"]/,
        message:
            'Renderer source must not import from electron directly; route access through preload or shared contracts.',
    });
}

function collectNonPreloadElectronBridgeViolations(files: ReturnType<typeof collectSourceFiles>): AuditViolation[] {
    const violations: AuditViolation[] = [];

    for (const file of files) {
        if (
            isTestFile(file.relativePath) ||
            isPreloadSourceFile(file.relativePath) ||
            (!isRendererSourceFile(file.relativePath) && !isElectronSourceFile(file.relativePath))
        ) {
            continue;
        }

        const lines = file.content.split(/\r?\n/);
        const lineIndex = lines.findIndex((lineContent) => {
            const trimmedLine = lineContent.trimStart();
            return !trimmedLine.startsWith('//') && /\b(?:ipcRenderer|contextBridge)\b/.test(lineContent);
        });

        if (lineIndex === -1) {
            continue;
        }

        violations.push({
            path: file.relativePath,
            line: lineIndex + 1,
            message: 'ipcRenderer and contextBridge are preload-only APIs.',
        });
    }

    return violations;
}

function countOccurrences(value: string, pattern: RegExp): number {
    const matches = value.match(pattern);
    return matches ? matches.length : 0;
}

function collectBrowserWindowSegments(
    file: ReturnType<typeof collectSourceFiles>[number]
): Array<{ line: number; content: string }> {
    const lines = file.content.split(/\r?\n/);
    const segments: Array<{ line: number; content: string }> = [];

    for (let index = 0; index < lines.length; index += 1) {
        const lineContent = lines[index] ?? '';
        if (!lineContent.includes('new BrowserWindow(')) {
            continue;
        }

        let braceDepth = 0;
        let startedObject = false;
        const segmentLines: string[] = [];
        const startLine = index + 1;

        for (let cursor = index; cursor < lines.length; cursor += 1) {
            const currentLine = lines[cursor] ?? '';
            segmentLines.push(currentLine);
            braceDepth += countOccurrences(currentLine, /\{/g);
            braceDepth -= countOccurrences(currentLine, /\}/g);
            if (currentLine.includes('{')) {
                startedObject = true;
            }

            if (startedObject && braceDepth <= 0) {
                index = cursor;
                break;
            }
        }

        segments.push({
            line: startLine,
            content: segmentLines.join('\n'),
        });
    }

    return segments;
}

function collectInsecureBrowserWindowViolations(files: ReturnType<typeof collectSourceFiles>): AuditViolation[] {
    const violations: AuditViolation[] = [];

    for (const file of files) {
        if (isTestFile(file.relativePath) || !isElectronSourceFile(file.relativePath)) {
            continue;
        }

        for (const segment of collectBrowserWindowSegments(file)) {
            const missingFlags: string[] = [];
            if (!segment.content.includes('contextIsolation: true')) {
                missingFlags.push('contextIsolation: true');
            }
            if (!segment.content.includes('nodeIntegration: false')) {
                missingFlags.push('nodeIntegration: false');
            }
            if (!segment.content.includes('sandbox: true')) {
                missingFlags.push('sandbox: true');
            }

            if (missingFlags.length === 0) {
                continue;
            }

            violations.push({
                path: file.relativePath,
                line: segment.line,
                message: `BrowserWindow must keep hardened webPreferences: missing or insecure ${missingFlags.join(', ')}.`,
            });
        }
    }

    return violations;
}

function collectAsyncEffectViolations(files: ReturnType<typeof collectSourceFiles>): AuditViolation[] {
    return collectPatternViolations({
        files,
        shouldInclude: (file) => !isTestFile(file.relativePath) && isRendererSourceFile(file.relativePath),
        pattern: /useEffect\s*\(\s*async\b/,
        message:
            'Do not write useEffect(async () => ...); keep the effect synchronous and call an inner async function.',
    });
}

function collectSuspiciousEffectViolations(files: ReturnType<typeof collectSourceFiles>): AuditViolation[] {
    const violations: AuditViolation[] = [];
    const setterPattern =
        /\b(?:set[A-Z][A-Za-z0-9_]*|input\.uiState\.set[A-Z][A-Za-z0-9_]*|uiState\.set[A-Z][A-Za-z0-9_]*)\s*\(/;
    const externalSyncPattern =
        /\b(?:addEventListener|removeEventListener|subscribe|unsubscribe|localStorage|sessionStorage|matchMedia|persist[A-Z]|prefetch|invalidate|setConnecting|setError|sendRendererReadySignal)\b/;
    const remoteMirrorPattern =
        /\b(?:[A-Za-z0-9_]+Query\.data\?\.(?:settings|profiles|profile|state)|selected[A-Z][A-Za-z0-9_]*|active[A-Z][A-Za-z0-9_]*|workspaceScope|firstSelectable[A-Z][A-Za-z0-9_]*|initial[A-Z][A-Za-z0-9_]*|default[A-Z][A-Za-z0-9_]*|input\.preference|input\.threads|input\.tags|input\.buckets|input\.selectedProviderId|input\.selectedModelId|resolvedProfileId|defaults\b|models\b|workspaceRoots\b)\b/;
    const allowedDialogLifecyclePattern =
        /\bif\s*\(!open\)\s*\{\s*return;\s*\}[\s\S]*\b(?:initialText|preferredResolution|forcedMode)\b/;
    const effectPattern = /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\}\s*,\s*\[[\s\S]*?\]\s*\)/g;

    for (const file of files) {
        if (isTestFile(file.relativePath) || !isRendererSourceFile(file.relativePath)) {
            continue;
        }

        let match: RegExpExecArray | null;
        while ((match = effectPattern.exec(file.content)) !== null) {
            const body = match[1] ?? '';
            if (!setterPattern.test(body)) {
                continue;
            }
            if (/\breturn\s*\(\s*\)\s*=>/.test(body)) {
                continue;
            }
            if (externalSyncPattern.test(body)) {
                continue;
            }
            if (allowedDialogLifecyclePattern.test(body)) {
                continue;
            }
            if (!remoteMirrorPattern.test(body)) {
                continue;
            }

            const line = file.content.slice(0, match.index).split(/\r?\n/).length;
            violations.push({
                path: file.relativePath,
                line,
                message:
                    'Review effect-driven state mirroring and replace it with derived state, a keyed draft reset, or an explicit reconciliation boundary.',
            });
        }
    }

    return violations;
}

function buildReportFromCategories(categories: AuditCategoryReport[]): AgentsConformanceReport {
    const findViolations = (key: string): ReviewedAuditViolation[] =>
        categories.find((category) => category.key === key)?.violations ?? [];
    const summary = buildAuditSummary(categories);

    return {
        handwrittenSourceFilesRequiringReview: findViolations('handwritten-source-review'),
        handwrittenSourceFilesRequiringStrictReview: findViolations('handwritten-source-strict-review'),
        absoluteMachinePaths: findViolations('absolute-machine-paths'),
        inlineLintSuppressions: findViolations('inline-lint-suppressions'),
        nonTestFrameworkImports: findViolations('non-test-framework-imports'),
        forbiddenLayoutEffects: findViolations('forbidden-layout-effects'),
        rendererElectronImports: findViolations('renderer-electron-imports'),
        nonPreloadElectronBridgeUsage: findViolations('non-preload-electron-bridge-usage'),
        insecureBrowserWindows: findViolations('insecure-browserwindows'),
        actionableAsyncOwnership: findViolations('actionable-async-ownership'),
        actionablePlaceholderQueryInputs: findViolations('actionable-placeholder-query-inputs'),
        actionableCallSiteCasts: findViolations('actionable-call-site-casts'),
        nonBlockingReactMemoization: findViolations('manual-react-memoization'),
        nonBlockingSuspiciousEffects: findViolations('manual-suspicious-effects'),
        nonBlockingAsyncEffects: findViolations('manual-async-effects'),
        nonBlockingBroadCasts: findViolations('manual-broad-casts'),
        nonBlockingThrows: findViolations('manual-non-parser-throws'),
        categories,
        summary,
    };
}

function logViolations(label: string, violations: ReviewedAuditViolation[], level: 'warn' | 'error'): void {
    if (violations.length === 0) {
        scriptLog.info({
            tag: 'agents.audit',
            message: `${label}: none found.`,
        });
        return;
    }

    scriptLog[level]({
        tag: 'agents.audit',
        message: `${label}: ${String(violations.length)} issue(s).`,
        violations,
    });
}

function logReport(report: AgentsConformanceReport, rootDir: string, reportOnly: boolean): void {
    for (const category of report.categories) {
        logViolations(category.label, category.violations, category.lane === 'blocking' ? 'error' : 'warn');
    }

    scriptLog.info({
        tag: 'agents.audit',
        message: 'AGENTS conformance audit completed.',
        rootDir,
        blockingViolations: hasBlockingViolations(report),
        actionableReviewRequired: hasActionableReviewCandidates(report),
        manualReviewRequired: hasManualReviewCandidates(report),
        reportOnly,
        overallStatus: report.summary.overallStatus,
    });
}

export function auditAgentsConformance(rootDir: string): AgentsConformanceReport {
    const sourceFiles = collectSourceFiles(rootDir);
    const repositoryTextFiles = collectRepositoryTextFiles(rootDir);
    const handwrittenFiles = sourceFiles.filter(
        (file) => !isSizeReviewException(file.relativePath, file.content) && !isAuditSupportFile(file.relativePath)
    );

    const categories: AuditCategoryReport[] = [
        {
            key: 'handwritten-source-review',
            label: `Handwritten source files requiring ${String(REVIEW_SOURCE_LINES)}+ LOC review`,
            lane: 'manual-review',
            violations: handwrittenFiles
                .filter((file) => file.lineCount >= REVIEW_SOURCE_LINES)
                .map((file) => ({
                    path: file.relativePath,
                    line: file.lineCount,
                    message: `Handwritten source file meets or exceeds ${String(REVIEW_SOURCE_LINES)} lines and requires manual cohesion review.`,
                })),
        },
        {
            key: 'handwritten-source-strict-review',
            label: `Handwritten source files requiring ${String(STRICT_REVIEW_SOURCE_LINES)}+ LOC strict review`,
            lane: 'manual-review',
            violations: handwrittenFiles
                .filter((file) => file.lineCount >= STRICT_REVIEW_SOURCE_LINES)
                .map((file) => ({
                    path: file.relativePath,
                    line: file.lineCount,
                    message: `Handwritten source file meets or exceeds ${String(STRICT_REVIEW_SOURCE_LINES)} lines and requires strict manual review.`,
                })),
        },
        {
            key: 'absolute-machine-paths',
            label: 'Absolute machine path violations',
            lane: 'blocking',
            violations: collectAbsoluteMachinePathViolations({
                rootDir,
                files: repositoryTextFiles,
            }),
        },
        {
            key: 'inline-lint-suppressions',
            label: 'Inline lint suppressions',
            lane: 'blocking',
            violations: collectPatternViolations({
                files: sourceFiles,
                shouldInclude: (file) => !isGeneratedSourceFile(file.relativePath, file.content),
                pattern: INLINE_LINT_SUPPRESSION_PATTERN,
                message: 'Inline lint suppressions are not allowed in handwritten source.',
            }),
        },
        {
            key: 'non-test-framework-imports',
            label: 'Non-test framework imports',
            lane: 'blocking',
            violations: collectTestFrameworkImportViolations(sourceFiles),
        },
        {
            key: 'forbidden-layout-effects',
            label: 'Forbidden useLayoutEffect review',
            lane: 'blocking',
            violations: collectPatternViolations({
                files: sourceFiles,
                shouldInclude: (file) => !isTestFile(file.relativePath) && isRendererSourceFile(file.relativePath),
                pattern: 'useLayoutEffect',
                shouldIncludeLine: (_file, lineContent) => isForbiddenLayoutEffectLine(lineContent),
                message:
                    'useLayoutEffect is not allowed unless the file is explicitly allowlisted for a proven pre-paint layout need.',
            }),
        },
        {
            key: 'renderer-electron-imports',
            label: 'Renderer electron import violations',
            lane: 'blocking',
            violations: collectRendererElectronImportViolations(sourceFiles),
        },
        {
            key: 'non-preload-electron-bridge-usage',
            label: 'Non-preload Electron bridge usage',
            lane: 'blocking',
            violations: collectNonPreloadElectronBridgeViolations(sourceFiles),
        },
        {
            key: 'insecure-browserwindows',
            label: 'BrowserWindow hardening violations',
            lane: 'blocking',
            violations: collectInsecureBrowserWindowViolations(sourceFiles),
        },
        {
            key: 'actionable-async-ownership',
            label: 'Async ownership review',
            lane: 'actionable-review',
            violations: collectAsyncOwnershipViolations(sourceFiles),
        },
        {
            key: 'actionable-placeholder-query-inputs',
            label: 'Placeholder query input review',
            lane: 'actionable-review',
            violations: collectPlaceholderQueryInputViolations(sourceFiles),
        },
        {
            key: 'actionable-call-site-casts',
            label: 'Call-site cast review',
            lane: 'actionable-review',
            violations: collectCallSiteCastViolations(sourceFiles),
        },
        {
            key: 'manual-react-memoization',
            label: 'React memoization review',
            lane: 'manual-review',
            violations: collectPatternViolations({
                files: sourceFiles,
                shouldInclude: (file) => !isTestFile(file.relativePath) && isRendererSourceFile(file.relativePath),
                pattern: 'useMemo',
                shouldIncludeLine: (_file, lineContent) => isReactMemoizationLine(lineContent),
                message: 'Review defensive React memoization and remove it unless compiler coverage is known to miss.',
            }),
        },
        {
            key: 'manual-suspicious-effects',
            label: 'Suspicious effect review',
            lane: 'manual-review',
            violations: collectSuspiciousEffectViolations(sourceFiles),
        },
        {
            key: 'manual-async-effects',
            label: 'Async effect review',
            lane: 'manual-review',
            violations: collectAsyncEffectViolations(sourceFiles),
        },
        {
            key: 'manual-broad-casts',
            label: 'Broad cast review',
            lane: 'manual-review',
            violations: collectPatternViolations({
                files: sourceFiles,
                shouldInclude: (file) => !isTestFile(file.relativePath) && !isAuditSupportFile(file.relativePath),
                shouldIncludeLine: (_file, lineContent) => {
                    const trimmedLine = lineContent.trimStart();
                    return (
                        !trimmedLine.startsWith('import ') &&
                        !trimmedLine.startsWith('export {') &&
                        !isImportAliasLine(lineContent)
                    );
                },
                pattern: BROAD_CAST_PATTERN,
                message: 'Review broad type cast and replace it with a validated boundary where possible.',
            }),
        },
        {
            key: 'manual-non-parser-throws',
            label: 'Non-parser throw review',
            lane: 'manual-review',
            violations: collectPatternViolations({
                files: sourceFiles,
                shouldInclude: (file) =>
                    !isTestFile(file.relativePath) &&
                    !isParserSourceFile(file.relativePath) &&
                    !isAuditSupportFile(file.relativePath),
                shouldIncludeLine: (file, lineContent) => !isIntentionalThrowLine(file.relativePath, lineContent),
                pattern: /\bthrow\b/,
                message:
                    'Review non-parser throw and confirm it is an invariant, data-corruption, or impossible-readback case.',
            }),
        },
    ];

    const annotatedCategories = annotateReviewCategories({
        rootDir,
        sourceFiles,
        categories,
    });

    return buildReportFromCategories(annotatedCategories);
}

export function hasBlockingViolations(report: AgentsConformanceReport): boolean {
    return report.categories.some((category) => category.lane === 'blocking' && category.violations.length > 0);
}

export function hasActionableReviewCandidates(report: AgentsConformanceReport): boolean {
    return report.summary.unresolvedActionableCount > 0;
}

export function hasManualReviewCandidates(report: AgentsConformanceReport): boolean {
    return report.summary.manualReviewOutstandingCount > 0;
}

export function runAgentsConformanceAudit(
    options: {
        rootDir?: string;
        reportOnly?: boolean;
        outputMode?: 'log' | 'json' | 'worklist';
        worklistOptions?: AuditWorklistOptions;
    } = {}
): AgentsConformanceReport {
    const rootDir = options.rootDir ?? process.cwd();
    const report = auditAgentsConformance(rootDir);
    const outputMode = options.outputMode ?? 'log';

    if (outputMode === 'json') {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else if (outputMode === 'worklist') {
        process.stdout.write(`${formatAuditWorklist(report, options.worklistOptions)}\n`);
    } else {
        logReport(report, rootDir, options.reportOnly ?? false);
    }

    if (hasBlockingViolations(report) && !options.reportOnly) {
        throw new Error('AGENTS conformance audit failed.');
    }

    return report;
}

function isDirectExecution(importMetaUrl: string): boolean {
    const entryPath = process.argv[1];
    if (!entryPath) {
        return false;
    }

    return importMetaUrl === pathToFileURL(path.resolve(entryPath)).href;
}

if (isDirectExecution(import.meta.url)) {
    const outputMode = process.argv.includes('--json')
        ? 'json'
        : process.argv.includes('--worklist')
          ? 'worklist'
          : 'log';
    const laneOption = process.argv.find((argument) => argument.startsWith('--lane='))?.slice('--lane='.length);
    const categoryOption = process.argv
        .find((argument) => argument.startsWith('--category='))
        ?.slice('--category='.length);
    const worklistOptions: AuditWorklistOptions = {
        includeReviewed: process.argv.includes('--include-reviewed'),
        newOnly: process.argv.includes('--new-only'),
        staleOnly: process.argv.includes('--stale-only'),
    };
    if (laneOption === 'blocking' || laneOption === 'actionable-review' || laneOption === 'manual-review') {
        worklistOptions.lane = laneOption;
    }
    if (categoryOption !== undefined) {
        worklistOptions.category = categoryOption;
    }

    runAgentsConformanceAudit({
        reportOnly: process.argv.includes('--report'),
        outputMode,
        worklistOptions,
    });
}

