import { builtinModules } from 'node:module';
import { build } from 'vite';
import { resolveViteConfig } from 'vite-plugin-electron';
import { describe, expect, it } from 'vitest';

import {
    createElectronMainBuildConfig,
    isElectronMainExternalModule,
} from '@/app/main/buildConfig';

describe('electron main build config', () => {
    it('keeps Node builtins external so the main bundle does not inline buffer machinery', () => {
        const resolvedConfig = resolveViteConfig({
            vite: createElectronMainBuildConfig(),
        });
        const buildConfig = resolvedConfig.build;

        expect(buildConfig).toBeDefined();
        expect(buildConfig?.rolldownOptions?.external).toBe(isElectronMainExternalModule);
        expect(isElectronMainExternalModule('buffer')).toBe(true);
        expect(isElectronMainExternalModule('node:buffer')).toBe(true);
        expect(isElectronMainExternalModule('electron')).toBe(true);
        expect(isElectronMainExternalModule('electron-updater')).toBe(true);
        expect(isElectronMainExternalModule('ws')).toBe(true);
        expect(
            builtinModules
                .filter((moduleName) => !moduleName.startsWith('_'))
                .flatMap((moduleName) => [moduleName, `node:${moduleName}`])
                .every((moduleName) => isElectronMainExternalModule(moduleName))
        ).toBe(true);
        expect(isElectronMainExternalModule('iconv-lite')).toBe(false);
    });

    it('does not reintroduce iconv-lite safer-buffer baggage into the built Electron main bundle', async () => {
        const config = createElectronMainBuildConfig();
        const buildOutput = await build({
            configFile: false,
            root: process.cwd(),
            ...config,
            build: {
                ...config.build,
                lib: {
                    entry: 'electron/main/index.ts',
                    formats: ['es'],
                    fileName: () => 'index.js',
                },
                minify: false,
                reportCompressedSize: false,
                write: false,
            },
            logLevel: 'error',
            publicDir: false,
            envFile: false,
        });
        const outputs = Array.isArray(buildOutput) ? buildOutput : [buildOutput];
        const mainChunk = outputs
            .flatMap((output) => ('output' in output ? output.output : []))
            .find((chunk) => chunk.type === 'chunk' && chunk.fileName === 'index.js');

        expect(mainChunk).toBeDefined();
        if (!mainChunk || mainChunk.type !== 'chunk') {
            throw new Error('Expected the Electron main build to emit an index.js chunk.');
        }

        expect(mainChunk.code).not.toContain('iconv-lite');
        expect(mainChunk.code).not.toContain('safer-buffer');
        expect(mainChunk.code).not.toContain('require("buffer")');
    });
});
