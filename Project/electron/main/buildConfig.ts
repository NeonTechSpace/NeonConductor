import { builtinModules } from 'node:module';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { UserConfig } from 'vite';

const requireFromBuildConfig = createRequire(import.meta.url);
const builtinExternalModules = builtinModules
    .filter((moduleName) => !moduleName.startsWith('_'))
    .flatMap((moduleName) => [moduleName, `node:${moduleName}`]);
const yamlBrowserEntry = path.join(path.dirname(requireFromBuildConfig.resolve('yaml/package.json')), 'browser/index.js');

export function isElectronMainExternalModule(moduleId: string): boolean {
    return (
        moduleId === 'electron' ||
        moduleId === 'electron-updater' ||
        moduleId === 'ws' ||
        moduleId === '@modelcontextprotocol/sdk' ||
        moduleId.startsWith('@modelcontextprotocol/sdk/') ||
        builtinExternalModules.includes(moduleId)
    );
}

export function createElectronMainBuildConfig(options?: { outDir?: string }): UserConfig {
    return {
        resolve: {
            tsconfigPaths: true,
            alias: {
                yaml: yamlBrowserEntry,
            },
        },
        build: {
            ...(options?.outDir ? { outDir: options.outDir } : {}),
            rolldownOptions: {
                external: isElectronMainExternalModule,
            },
        },
    };
}
