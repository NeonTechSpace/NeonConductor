import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { parseMarketplaceGeneratedCatalog } from '@/app/backend/runtime/contracts/parsers/marketplace';

export type MarketplaceCatalogCheckStatus = 'passed' | 'failed';

export interface MarketplaceCatalogCheckEntry {
    filePath: string;
    status: MarketplaceCatalogCheckStatus;
    packageCount: number;
    error?: string;
}

export interface MarketplaceCatalogCheckResult {
    status: MarketplaceCatalogCheckStatus;
    catalogs: MarketplaceCatalogCheckEntry[];
}

export interface MarketplaceCatalogCheckOptions {
    cwd?: string;
    catalogPaths?: string[];
}

interface MarketplaceCatalogCheckWriter {
    write: (text: string) => unknown;
}

interface MarketplaceCatalogCheckCliIo {
    stdout: MarketplaceCatalogCheckWriter;
    stderr: MarketplaceCatalogCheckWriter;
}

function isDirectExecution(importMetaUrl: string): boolean {
    const entryPath = process.argv[1];
    if (!entryPath) {
        return false;
    }

    return importMetaUrl === pathToFileURL(path.resolve(entryPath)).href;
}

export function resolveDefaultMarketplaceCatalogPaths(cwd = process.cwd()): string[] {
    return [path.join(cwd, 'scripts', '__fixtures__', 'marketplace-catalog', 'valid', 'catalog.v1.json')];
}

async function checkMarketplaceCatalogFile(filePath: string): Promise<MarketplaceCatalogCheckEntry> {
    try {
        const text = await readFile(filePath, 'utf8');
        const parsed = JSON.parse(text) as unknown;
        const catalog = parseMarketplaceGeneratedCatalog(parsed);
        return {
            filePath,
            status: 'passed',
            packageCount: catalog.packages.length,
        };
    } catch (error) {
        return {
            filePath,
            status: 'failed',
            packageCount: 0,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

export async function checkMarketplaceCatalogFiles(
    options: MarketplaceCatalogCheckOptions = {}
): Promise<MarketplaceCatalogCheckResult> {
    const cwd = options.cwd ?? process.cwd();
    const catalogPaths = options.catalogPaths ?? resolveDefaultMarketplaceCatalogPaths(cwd);
    if (catalogPaths.length === 0) {
        return {
            status: 'failed',
            catalogs: [
                {
                    filePath: cwd,
                    status: 'failed',
                    packageCount: 0,
                    error: 'No marketplace catalog files were provided.',
                },
            ],
        };
    }

    const catalogs = await Promise.all(catalogPaths.map((catalogPath) => checkMarketplaceCatalogFile(catalogPath)));
    return {
        status: catalogs.some((catalog) => catalog.status === 'failed') ? 'failed' : 'passed',
        catalogs,
    };
}

export function formatMarketplaceCatalogCheckResult(
    result: MarketplaceCatalogCheckResult,
    cwd = process.cwd()
): string {
    const lines = ['Marketplace catalog check', `status: ${result.status}`, ''];

    for (const catalog of result.catalogs) {
        const relativePath = path.relative(cwd, catalog.filePath) || catalog.filePath;
        const detail =
            catalog.status === 'passed'
                ? `${String(catalog.packageCount)} packages`
                : (catalog.error ?? 'unknown error');
        lines.push(`- ${catalog.status.toUpperCase()} ${relativePath} (${detail})`);
    }

    return lines.join('\n');
}

export async function runMarketplaceCatalogCheckCli(
    args = process.argv.slice(2),
    io: MarketplaceCatalogCheckCliIo = { stdout: process.stdout, stderr: process.stderr },
    cwd = process.cwd()
): Promise<number> {
    const unknownArgs = args.filter((arg) => arg !== '--check' && arg !== '--json');
    if (unknownArgs.length > 0) {
        io.stderr.write(`Unknown marketplace catalog check argument: ${unknownArgs.join(', ')}\n`);
        return 1;
    }

    const result = await checkMarketplaceCatalogFiles({ cwd });
    if (args.includes('--json')) {
        io.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
        io.stdout.write(`${formatMarketplaceCatalogCheckResult(result, cwd)}\n`);
    }

    return result.status === 'passed' ? 0 : 1;
}

if (isDirectExecution(import.meta.url)) {
    runMarketplaceCatalogCheckCli()
        .then((exitCode) => {
            process.exitCode = exitCode;
        })
        .catch((error: unknown) => {
            process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
            process.exitCode = 1;
        });
}
