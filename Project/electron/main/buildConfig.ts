import { builtinModules } from 'node:module';

import type { UserConfig } from 'vite';

const builtinExternalModules = builtinModules
    .filter((moduleName) => !moduleName.startsWith('_'))
    .flatMap((moduleName) => [moduleName, `node:${moduleName}`]);

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
        },
        build: {
            ...(options?.outDir ? { outDir: options.outDir } : {}),
            rolldownOptions: {
                external: isElectronMainExternalModule,
            },
        },
    };
}
