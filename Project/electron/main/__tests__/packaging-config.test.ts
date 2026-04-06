import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveElectronChildEnv } from '@/app/main/runtime/electronChildEnv';

describe('electron-builder packaging config', () => {
    it('keeps packaging focused on runtime bundles only', () => {
        const configPath = path.join(process.cwd(), 'electron-builder.json5');
        const contents = readFileSync(configPath, 'utf8');

        expect(contents).toContain("files: ['dist', 'dist-electron']");
        expect(contents).toContain("from: 'src/assets/appicon.png'");
        expect(contents).toContain("to: 'assets/appicon.png'");
    });

    it('uses explicit cross-platform artifact names for release publishing', () => {
        const configPath = path.join(process.cwd(), 'electron-builder.json5');
        const contents = readFileSync(configPath, 'utf8');

        expect(contents).toContain("artifactName: 'NeonConductor-Windows-${version}-Setup.${ext}'");
        expect(contents).toContain("artifactName: 'NeonConductor-Mac-${arch}-${version}-Installer.${ext}'");
        expect(contents).toContain("artifactName: 'NeonConductor-Linux-${arch}-${version}.${ext}'");
    });

    it('keeps package main pointed at the Electron main bundle entry', () => {
        const packagePath = path.join(process.cwd(), 'package.json');
        const contents = JSON.parse(readFileSync(packagePath, 'utf8')) as {
            main: string;
        };

        expect(contents.main).toBe('dist-electron/index.js');
    });

    it('keeps the splash page and named preload bundles in the desktop build config', () => {
        const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
        const mainBuildConfigPath = path.join(process.cwd(), 'electron', 'main', 'buildConfig.ts');
        const preloadBuildConfigPath = path.join(process.cwd(), 'electron', 'main', 'preload', 'buildConfig.ts');
        const splashHtmlPath = path.join(process.cwd(), 'splash.html');
        const contents = readFileSync(viteConfigPath, 'utf8');
        const mainBuildConfigContents = readFileSync(mainBuildConfigPath, 'utf8');
        const preloadBuildConfigContents = readFileSync(preloadBuildConfigPath, 'utf8');

        expect(readFileSync(splashHtmlPath, 'utf8')).toContain('/src/splash/main.ts');
        expect(contents).toContain('createElectronMainBuildConfig');
        expect(contents).toContain("buildPreloadOptions('electron/main/preload/index.ts', 'mainWindow')");
        expect(contents).toContain("buildPreloadOptions('electron/main/preload/splash.ts', 'splashWindow')");
        expect(contents).toContain('createPreloadBuildConfig');
        expect(contents).toContain("splash: 'splash.html'");
        expect(mainBuildConfigContents).toContain('isElectronMainExternalModule');
        expect(preloadBuildConfigContents).toContain('.cjs');
    });

    it('keeps route auto code splitting enabled while excluding tsr split virtual modules from the Babel compiler pass', () => {
        const viteConfigPath = path.join(process.cwd(), 'vite.config.ts');
        const contents = readFileSync(viteConfigPath, 'utf8');

        expect(contents).toContain('autoCodeSplitting: true');
        expect(contents).toContain('exclude: /\\?tsr-split=/');
        expect(contents).toContain("plugins: ['jsx', 'typescript']");
    });

    it('sanitizes the Electron child environment', () => {
        const childEnv = resolveElectronChildEnv({
            ELECTRON_RUN_AS_NODE: '1',
            PATH: 'test-path',
        });

        expect(childEnv.ELECTRON_RUN_AS_NODE).toBeUndefined();
        expect(childEnv.PATH).toBe('test-path');
    });
});
