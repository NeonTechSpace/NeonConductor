import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { listReleasedDbFixtures } from '@/scripts/released-db-upgrade-fixtures';

describe('released DB upgrade fixtures', () => {
    const temporaryDirectories: string[] = [];

    afterEach(() => {
        for (const temporaryDirectory of temporaryDirectories.splice(0)) {
            rmSync(temporaryDirectory, { recursive: true, force: true });
        }
    });

    it('allows first alpha to have no released database fixtures yet', () => {
        const fixturesDir = path.join(os.tmpdir(), 'neonconductor-missing-released-fixtures');

        expect(listReleasedDbFixtures(fixturesDir)).toEqual([]);
    });

    it('discovers released SQLite fixtures deterministically', () => {
        const fixturesDir = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-released-fixtures-'));
        temporaryDirectories.push(fixturesDir);
        mkdirSync(fixturesDir, { recursive: true });
        writeFileSync(path.join(fixturesDir, '002-beta.db'), '');
        writeFileSync(path.join(fixturesDir, '001-alpha.sqlite'), '');
        writeFileSync(path.join(fixturesDir, 'README.md'), '');

        expect(listReleasedDbFixtures(fixturesDir)).toEqual(['001-alpha.sqlite', '002-beta.db']);
    });
});
