import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
    checkMarketplaceCatalogFiles,
    formatMarketplaceCatalogCheckResult,
    resolveDefaultMarketplaceCatalogPaths,
    runMarketplaceCatalogCheckCli,
} from '@/scripts/marketplace-catalog';

function fixturePath(...segments: string[]): string {
    return path.join(process.cwd(), 'scripts', '__fixtures__', 'marketplace-catalog', ...segments);
}

function createBufferWriter(): { write: (chunk: string) => boolean; text: () => string } {
    const chunks: string[] = [];
    return {
        write: (chunk: string) => {
            chunks.push(chunk);
            return true;
        },
        text: () => chunks.join(''),
    };
}

describe('marketplace catalog check script', () => {
    it('validates the checked-in valid catalog fixture', async () => {
        const catalogPaths = resolveDefaultMarketplaceCatalogPaths();
        const result = await checkMarketplaceCatalogFiles({ catalogPaths });

        expect(result.status).toBe('passed');
        expect(result.catalogs).toEqual([
            expect.objectContaining({
                status: 'passed',
                packageCount: 3,
            }),
        ]);
        expect(formatMarketplaceCatalogCheckResult(result)).toContain('PASSED');
    });

    it('fails closed for checked-in invalid catalog fixtures', async () => {
        const result = await checkMarketplaceCatalogFiles({
            catalogPaths: [fixturePath('invalid', 'duplicate-package.v1.json')],
        });

        expect(result.status).toBe('failed');
        expect(result.catalogs[0]?.status).toBe('failed');
        expect(result.catalogs[0]?.packageCount).toBe(0);
        expect(result.catalogs[0]?.error).toMatch(/duplicate package identity/u);
    });

    it('returns a passing CLI exit code and readable output for the default check', async () => {
        const stdout = createBufferWriter();
        const stderr = createBufferWriter();
        const exitCode = await runMarketplaceCatalogCheckCli(['--check'], { stdout, stderr });

        expect(exitCode).toBe(0);
        expect(stdout.text()).toContain('Marketplace catalog check');
        expect(stdout.text()).toContain('status: passed');
        expect(stderr.text()).toBe('');
    });

    it('returns JSON output when requested', async () => {
        const stdout = createBufferWriter();
        const stderr = createBufferWriter();
        const exitCode = await runMarketplaceCatalogCheckCli(['--check', '--json'], { stdout, stderr });

        expect(exitCode).toBe(0);
        expect(JSON.parse(stdout.text())).toMatchObject({ status: 'passed' });
        expect(stderr.text()).toBe('');
    });

    it('rejects unknown CLI arguments', async () => {
        const stdout = createBufferWriter();
        const stderr = createBufferWriter();
        const exitCode = await runMarketplaceCatalogCheckCli(['--mutate'], { stdout, stderr });

        expect(exitCode).toBe(1);
        expect(stdout.text()).toBe('');
        expect(stderr.text()).toContain('Unknown marketplace catalog check argument');
    });
});
