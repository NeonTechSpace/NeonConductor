import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildRepairFirstReport, formatRepairFirstWorklist } from '@/scripts/audit/repairFirstRules';
import { hasRepairFirstFindings } from '@/scripts/audit-repair-first';

function writeFixture(rootDir: string, relativePath: string, content: string): void {
    const absolutePath = path.join(rootDir, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, 'utf8');
}

function repeatedLines(count: number): string {
    return Array.from({ length: count }, () => 'const value = 1;').join('\n');
}

describe('repair-first audit', () => {
    it('reports known shell approval prefix broadening as a P0 repair item', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'repair-first-audit-'));

        try {
            writeFixture(
                rootDir,
                'electron/backend/runtime/services/toolExecution/shellApproval.ts',
                [
                    'function buildPrefixResource(prefix: string): string {',
                    '  return `tool:run_command:prefix:${prefix}`;',
                    '}',
                    'export function buildShellApprovalContext() {',
                    '  const approvalCandidates = [{ detail: "Allow commands that start with test" }];',
                    '  return { overrideResources: approvalCandidates.map((candidate) => candidate.resource) };',
                    '}',
                ].join('\n')
            );

            const report = buildRepairFirstReport(rootDir);

            expect(report.findings).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: 'p0-shell-approval-prefix-broadening',
                        priority: 'P0',
                    }),
                ])
            );
            expect(hasRepairFirstFindings(report)).toBe(true);
            expect(report.status).toBe('blocked');
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('flags non-generated production source at the hard line limit but excludes tests and generated files', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'repair-first-audit-'));

        try {
            writeFixture(rootDir, 'src/tooLarge.ts', repeatedLines(1500));
            writeFixture(rootDir, 'src/tooLarge.test.ts', repeatedLines(1500));
            writeFixture(rootDir, 'electron/backend/persistence/generatedMigrations.ts', repeatedLines(1500));

            const report = buildRepairFirstReport(rootDir);
            const hardLimitFindings = report.findings.filter((finding) =>
                finding.id.startsWith('p1-hard-source-line-limit:')
            );

            expect(hardLimitFindings).toHaveLength(1);
            expect(hardLimitFindings[0]).toMatchObject({
                priority: 'P1',
                path: 'src/tooLarge.ts',
                line: 1500,
            });
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('formats the worklist in priority order', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'repair-first-audit-'));

        try {
            writeFixture(
                rootDir,
                'electron/backend/runtime/services/workspaceContext/service.ts',
                'const unresolved = "Unresolved workspace root";\n'
            );
            writeFixture(rootDir, 'src/components/conversation/panels/devBrowserPanel.tsx', repeatedLines(900));

            const worklist = formatRepairFirstWorklist(buildRepairFirstReport(rootDir));

            expect(worklist.indexOf('## P0')).toBeGreaterThanOrEqual(0);
            expect(worklist.indexOf('## P2')).toBeGreaterThan(worklist.indexOf('## P0'));
            expect(worklist).toContain('p0-unresolved-workspace-sentinel');
            expect(worklist).toContain('p2-dev-browser-panel-controller-split');
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });
});
