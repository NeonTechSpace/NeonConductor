import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { resolveViteConfig } from 'vite-plugin-electron';
import { afterEach, describe, expect, it } from 'vitest';

import { createPreloadBuildConfig } from '@/app/main/preload/buildConfig';
import { preloadBundleUsesUnsupportedModuleSyntax } from '@/app/main/window/preloadBundleSyntax';

describe('preload build config', () => {
    const temporaryDirectories: string[] = [];

    afterEach(() => {
        for (const temporaryDirectory of temporaryDirectories.splice(0)) {
            rmSync(temporaryDirectory, {
                force: true,
                recursive: true,
            });
        }
    });

    it.each([
        {
            entry: 'electron/main/preload/index.ts',
            outputFileName: 'mainWindow',
        },
        {
            entry: 'electron/main/preload/splash.ts',
            outputFileName: 'splashWindow',
        },
    ])('emits sandbox-safe commonjs preload bundles for $outputFileName', async ({ entry, outputFileName }) => {
        const outDir = mkdtempSync(path.join(os.tmpdir(), 'neon-preload-build-'));
        temporaryDirectories.push(outDir);

        await build({
            configFile: false,
            root: process.cwd(),
            ...createPreloadBuildConfig(entry, outputFileName, { outDir }),
        });

        const bundleSource = readFileSync(path.join(outDir, `${outputFileName}.cjs`), 'utf8');

        expect(preloadBundleUsesUnsupportedModuleSyntax(bundleSource)).toBe(false);
        expect(bundleSource).toContain('require("electron")');
    });

    it('stays on commonjs when merged through vite-plugin-electron without a top-level entry override', () => {
        const resolvedConfig = resolveViteConfig({
            vite: createPreloadBuildConfig('electron/main/preload/splash.ts', 'splashWindow'),
        });
        const buildConfig = resolvedConfig.build;

        expect(buildConfig).toBeDefined();

        expect(buildConfig?.lib).toMatchObject({
            entry: 'electron/main/preload/splash.ts',
            formats: ['cjs'],
        });
        expect(buildConfig?.rolldownOptions?.output).toMatchObject({
            codeSplitting: false,
            format: 'cjs',
        });
    });
});
