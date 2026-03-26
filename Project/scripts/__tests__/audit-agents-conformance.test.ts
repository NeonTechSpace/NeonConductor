import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { formatAuditWorklist } from '@/scripts/audit/reporting';
import { runAuditReviewCommandWithArgs } from '@/scripts/audit/review-command';
import { loadReviewManifest } from '@/scripts/audit/reviewManifest';
import {
    auditAgentsConformance,
    hasActionableReviewCandidates,
    hasBlockingViolations,
    hasManualReviewCandidates,
} from '@/scripts/audit-agents-conformance';

function writeFixture(rootDir: string, relativePath: string, content: string): void {
    const absolutePath = path.join(rootDir, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, 'utf8');
}

describe('auditAgentsConformance', () => {
    it('reports handwritten 1200+ LOC files for manual review without blocking on size alone', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'agents-audit-'));

        try {
            writeFixture(rootDir, 'src/tooLarge.ts', 'const value = 1;\n'.repeat(1200));

            const report = auditAgentsConformance(rootDir);

            expect(report.handwrittenSourceFilesRequiringReview).toHaveLength(1);
            expect(report.handwrittenSourceFilesRequiringStrictReview).toHaveLength(1);
            expect(hasBlockingViolations(report)).toBe(false);
            expect(hasManualReviewCandidates(report)).toBe(true);
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('still detects blocking AGENTS violations in handwritten source', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'agents-audit-'));

        try {
            writeFixture(
                rootDir,
                'src/withDisable.ts',
                `// ${['eslint', 'disable-next-line'].join('-')} no-console\nconst value = 1;\n`
            );
            writeFixture(rootDir, 'src/runtime.ts', "import { describe } from 'vitest';\n");

            const report = auditAgentsConformance(rootDir);

            expect(report.inlineLintSuppressions).toHaveLength(1);
            expect(report.nonTestFrameworkImports).toHaveLength(1);
            expect(hasBlockingViolations(report)).toBe(true);
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('detects absolute machine-specific paths in project files and sibling repo docs', () => {
        const repoRoot = mkdtempSync(path.join(os.tmpdir(), 'agents-audit-repo-'));
        const workspaceRoot = path.join(repoRoot, 'NeonConductor');
        const rootDir = path.join(workspaceRoot, 'Project');
        const absoluteProjectPath = 'file:///M:/Neonsy/Projects/NeonConductor/Project/index.ts';
        const absoluteReadmePath = '/m:/Neonsy/Projects/NeonConductor/Project/vite.config.ts';
        mkdirSync(rootDir, { recursive: true });

        try {
            writeFixture(rootDir, 'src/view.ts', `const absolutePath = '${absoluteProjectPath}';\n`);
            writeFixture(rootDir, 'README.md', `See [vite.config.ts](${absoluteReadmePath}).\n`);
            writeFileSync(
                path.join(workspaceRoot, 'AGENTS.md'),
                '# AGENTS.md\n- bad path: C:\\Users\\Neon\\Projects\\NeonConductor\\Project\\file.ts\n',
                'utf8'
            );

            const report = auditAgentsConformance(rootDir);

            expect(report.absoluteMachinePaths).toHaveLength(3);
            expect(report.absoluteMachinePaths.map((violation) => violation.path).sort()).toEqual([
                '../AGENTS.md',
                'README.md',
                'src/view.ts',
            ]);
            expect(hasBlockingViolations(report)).toBe(true);
        } finally {
            rmSync(repoRoot, { recursive: true, force: true });
        }
    });

    it('excludes generated files and the canonical baseline migration from size-based review buckets', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'agents-audit-'));

        try {
            writeFixture(
                rootDir,
                'electron/backend/persistence/generatedMigrations.ts',
                'const value = 1;\n'.repeat(1200)
            );
            writeFixture(
                rootDir,
                'electron/backend/persistence/migrations/001_runtime_baseline.sql',
                'SELECT 1;\n'.repeat(1200)
            );

            const report = auditAgentsConformance(rootDir);

            expect(report.handwrittenSourceFilesRequiringReview).toEqual([]);
            expect(report.handwrittenSourceFilesRequiringStrictReview).toEqual([]);
            expect(hasManualReviewCandidates(report)).toBe(false);
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('reports non-blocking memoization, cast, and throw candidates without counting parser files', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'agents-audit-'));

        try {
            writeFixture(
                rootDir,
                'src/view.tsx',
                "const value = useMemo<SomeType>(() => input as SomeType, [input]);\nthrow new Error('boom');\n"
            );
            writeFixture(
                rootDir,
                'src/runtime/contracts/parsers/example.ts',
                "export function parseValue(): never { throw new Error('invalid'); }\n"
            );

            const report = auditAgentsConformance(rootDir);

            expect(report.nonBlockingReactMemoization).toHaveLength(1);
            expect(report.nonBlockingBroadCasts).toHaveLength(1);
            expect(report.nonBlockingThrows).toHaveLength(1);
            expect(report.nonBlockingThrows[0]?.path).toBe('src/view.tsx');
            expect(hasBlockingViolations(report)).toBe(false);
            expect(hasManualReviewCandidates(report)).toBe(true);
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('treats useLayoutEffect as a blocking violation in renderer source', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'agents-audit-'));

        try {
            writeFixture(rootDir, 'src/view.tsx', 'function View() { useLayoutEffect(() => {}, []); return null; }\n');

            const report = auditAgentsConformance(rootDir);

            expect(report.forbiddenLayoutEffects).toHaveLength(1);
            expect(hasBlockingViolations(report)).toBe(true);
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('reports suspicious effect-driven state mirroring patterns', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'agents-audit-'));

        try {
            writeFixture(
                rootDir,
                'src/profile.tsx',
                "function View({ selectedProfile }) { const [renameValue, setRenameValue] = useState(''); useEffect(() => { setRenameValue(selectedProfile?.name ?? ''); }, [selectedProfile?.id, selectedProfile?.name]); return renameValue; }\n"
            );
            writeFixture(
                rootDir,
                'src/context.tsx',
                "function View({ globalSettingsQuery }) { const [percent, setPercent] = useState('90'); useEffect(() => { const settings = globalSettingsQuery.data?.settings; if (!settings) { return; } setPercent(String(settings.percent)); }, [globalSettingsQuery.data?.settings]); return percent; }\n"
            );
            writeFixture(
                rootDir,
                'src/diff.tsx',
                'function View({ firstSelectablePath, selectedDiff }) { const [selectedPath, setSelectedPath] = useState(undefined); useEffect(() => { setSelectedPath(firstSelectablePath); }, [firstSelectablePath, selectedDiff?.id]); return selectedPath; }\n'
            );

            const report = auditAgentsConformance(rootDir);

            expect([...report.nonBlockingSuspiciousEffects.map((violation) => violation.path)].sort()).toEqual([
                'src/context.tsx',
                'src/diff.tsx',
                'src/profile.tsx',
            ]);
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('allows keyed draft derivation without effect warnings', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'agents-audit-'));

        try {
            writeFixture(
                rootDir,
                'src/view.tsx',
                "function View({ selectedProfile, renameDraft }) { const renameValue = renameDraft?.profileId === selectedProfile?.id ? renameDraft.value : selectedProfile?.name ?? ''; return renameValue; }\n"
            );

            const report = auditAgentsConformance(rootDir);

            expect(report.nonBlockingSuspiciousEffects).toEqual([]);
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('allows TRPC transport-boundary throw toTrpcError patterns', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'agents-audit-'));

        try {
            writeFixture(
                rootDir,
                'electron/backend/trpc/routers/context/index.ts',
                'const value = result.match((ok) => ok, (error) => { throw toTrpcError(error); });\n'
            );

            const report = auditAgentsConformance(rootDir);

            expect(report.nonBlockingThrows).toEqual([]);
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('treats renderer electron imports, non-preload bridges, and insecure BrowserWindow configs as blocking violations', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'agents-audit-'));

        try {
            writeFixture(
                rootDir,
                'src/view.tsx',
                "import { shell } from 'electron';\nexport function View() { return shell; }\n"
            );
            writeFixture(
                rootDir,
                'electron/main/runtime.ts',
                "import { ipcRenderer } from 'electron';\nexport function read() { return ipcRenderer.sendSync('ping'); }\n"
            );
            writeFixture(
                rootDir,
                'electron/main/window.ts',
                "import { BrowserWindow } from 'electron';\nexport function createWindow() { return new BrowserWindow({ webPreferences: { nodeIntegration: false } }); }\n"
            );

            const report = auditAgentsConformance(rootDir);

            expect(report.rendererElectronImports).toHaveLength(1);
            expect(report.nonPreloadElectronBridgeUsage).toHaveLength(1);
            expect(report.insecureBrowserWindows).toHaveLength(1);
            expect(hasBlockingViolations(report)).toBe(true);
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('allows preload bridge usage and hardened BrowserWindow configs', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'agents-audit-'));

        try {
            writeFixture(
                rootDir,
                'electron/main/preload/index.ts',
                "import { contextBridge, ipcRenderer } from 'electron';\ncontextBridge.exposeInMainWorld('bridge', { ping: () => ipcRenderer.send('ping') });\n"
            );
            writeFixture(
                rootDir,
                'electron/main/window.ts',
                "import { BrowserWindow } from 'electron';\nexport function createWindow() { return new BrowserWindow({ webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } }); }\n"
            );

            const report = auditAgentsConformance(rootDir);

            expect(report.nonPreloadElectronBridgeUsage).toEqual([]);
            expect(report.insecureBrowserWindows).toEqual([]);
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('reports async useEffect as a non-blocking review warning', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'agents-audit-'));

        try {
            writeFixture(
                rootDir,
                'src/view.tsx',
                "function View() { useEffect(async () => { await fetch('/api'); }, []); return null; }\n"
            );

            const report = auditAgentsConformance(rootDir);

            expect(report.nonBlockingAsyncEffects).toHaveLength(1);
            expect(hasBlockingViolations(report)).toBe(false);
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('reports actionable async ownership, placeholder query inputs, and call-site casts', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'agents-audit-'));

        try {
            writeFixture(
                rootDir,
                'src/view.tsx',
                `
                async function saveDraft(): Promise<void> {}
                function View(query: { useQuery: Function }, mutation: { mutateAsync: Function }) {
                    void saveDraft();
                    void mutation.mutateAsync({ value: 1 });
                    const result = query.useQuery({ sessionId: 'sess_missing' });
                    const nextResult = query.useQuery({ sessionId: value as SessionId });
                    return [result, nextResult];
                }\n`
            );

            const report = auditAgentsConformance(rootDir);

            expect(report.actionableAsyncOwnership).toHaveLength(1);
            expect(report.actionablePlaceholderQueryInputs).toHaveLength(1);
            expect(report.actionableCallSiteCasts).toHaveLength(1);
            expect(hasActionableReviewCandidates(report)).toBe(true);
            expect(report.summary.overallStatus).toBe('manual-review-outstanding');
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('suppresses local async handlers that already own failures with try/catch', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'agents-audit-'));

        try {
            writeFixture(
                rootDir,
                'src/view.tsx',
                `
                async function safeSave(mutation: { mutateAsync: (input: { value: number }) => Promise<void> }) {
                    try {
                        await mutation.mutateAsync({ value: 1 });
                    } catch {
                        return;
                    }
                }
                function View(mutation: { mutateAsync: (input: { value: number }) => Promise<void> }) {
                    void safeSave(mutation);
                    return null;
                }\n`
            );

            const report = auditAgentsConformance(rootDir);

            expect(report.actionableAsyncOwnership).toEqual([]);
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('marks reviewed manual-review entries as reviewed-clean when the file hash matches the manifest', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'agents-audit-'));

        try {
            const content = 'const value = 1;\n'.repeat(950);
            writeFixture(rootDir, 'src/large.ts', content);
            writeFixture(
                rootDir,
                'scripts/audit/agents-review-manifest.json',
                JSON.stringify(
                    {
                        entries: [
                            {
                                path: 'src/large.ts',
                                category: 'handwritten-source-review',
                                contentHash: createHash('sha256').update(content).digest('hex').slice(0, 16),
                                status: 'reviewed-clean',
                                note: 'cohesive despite size',
                                reviewedAt: '2026-03-24',
                            },
                        ],
                    },
                    null,
                    2
                )
            );

            const report = auditAgentsConformance(rootDir);

            expect(report.handwrittenSourceFilesRequiringReview[0]?.reviewStatus).toBe('reviewed-clean');
            expect(report.summary.manualReviewOutstandingCount).toBe(0);
            expect(hasManualReviewCandidates(report)).toBe(false);
            expect(report.summary.overallStatus).toBe('clean');
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('marks reviewed manual-review entries as stale when the file hash changes', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'agents-audit-'));

        try {
            const staleContent = 'const oldValue = 1;\n'.repeat(950);
            writeFixture(rootDir, 'src/large.ts', 'const nextValue = 1;\n'.repeat(950));
            writeFixture(
                rootDir,
                'scripts/audit/agents-review-manifest.json',
                JSON.stringify(
                    {
                        entries: [
                            {
                                path: 'src/large.ts',
                                category: 'handwritten-source-review',
                                contentHash: createHash('sha256').update(staleContent).digest('hex').slice(0, 16),
                                status: 'reviewed-clean',
                                note: 'outdated review',
                                reviewedAt: '2026-03-24',
                            },
                        ],
                    },
                    null,
                    2
                )
            );

            const report = auditAgentsConformance(rootDir);

            expect(report.handwrittenSourceFilesRequiringReview[0]?.reviewStatus).toBe('stale');
            expect(report.summary.manualReviewOutstandingCount).toBe(1);
            expect(hasManualReviewCandidates(report)).toBe(true);
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('formats a worklist with review lanes and statuses', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'agents-audit-'));

        try {
            writeFixture(rootDir, 'src/large.ts', 'const value = 1;\n'.repeat(950));

            const report = auditAgentsConformance(rootDir);
            const worklist = formatAuditWorklist(report);

            expect(worklist).toContain('AGENTS audit worklist');
            expect(worklist).toContain('Handwritten source files requiring 900+ LOC review');
            expect(worklist).toContain('(new)');
            expect(worklist).toContain('filters: default-unresolved');
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('filters reviewed-clean items out of the default worklist and can show them explicitly', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'agents-audit-'));

        try {
            const content = 'const value = 1;\n'.repeat(950);
            writeFixture(rootDir, 'src/large.ts', content);
            writeFixture(
                rootDir,
                'scripts/audit/agents-review-manifest.json',
                JSON.stringify(
                    {
                        entries: [
                            {
                                path: 'src/large.ts',
                                category: 'handwritten-source-review',
                                contentHash: createHash('sha256').update(content).digest('hex').slice(0, 16),
                                status: 'reviewed-clean',
                                note: 'cohesive despite size',
                                reviewedAt: '2026-03-24',
                            },
                        ],
                    },
                    null,
                    2
                )
            );

            const report = auditAgentsConformance(rootDir);

            expect(formatAuditWorklist(report)).not.toContain('src/large.ts');
            expect(formatAuditWorklist(report, { includeReviewed: true })).toContain('src/large.ts');
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('filters reviewed actionable items out of the default worklist and unresolved counts', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'agents-audit-'));

        try {
            const content = `
                async function saveDraft(): Promise<void> {}
                function View(mutation: { mutateAsync: (input: { value: number }) => Promise<void> }) {
                    void saveDraft();
                    void mutation.mutateAsync({ value: 1 });
                    return null;
                }\n`;
            writeFixture(rootDir, 'src/view.tsx', content);
            writeFixture(
                rootDir,
                'scripts/audit/agents-review-manifest.json',
                JSON.stringify(
                    {
                        entries: [
                            {
                                path: 'src/view.tsx',
                                category: 'actionable-async-ownership',
                                contentHash: createHash('sha256').update(content).digest('hex').slice(0, 16),
                                status: 'reviewed-clean',
                                note: 'fail-closed by contract',
                                reviewedAt: '2026-03-25',
                            },
                        ],
                    },
                    null,
                    2
                )
            );

            const report = auditAgentsConformance(rootDir);

            expect(report.summary.unresolvedActionableCount).toBe(0);
            expect(report.summary.overallStatus).toBe('clean');
            expect(formatAuditWorklist(report)).not.toContain('src/view.tsx');
            expect(formatAuditWorklist(report, { includeReviewed: true })).toContain('src/view.tsx');
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('supports new-only and stale-only worklist filtering', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'agents-audit-'));

        try {
            const staleContent = 'const oldValue = 1;\n'.repeat(950);
            writeFixture(rootDir, 'src/large.ts', 'const nextValue = 1;\n'.repeat(950));
            writeFixture(rootDir, 'src/newLarge.ts', 'const value = 1;\n'.repeat(950));
            writeFixture(
                rootDir,
                'scripts/audit/agents-review-manifest.json',
                JSON.stringify(
                    {
                        entries: [
                            {
                                path: 'src/large.ts',
                                category: 'handwritten-source-review',
                                contentHash: createHash('sha256').update(staleContent).digest('hex').slice(0, 16),
                                status: 'reviewed-clean',
                                reviewedAt: '2026-03-24',
                            },
                        ],
                    },
                    null,
                    2
                )
            );

            const report = auditAgentsConformance(rootDir);

            expect(formatAuditWorklist(report, { staleOnly: true })).toContain('src/large.ts');
            expect(formatAuditWorklist(report, { staleOnly: true })).not.toContain('src/newLarge.ts');
            expect(formatAuditWorklist(report, { newOnly: true })).toContain('src/newLarge.ts');
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('records and removes review entries through the review command helper', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'agents-audit-'));

        try {
            writeFixture(rootDir, 'src/large.ts', 'const value = 1;\n'.repeat(950));
            writeFixture(rootDir, 'scripts/audit/agents-review-manifest.json', '{\n  "entries": []\n}\n');

            runAuditReviewCommandWithArgs({
                rootDir,
                args: [
                    '--path',
                    'src/large.ts',
                    '--category',
                    'handwritten-source-review',
                    '--status',
                    'reviewed-clean',
                    '--note',
                    'cohesive after review',
                ],
            });

            let manifest = loadReviewManifest(rootDir);
            expect(manifest.entries).toHaveLength(1);
            expect(manifest.entries[0]?.status).toBe('reviewed-clean');

            runAuditReviewCommandWithArgs({
                rootDir,
                args: ['--path', 'src/large.ts', '--category', 'handwritten-source-review', '--remove'],
            });

            manifest = loadReviewManifest(rootDir);
            expect(manifest.entries).toEqual([]);
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('refreshes stale review entries through the review command helper', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'agents-audit-'));

        try {
            const initialContent = 'const value = 1;\n'.repeat(950);
            const nextContent = 'const nextValue = 2;\n'.repeat(950);
            writeFixture(rootDir, 'src/large.ts', initialContent);
            writeFixture(rootDir, 'scripts/audit/agents-review-manifest.json', '{\n  "entries": []\n}\n');

            runAuditReviewCommandWithArgs({
                rootDir,
                args: [
                    '--path',
                    'src/large.ts',
                    '--category',
                    'handwritten-source-review',
                    '--status',
                    'reviewed-clean',
                ],
            });

            writeFixture(rootDir, 'src/large.ts', nextContent);

            runAuditReviewCommandWithArgs({
                rootDir,
                args: ['--refresh-stale'],
            });

            const manifest = loadReviewManifest(rootDir);
            expect(manifest.entries).toHaveLength(1);
            expect(manifest.entries[0]?.contentHash).toBe(
                createHash('sha256').update(nextContent).digest('hex').slice(0, 16)
            );
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('supports lane and category worklist filtering', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'agents-audit-'));

        try {
            writeFixture(
                rootDir,
                'src/view.tsx',
                'function View(query: { useQuery: Function }, value: unknown) { return query.useQuery({ sessionId: value as SessionId }); }\n'
            );
            writeFixture(rootDir, 'src/large.ts', 'const value = 1;\n'.repeat(950));

            const report = auditAgentsConformance(rootDir);

            const actionableWorklist = formatAuditWorklist(report, { lane: 'actionable-review' });
            expect(actionableWorklist).toContain('Call-site cast review');
            expect(actionableWorklist).not.toContain('Handwritten source files requiring 900+ LOC review');

            const categoryWorklist = formatAuditWorklist(report, { category: 'handwritten-source-review' });
            expect(categoryWorklist).toContain('src/large.ts');
            expect(categoryWorklist).not.toContain('Call-site cast review');
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });
});

