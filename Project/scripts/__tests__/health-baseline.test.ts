import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildHealthBaselineReport, formatHealthBaselineWorklist } from '@/scripts/health-baseline';

function writeFixture(rootDir: string, relativePath: string, content: string): void {
    const absolutePath = path.join(rootDir, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, 'utf8');
}

function repeatedLines(count: number): string {
    return Array.from({ length: count }, () => 'const value = 1;').join('\n');
}

describe('health baseline', () => {
    it('reports known shell approval prefix broadening as a blocking baseline item', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'health-baseline-'));

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

            const report = buildHealthBaselineReport(rootDir);

            expect(report.repairBaseline.findings).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        id: 'p0-shell-approval-prefix-broadening',
                        priority: 'P0',
                    }),
                ])
            );
            expect(report.status).toBe('blocked');
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('combines durable repair and test-health findings in one worklist', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'health-baseline-'));

        try {
            writeFixture(
                rootDir,
                'electron/backend/runtime/services/workspaceContext/service.ts',
                'const unresolved = "Unresolved workspace root";\n'
            );
            writeFixture(rootDir, 'src/large.test.ts', repeatedLines(1200));

            const worklist = formatHealthBaselineWorklist(buildHealthBaselineReport(rootDir));

            expect(worklist).toContain('Health baseline worklist');
            expect(worklist).toContain('p0-unresolved-workspace-sentinel');
            expect(worklist).toContain('p1-oversized-test-file:src/large.test.ts');
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });
});
