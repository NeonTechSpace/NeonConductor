import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildTestHealthReport, classifyTestPath } from '@/scripts/test-health';

function writeFixture(rootDir: string, relativePath: string, content: string): void {
    const targetPath = path.join(rootDir, relativePath);
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, content, 'utf8');
}

describe('test health', () => {
    it('classifies durable test ownership lanes', () => {
        expect(classifyTestPath('electron/backend/runtime/services/memory/retrieval.test.ts')).toBe('runtime');
        expect(classifyTestPath('electron/backend/trpc/__tests__/runtime-contracts.memory.test.ts')).toBe(
            'trpc-contract'
        );
        expect(classifyTestPath('src/components/settings/settingsWorkspace.test.tsx')).toBe('renderer-settings');
        expect(classifyTestPath('scripts/__tests__/health.test.ts')).toBe('scripts');
    });

    it('blocks oversized test files', () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'test-health-'));
        try {
            writeFixture(rootDir, 'src/small.test.ts', 'expect(true).toBe(true);\n');
            writeFixture(rootDir, 'src/large.test.ts', 'expect(true).toBe(true);\n'.repeat(1200));

            const report = buildTestHealthReport(rootDir);

            expect(report.status).toBe('blocked');
            expect(report.findings).toEqual([
                expect.objectContaining({
                    id: 'p1-oversized-test-file:src/large.test.ts',
                    path: 'src/large.test.ts',
                    line: 1200,
                }),
            ]);
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });
});
