import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { closePersistence, getPersistence, initializePersistence } from '@/app/backend/persistence/db';

export interface ReleasedDbUpgradeFixtureResult {
    status: 'no-fixtures' | 'passed';
    checkedFixtures: string[];
}

export function listReleasedDbFixtures(fixturesDir: string): string[] {
    if (!existsSync(fixturesDir)) {
        return [];
    }

    return readdirSync(fixturesDir)
        .filter((filename) => filename.endsWith('.db') || filename.endsWith('.sqlite'))
        .sort((left, right) => left.localeCompare(right));
}

export function checkReleasedDbUpgradeFixtures(
    fixturesDir = path.join(process.cwd(), 'electron', 'backend', 'persistence', '__fixtures__', 'released-db')
): ReleasedDbUpgradeFixtureResult {
    const fixtureNames = listReleasedDbFixtures(fixturesDir);
    if (fixtureNames.length === 0) {
        return {
            status: 'no-fixtures',
            checkedFixtures: [],
        };
    }

    const tempDir = path.join(os.tmpdir(), `neonconductor-db-upgrade-${String(process.pid)}`);
    mkdirSync(tempDir, { recursive: true });

    try {
        for (const fixtureName of fixtureNames) {
            const fixturePath = path.join(fixturesDir, fixtureName);
            const dbPath = path.join(tempDir, fixtureName);
            copyFileSync(fixturePath, dbPath);
            initializePersistence({
                dbPath,
                forceReinitialize: true,
            });
            const profileCount = getPersistence().sqlite.prepare('SELECT COUNT(*) AS count FROM profiles').get() as {
                count: number;
            };
            if (profileCount.count < 1) {
                throw new Error(`Released DB fixture "${fixtureName}" did not contain a seeded profile after upgrade.`);
            }
            closePersistence();
        }
    } finally {
        closePersistence();
        rmSync(tempDir, { recursive: true, force: true });
    }

    return {
        status: 'passed',
        checkedFixtures: fixtureNames,
    };
}

function isDirectExecution(importMetaUrl: string): boolean {
    const entryPath = process.argv[1];
    if (!entryPath) {
        return false;
    }

    return importMetaUrl === pathToFileURL(path.resolve(entryPath)).href;
}

if (isDirectExecution(import.meta.url)) {
    const result = checkReleasedDbUpgradeFixtures();
    process.stdout.write(`Released DB upgrade fixtures: ${result.status}\n`);
}
