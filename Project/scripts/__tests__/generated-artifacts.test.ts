import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { checkGeneratedArtifacts } from '@/scripts/generated-artifacts';

describe('generated artifacts', () => {
    it('detects stale route generation without leaving the tracked file changed', async () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'generated-artifacts-'));
        const routeTreePath = path.join(rootDir, 'src', 'routeTree.gen.ts');
        mkdirSync(path.dirname(routeTreePath), { recursive: true });
        writeFileSync(routeTreePath, 'original route tree', 'utf8');

        try {
            const result = await checkGeneratedArtifacts({
                cwd: rootDir,
                routeTreePath,
                runner: (_command, args) => {
                    if (args.includes('generate')) {
                        writeFileSync(routeTreePath, 'updated route tree', 'utf8');
                    }
                    return Promise.resolve(0);
                },
            });

            expect(result).toEqual({
                status: 'stale',
                staleArtifacts: ['src/routeTree.gen.ts'],
            });
            expect(readFileSync(routeTreePath, 'utf8')).toBe('original route tree');
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });

    it('reports stale migrations from the migration checker', async () => {
        const rootDir = mkdtempSync(path.join(os.tmpdir(), 'generated-artifacts-'));
        const routeTreePath = path.join(rootDir, 'src', 'routeTree.gen.ts');
        mkdirSync(path.dirname(routeTreePath), { recursive: true });
        writeFileSync(routeTreePath, 'route tree', 'utf8');

        try {
            const result = await checkGeneratedArtifacts({
                cwd: rootDir,
                routeTreePath,
                runner: (_command, args) =>
                    Promise.resolve(args.some((argument) => argument.endsWith('generate-migrations.ts')) ? 1 : 0),
            });

            expect(result.status).toBe('stale');
            expect(result.staleArtifacts).toEqual(['electron/backend/persistence/generatedMigrations.ts']);
            expect(readFileSync(routeTreePath, 'utf8')).toBe('route tree');
        } finally {
            rmSync(rootDir, { recursive: true, force: true });
        }
    });
});
